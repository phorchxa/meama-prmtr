-- ============================================================
-- MEAMA PRMTR — 0004 portfolio_customers materialized view
-- Source: customers_georgia + meama_georgia_orders +
--         meama_georgia_order_items + products_georgia
-- Business rules:
--   • Retail only: source IN ('web','pos','195189899265')
--   • Valid order: financial_status <> 'voided' AND cancelled_at IS NULL
--   • Machine: order_items.sku → products_georgia.variant_sku (title fallback)
--              product_type IN ('Machine','Machine (POS)')
--   • machine_model: title of most-recent Machine line item
--   • OTP email: LIKE '%@otp.customer.meama.ge' → phone_only = true
--   • Region: shipping_city from most-recent order, normalised
--   • Status: new(1 order) | active(<45d) | at_risk(45-89d) | lost(≥90d)
--   • Segment: new_machine | loyalist | lapsed | at_risk | active
--   • Health score 0-100: recency(40) + frequency(35) + spend quality(25)
--   • Channel: web→online | pos→in_store | 195189899265→app | both→mixed
--   • PII: full real name, email, phone exposed (no masking)
-- Refresh: SELECT refresh_portfolio_customers();
-- ============================================================

-- Raise timeout for this session; MATVIEW build is ~30-90s on 553k items.
SET statement_timeout = '180s';

DROP MATERIALIZED VIEW IF EXISTS portfolio_customers CASCADE;

CREATE MATERIALIZED VIEW portfolio_customers AS
WITH

-- 1. valid retail orders
retail_orders AS (
    SELECT
        o.shopify_order_id,
        o.customer_id,
        o.total,
        o.processed_at,
        o.source,
        o.shipping_city,
        o.shipping_method,
        o.location,
        o.discount_code,
        o.discount_amount
    FROM meama_georgia_orders o
    WHERE o.financial_status <> 'voided'
      AND o.cancelled_at IS NULL
      AND o.source IN ('web', 'pos', '195189899265')
),

-- 2. most-recent non-empty shipping_city per customer
latest_city AS (
    SELECT DISTINCT ON (customer_id)
        customer_id,
        shipping_city
    FROM retail_orders
    WHERE shipping_city IS NOT NULL
      AND TRIM(shipping_city) <> ''
    ORDER BY customer_id, processed_at DESC NULLS LAST
),

-- 3. per-customer order aggregates (no joins to order_items)
cust_agg AS (
    SELECT
        customer_id,
        COUNT(*)::int                                                              AS order_count,
        COALESCE(SUM(total) FILTER (WHERE total > 0), 0)                          AS total_spend,
        COUNT(*) FILTER (WHERE discount_amount > 0 OR (discount_code IS NOT NULL AND discount_code <> ''))::int
                                                                                   AS promo_orders,
        COALESCE(SUM(total) FILTER (WHERE discount_amount > 0 OR (discount_code IS NOT NULL AND discount_code <> '')), 0)
                                                                                   AS promo_spend,
        COALESCE(SUM(total) FILTER (WHERE (discount_amount IS NULL OR discount_amount = 0)
                                      AND (discount_code IS NULL OR discount_code = '')
                                      AND total > 0), 0)                           AS full_price_spend,
        MIN(processed_at)                                                          AS first_order_at,
        MAX(processed_at)                                                          AS last_order_at,
        COUNT(DISTINCT DATE_TRUNC('month', processed_at))::int                    AS active_months,
        SUM(CASE WHEN source = 'web'          THEN 1 ELSE 0 END)::int             AS ecommerce_orders,
        SUM(CASE WHEN source = 'pos'          THEN 1 ELSE 0 END)::int             AS brand_store_orders,
        SUM(CASE WHEN source = '195189899265' THEN 1 ELSE 0 END)::int             AS app_orders,
        CASE
            WHEN SUM(CASE WHEN source = 'web' THEN 1 ELSE 0 END) > 0
             AND SUM(CASE WHEN source = 'pos' THEN 1 ELSE 0 END) > 0 THEN 'mixed'
            WHEN SUM(CASE WHEN source = 'web'          THEN 1 ELSE 0 END) > 0 THEN 'online'
            WHEN SUM(CASE WHEN source = 'pos'          THEN 1 ELSE 0 END) > 0 THEN 'in_store'
            WHEN SUM(CASE WHEN source = '195189899265' THEN 1 ELSE 0 END) > 0 THEN 'app'
            ELSE 'online'
        END                                                                        AS channel
    FROM retail_orders
    WHERE customer_id IS NOT NULL
    GROUP BY customer_id
),

-- 4a. Unique (title, product_type) pairs from products_georgia to prevent
--     multi-variant inflation when falling back to title matching.
pg_by_title AS (
    SELECT DISTINCT ON (LOWER(TRIM(title)))
        title,
        product_type,
        flavor_profile,
        capsule_format,
        package_type,
        variant_sku,
        variant_price,
        preferred_machine
    FROM products_georgia
    WHERE title IS NOT NULL AND TRIM(title) <> ''
      AND product_type IS NOT NULL AND TRIM(product_type) <> ''
    ORDER BY LOWER(TRIM(title)), variant_sku
),

-- 4b. Consolidated item details: SKU join first, title fallback for empty-SKU rows.
--     Feeds machine_purchases, type_counts AND top_item in one scan.
item_details AS (
    -- Primary: SKU-based match
    SELECT
        ro.shopify_order_id,
        ro.customer_id,
        ro.processed_at,
        oi.title                                                                        AS item_title,
        oi.quantity                                                                     AS quantity,
        oi.price                                                                        AS item_price,
        pg.title                                                                        AS product_title,
        REGEXP_REPLACE(pg.product_type, '\s*\(POS\)\s*$', '', 'i')                    AS pt,
        pg.flavor_profile,
        pg.capsule_format,
        pg.package_type,
        pg.variant_sku,
        pg.variant_price,
        pg.preferred_machine,
        pb."Intensity level"                                                           AS bible_intensity_level,
        pb."Compatible with"                                                           AS bible_compatible_with,
        pb."Collection"                                                                AS bible_collection,
        pb."Beverage Type"                                                             AS bible_beverage_type
    FROM retail_orders ro
    JOIN meama_georgia_order_items oi ON oi.shopify_order_id = ro.shopify_order_id
    JOIN products_georgia pg          ON pg.variant_sku = oi.sku
    LEFT JOIN "Meama Products Bible" pb
                                      ON LOWER(TRIM(pb."Fina Code")) = LOWER(TRIM(pg.variant_sku))
    WHERE oi.sku IS NOT NULL
      AND oi.sku <> ''
      AND ro.customer_id IS NOT NULL
      AND pg.product_type IS NOT NULL AND TRIM(pg.product_type) <> ''

    UNION ALL

    -- Fallback: title-based match for empty-SKU rows
    SELECT
        ro.shopify_order_id,
        ro.customer_id,
        ro.processed_at,
        oi.title,
        oi.quantity,
        oi.price,
        pg_by_title.title,
        REGEXP_REPLACE(pg_by_title.product_type, '\s*\(POS\)\s*$', '', 'i'),
        pg_by_title.flavor_profile,
        pg_by_title.capsule_format,
        pg_by_title.package_type,
        pg_by_title.variant_sku,
        pg_by_title.variant_price,
        pg_by_title.preferred_machine,
        pb."Intensity level",
        pb."Compatible with",
        pb."Collection",
        pb."Beverage Type"
    FROM retail_orders ro
    JOIN meama_georgia_order_items oi   ON oi.shopify_order_id = ro.shopify_order_id
    JOIN pg_by_title                    ON LOWER(TRIM(pg_by_title.title)) = LOWER(TRIM(oi.title))
    LEFT JOIN "Meama Products Bible" pb
                                        ON LOWER(TRIM(pb."Fina Code")) = LOWER(TRIM(pg_by_title.variant_sku))
    WHERE (oi.sku IS NULL OR oi.sku = '')
      AND ro.customer_id IS NOT NULL
),

-- 5. Machine purchases from item_details
machine_purchases AS (
    SELECT customer_id, processed_at, product_title AS machine_title
    FROM item_details
    WHERE pt = 'Machine'
),

-- 5b. Capsule rows: normalized product type first, title fallback second.
capsule_items AS (
    SELECT *
    FROM item_details
    WHERE (
        LOWER(COALESCE(pt, '')) LIKE '%capsule%'
        OR LOWER(COALESCE(item_title, '')) LIKE '%capsule%'
        OR LOWER(COALESCE(product_title, '')) LIKE '%capsule%'
    )
      AND COALESCE(quantity, 0) > 0
),

-- 6. Per-customer machine summary: has_machine flag + most recent model
customer_machine AS (
    SELECT DISTINCT ON (customer_id)
        customer_id,
        machine_title AS machine_model
    FROM machine_purchases
    ORDER BY customer_id, processed_at DESC NULLS LAST
),

machine_first AS (
    SELECT
        customer_id,
        MIN(processed_at) AS machine_acquisition_date
    FROM machine_purchases
    GROUP BY customer_id
),

capsule_metrics AS (
    SELECT
        customer_id,
        COUNT(DISTINCT shopify_order_id)::int                              AS capsule_order_count,
        COALESCE(SUM(quantity), 0)::numeric                                AS capsule_quantity,
        COALESCE(SUM(quantity * item_price), 0)::numeric                   AS capsule_spend,
        CASE
            WHEN COALESCE(SUM(quantity), 0) > 0
            THEN ROUND((SUM(quantity * item_price) / SUM(quantity))::numeric, 2)
            ELSE NULL
        END                                                                AS avg_capsule_price,
        MIN(processed_at)                                                  AS first_capsule_order_at,
        MAX(processed_at)                                                  AS last_capsule_order_at
    FROM capsule_items
    GROUP BY customer_id
),

capsule_price_ranked AS (
    SELECT
        customer_id,
        avg_capsule_price,
        NTILE(3) OVER (ORDER BY avg_capsule_price) AS price_bucket
    FROM capsule_metrics
    WHERE avg_capsule_price IS NOT NULL
),

-- 7. Count non-machine product types per customer
type_counts AS (
    SELECT customer_id, pt, COUNT(*) AS cnt
    FROM item_details
    WHERE pt IS NOT NULL AND TRIM(pt) <> ''
      AND pt NOT IN ('Machine', 'Machine Part')
    GROUP BY customer_id, pt
),

-- 8. Top 3 non-machine product types per customer
top_categories AS (
    SELECT customer_id, ARRAY_AGG(pt ORDER BY cnt DESC) AS top_product_types
    FROM (
        SELECT
            customer_id, pt, cnt,
            ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY cnt DESC) AS rn
        FROM type_counts
    ) ranked
    WHERE rn <= 3
    GROUP BY customer_id
),

-- 9. Top non-machine item title per customer (most ordered)
item_title_cnt AS (
    SELECT customer_id, item_title, COUNT(*) AS cnt
    FROM item_details
    WHERE pt IS NOT NULL AND pt NOT IN ('Machine', 'Machine Part')
      AND item_title IS NOT NULL AND TRIM(item_title) <> ''
    GROUP BY customer_id, item_title
),

top_item AS (
    SELECT DISTINCT ON (customer_id)
        customer_id,
        item_title AS top_item_title
    FROM item_title_cnt
    ORDER BY customer_id, cnt DESC
),

flavor_counts AS (
    SELECT
        ci.customer_id,
        flavor,
        SUM(ci.quantity) AS qty
    FROM capsule_items ci
    CROSS JOIN LATERAL UNNEST(COALESCE(ci.flavor_profile, ARRAY[]::text[])) AS f(flavor)
    WHERE flavor IS NOT NULL AND TRIM(flavor) <> ''
    GROUP BY ci.customer_id, flavor
),

top_flavors AS (
    SELECT customer_id, ARRAY_AGG(flavor ORDER BY qty DESC, flavor) AS top_flavors
    FROM (
        SELECT
            customer_id,
            flavor,
            qty,
            ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY qty DESC, flavor) AS rn
        FROM flavor_counts
    ) ranked
    WHERE rn <= 3
    GROUP BY customer_id
),

format_counts AS (
    SELECT
        customer_id,
        COALESCE(NULLIF(TRIM(capsule_format), ''), NULLIF(TRIM(package_type), ''), pt) AS format_preference,
        SUM(quantity) AS qty
    FROM capsule_items
    WHERE COALESCE(NULLIF(TRIM(capsule_format), ''), NULLIF(TRIM(package_type), ''), pt) IS NOT NULL
    GROUP BY customer_id, COALESCE(NULLIF(TRIM(capsule_format), ''), NULLIF(TRIM(package_type), ''), pt)
),

top_formats AS (
    SELECT customer_id, ARRAY_AGG(format_preference ORDER BY qty DESC, format_preference) AS format_preferences
    FROM (
        SELECT
            customer_id,
            format_preference,
            qty,
            ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY qty DESC, format_preference) AS rn
        FROM format_counts
    ) ranked
    WHERE rn <= 3
    GROUP BY customer_id
),

intensity_profile AS (
    SELECT
        customer_id,
        ROUND(
            (
                SUM(
                    NULLIF(REGEXP_REPLACE(COALESCE(bible_intensity_level::text, ''), '[^0-9.]', '', 'g'), '')::numeric
                    * quantity
                ) / NULLIF(SUM(quantity), 0)
            )::numeric,
            2
        ) AS favorite_intensity
    FROM capsule_items
    WHERE NULLIF(REGEXP_REPLACE(COALESCE(bible_intensity_level::text, ''), '[^0-9.]', '', 'g'), '') IS NOT NULL
    GROUP BY customer_id
),

capsule_category_counts AS (
    SELECT
        customer_id,
        COALESCE(
            NULLIF(TRIM(bible_collection::text), ''),
            NULLIF(TRIM(bible_beverage_type::text), ''),
            NULLIF(TRIM(capsule_format), ''),
            NULLIF(TRIM(package_type), ''),
            NULLIF(TRIM(pt), '')
        ) AS capsule_category,
        SUM(quantity) AS qty
    FROM capsule_items
    WHERE COALESCE(
        NULLIF(TRIM(bible_collection::text), ''),
        NULLIF(TRIM(bible_beverage_type::text), ''),
        NULLIF(TRIM(capsule_format), ''),
        NULLIF(TRIM(package_type), ''),
        NULLIF(TRIM(pt), '')
    ) IS NOT NULL
    GROUP BY customer_id, COALESCE(
        NULLIF(TRIM(bible_collection::text), ''),
        NULLIF(TRIM(bible_beverage_type::text), ''),
        NULLIF(TRIM(capsule_format), ''),
        NULLIF(TRIM(package_type), ''),
        NULLIF(TRIM(pt), '')
    )
),

capsule_categories AS (
    SELECT
        customer_id,
        ARRAY_AGG(capsule_category ORDER BY qty DESC, capsule_category) AS bought_capsule_categories
    FROM capsule_category_counts
    GROUP BY customer_id
),

capsule_category_universe AS (
    SELECT ARRAY_AGG(DISTINCT capsule_category ORDER BY capsule_category) AS all_capsule_categories
    FROM capsule_category_counts
),

return_gaps AS (
    SELECT
        customer_id,
        EXTRACT(
            DAY FROM processed_at - LAG(processed_at) OVER (PARTITION BY customer_id ORDER BY processed_at)
        )::numeric AS gap_days
    FROM retail_orders
    WHERE customer_id IS NOT NULL
),

return_metrics AS (
    SELECT
        customer_id,
        ROUND(AVG(gap_days)::numeric, 2)                                      AS avg_return_interval_days,
        ROUND((PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY gap_days))::numeric, 2)
                                                                               AS median_return_interval_days
    FROM return_gaps
    WHERE gap_days IS NOT NULL
      AND gap_days >= 0
    GROUP BY customer_id
),

machine_recommendation_signals AS (
    SELECT
        customer_id,
        LOWER(
            ARRAY_TO_STRING(
                ARRAY_AGG(
                    DISTINCT COALESCE(
                        ARRAY_TO_STRING(preferred_machine, ' '),
                        bible_compatible_with::text,
                        capsule_format,
                        package_type,
                        ''
                    )
                ),
                ' '
            )
        ) AS machine_signal
    FROM capsule_items
    GROUP BY customer_id
),

fulfillment_counts AS (
    SELECT
        customer_id,
        COUNT(*)::numeric AS fulfillment_order_count,
        SUM(
            CASE
                WHEN shipping_method IS NOT NULL AND TRIM(shipping_method) <> '' THEN 1
                ELSE 0
            END
        )::numeric AS delivery_orders,
        SUM(
            CASE
                WHEN source = 'pos' OR (location IS NOT NULL AND TRIM(location::text) <> '') THEN 1
                ELSE 0
            END
        )::numeric AS pickup_or_store_orders
    FROM retail_orders
    WHERE customer_id IS NOT NULL
    GROUP BY customer_id
),

rfm_scores AS (
    SELECT
        ca.customer_id,
        CASE
            WHEN EXTRACT(DAY FROM NOW() - ca.last_order_at) < 20  THEN 40
            WHEN EXTRACT(DAY FROM NOW() - ca.last_order_at) < 45  THEN 30
            WHEN EXTRACT(DAY FROM NOW() - ca.last_order_at) < 60  THEN 20
            WHEN EXTRACT(DAY FROM NOW() - ca.last_order_at) < 90  THEN 10
            ELSE 0
        END AS recency_score,
        CASE
            WHEN ca.order_count >= 15 THEN 35
            WHEN ca.order_count >= 8  THEN 28
            WHEN ca.order_count >= 4  THEN 18
            WHEN ca.order_count >= 2  THEN 8
            ELSE 0
        END AS frequency_score,
        ROUND(
            (1.0 - LEAST(1.0, CASE WHEN ca.total_spend > 0 THEN ca.promo_spend / ca.total_spend ELSE 0 END)) * 25
        )::int AS monetary_score
    FROM cust_agg ca
)

SELECT
    c.shopify_customer_id,

    -- Real PII
    TRIM(COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, ''))           AS full_name,
    CASE
        WHEN c.email LIKE '%@otp.customer.meama.ge' THEN NULL
        ELSE c.email
    END                                                                              AS email,
    COALESCE(c.phone, c.default_address_phone)                                      AS phone,

    -- OTP flag
    COALESCE(c.email LIKE '%@otp.customer.meama.ge', false)                        AS phone_only,

    -- Initials from real name
    UPPER(
        COALESCE(LEFT(NULLIF(TRIM(c.first_name), ''), 1), '?') ||
        COALESCE(LEFT(NULLIF(TRIM(c.last_name),  ''), 1), '' )
    )                                                                                AS initials,

    -- Consent
    COALESCE(c.accept_marketing_email, false)                                       AS accept_marketing_email,
    COALESCE(c.sms_marketing, false)                                                AS sms_marketing,

    -- Region from most-recent shipping_city, fallback to customer default address
    CASE
        WHEN LOWER(TRIM(COALESCE(lc.shipping_city, c.default_address_city)))
             IN ('tbilisi', 'თბილისი', 'тбилиси')
             THEN 'tbilisi'
        WHEN TRIM(COALESCE(lc.shipping_city, c.default_address_city, '')) <> ''
             THEN 'regions'
        ELSE 'unknown'
    END                                                                              AS region,

    ca.order_count,
    ca.total_spend,
    CASE
        WHEN ca.order_count > 0
        THEN ROUND((ca.total_spend / ca.order_count)::numeric, 2)
        ELSE 0
    END                                                                              AS aov,
    ca.first_order_at,
    ca.last_order_at,
    EXTRACT(DAY FROM NOW() - ca.last_order_at)::int                                 AS days_since_last_order,
    COALESCE(c.created_at, ca.first_order_at)                                       AS customer_since,
    EXTRACT(DAY FROM NOW() - COALESCE(c.created_at, ca.first_order_at))::int        AS tenure_days,
    FLOOR(EXTRACT(DAY FROM NOW() - COALESCE(c.created_at, ca.first_order_at)) / 30)::int
                                                                                   AS tenure_months,
    ca.active_months,

    -- Status (legacy field kept for compatibility)
    CASE
        WHEN ca.order_count = 1                                THEN 'new'
        WHEN EXTRACT(DAY FROM NOW() - ca.last_order_at) < 45  THEN 'active'
        WHEN EXTRACT(DAY FROM NOW() - ca.last_order_at) < 90  THEN 'at_risk'
        ELSE 'lost'
    END                                                                              AS status,

    -- Segment (richer classification)
    CASE
        WHEN (cm.customer_id IS NOT NULL) AND ca.order_count = 1
             THEN 'new_machine'
        WHEN ca.order_count >= 8
             AND EXTRACT(DAY FROM NOW() - ca.last_order_at) < 45
             THEN 'loyalist'
        WHEN EXTRACT(DAY FROM NOW() - ca.last_order_at) >= 90
             THEN 'lapsed'
        WHEN EXTRACT(DAY FROM NOW() - ca.last_order_at) >= 45
             THEN 'at_risk'
        ELSE 'active'
    END                                                                              AS segment,

    -- Health score 0-100
    -- Recency 40pts: 0 / 10 / 20 / 30 / 40 at >90 / 60-89 / 45-59 / 20-44 / <20 days
    -- Frequency 35pts: 0 / 8 / 18 / 28 / 35 at 1 / 2-3 / 4-7 / 8-14 / 15+ orders
    -- Spend quality 25pts: (1 - min(1, promo_share)) * 25
    (rs.recency_score + rs.frequency_score + rs.monetary_score)                     AS health_score,
    rs.recency_score,
    rs.frequency_score,
    rs.monetary_score,
    CASE
        WHEN ca.order_count <= 1 THEN 'New / Low history'
        WHEN rs.recency_score >= 30 AND rs.frequency_score >= 28 AND rs.monetary_score >= 20
             THEN 'Champions'
        WHEN rs.recency_score >= 30 AND rs.frequency_score >= 18
             THEN 'Loyal'
        WHEN rs.recency_score >= 20 AND rs.frequency_score >= 8
             THEN 'Potential loyalist'
        WHEN rs.recency_score >= 10
             THEN 'At risk'
        ELSE 'Hibernating'
    END                                                                              AS rfm_label,

    -- Machine
    (cm.customer_id IS NOT NULL)                                                     AS has_machine,
    cm.machine_model,
    mf.machine_acquisition_date,
    CASE
        WHEN cm.customer_id IS NULL AND COALESCE(c.machine_registered, false) = false
             AND COALESCE(cap.capsule_quantity, 0) > 0
             THEN 'capsules_without_machine_purchase'
        WHEN cm.customer_id IS NULL AND COALESCE(c.machine_registered, false) = false
             THEN 'no_machine'
        WHEN cm.customer_id IS NULL AND COALESCE(c.machine_registered, false) = true
             THEN 'unknown'
        WHEN COALESCE(cap.capsule_quantity, 0) = 0
             THEN 'machine_only_no_capsules'
        WHEN cap.last_capsule_order_at >= mf.machine_acquisition_date
             THEN 'machine_then_capsules'
        ELSE 'unknown'
    END                                                                              AS machine_to_capsule_conversion_status,

    ca.channel,
    tc.top_product_types,
    ti.top_item_title,
    CASE
        WHEN cap.capsule_order_count > 0
        THEN ROUND((cap.capsule_spend / cap.capsule_order_count)::numeric, 2)
        ELSE NULL
    END                                                                              AS capsule_aov,
    CASE
        WHEN ca.active_months > 0
        THEN ROUND((COALESCE(cap.capsule_quantity, 0) / ca.active_months)::numeric, 2)
        ELSE NULL
    END                                                                              AS avg_capsule_packs_per_month,
    CASE
        WHEN ca.order_count < 2 THEN NULL
        ELSE ca.last_order_at + ((ca.last_order_at - ca.first_order_at) / NULLIF(ca.order_count - 1, 0))
    END                                                                              AS expected_next_order_date,
    tf.top_flavors,
    tfo.format_preferences,
    (COALESCE(cap.capsule_quantity, 0) = 0)                                          AS never_bought_capsules_flag,
    ip.favorite_intensity,
    cap.avg_capsule_price,
    CASE cpr.price_bucket
        WHEN 1 THEN 'budget'
        WHEN 2 THEN 'mid_range'
        WHEN 3 THEN 'premium'
        ELSE NULL
    END                                                                              AS capsule_price_range,
    ccat.bought_capsule_categories,
    ARRAY(
        SELECT category
        FROM UNNEST(COALESCE(ccu.all_capsule_categories, ARRAY[]::text[])) AS all_categories(category)
        EXCEPT
        SELECT category
        FROM UNNEST(COALESCE(ccat.bought_capsule_categories, ARRAY[]::text[])) AS bought_categories(category)
        ORDER BY category
    )                                                                                AS never_bought_capsule_categories,
    rm.avg_return_interval_days,
    rm.median_return_interval_days,
    CASE
        WHEN COALESCE(rm.median_return_interval_days, rm.avg_return_interval_days) IS NULL THEN NULL
        WHEN COALESCE(rm.median_return_interval_days, rm.avg_return_interval_days) < 14 THEN 'frequent'
        WHEN COALESCE(rm.median_return_interval_days, rm.avg_return_interval_days) <= 30 THEN 'regular'
        WHEN COALESCE(rm.median_return_interval_days, rm.avg_return_interval_days) <= 60 THEN 'slow'
        ELSE 'lapsed_pattern'
    END                                                                              AS return_period_label,
    CASE
        WHEN COALESCE(rm.median_return_interval_days, rm.avg_return_interval_days) IS NULL THEN NULL
        ELSE ca.last_order_at
             + ((COALESCE(rm.median_return_interval_days, rm.avg_return_interval_days) * 0.75)::double precision * INTERVAL '1 day')
    END                                                                              AS expected_return_window_start,
    CASE
        WHEN COALESCE(rm.median_return_interval_days, rm.avg_return_interval_days) IS NULL THEN NULL
        ELSE ca.last_order_at
             + ((COALESCE(rm.median_return_interval_days, rm.avg_return_interval_days) * 1.25)::double precision * INTERVAL '1 day')
    END                                                                              AS expected_return_window_end,
    CASE
        WHEN ca.order_count < 2
             THEN 'new_customer'
        WHEN EXTRACT(DAY FROM NOW() - ca.last_order_at) >= 90
             THEN 'long_recency_gap'
        WHEN ca.order_count > 0 AND (ca.promo_orders::numeric / ca.order_count) >= 0.6
             THEN 'promo_dependent'
        WHEN cm.customer_id IS NOT NULL AND COALESCE(cap.capsule_quantity, 0) = 0
             THEN 'machine_without_capsules'
        WHEN rs.frequency_score <= 8
             THEN 'low_frequency'
        WHEN ARRAY_LENGTH(ccat.bought_capsule_categories, 1) = 1
             THEN 'single_category_dependency'
        WHEN EXTRACT(DAY FROM NOW() - ca.last_order_at) < 45
             THEN 'healthy_active'
        ELSE 'unknown'
    END                                                                              AS churn_reason,
    CASE
        WHEN cm.customer_id IS NOT NULL OR COALESCE(c.machine_registered, false) = true THEN NULL
        WHEN COALESCE(mrs.machine_signal, '') LIKE '%versatile%' THEN 'Versatile'
        WHEN COALESCE(mrs.machine_signal, '') LIKE '%multi%' THEN 'Multi Machine'
        WHEN COALESCE(mrs.machine_signal, '') LIKE '%european%'
          OR COALESCE(mrs.machine_signal, '') LIKE '%espresso%' THEN 'European Machine'
        ELSE NULL
    END                                                                              AS recommended_next_machine,
    CASE
        WHEN fc.fulfillment_order_count IS NULL OR fc.fulfillment_order_count = 0 THEN 'unknown'
        WHEN fc.delivery_orders / fc.fulfillment_order_count >= 0.7 THEN 'delivery'
        WHEN fc.pickup_or_store_orders / fc.fulfillment_order_count >= 0.7 THEN 'pickup_or_store'
        WHEN fc.delivery_orders > 0 AND fc.pickup_or_store_orders > 0 THEN 'mixed'
        ELSE 'unknown'
    END                                                                              AS delivery_vs_pickup_preference,

    -- Promo metrics
    ca.promo_orders,
    ca.promo_spend,
    ca.full_price_spend,
    CASE
        WHEN ca.order_count > 0
        THEN ROUND((ca.promo_orders::numeric / ca.order_count), 4)
        ELSE 0.0
    END                                                                              AS promo_share,
    CASE
        WHEN LOWER(TRIM(COALESCE(lc.shipping_city, c.default_address_city))) IN ('tbilisi', 'áƒ—áƒ‘áƒ˜áƒšáƒ˜áƒ¡áƒ˜', 'Ñ‚Ð±Ð¸Ð»Ð¸ÑÐ¸')
             THEN 'capital'
        WHEN TRIM(COALESCE(lc.shipping_city, c.default_address_city, '')) <> ''
             THEN 'regional'
        ELSE 'unknown'
    END                                                                              AS capital_vs_regional,
    CASE
        WHEN ca.order_count > 0 THEN ROUND((ca.ecommerce_orders::numeric / ca.order_count), 4)
        ELSE NULL
    END                                                                              AS ecommerce_share,
    CASE
        WHEN ca.order_count > 0 THEN ROUND((ca.brand_store_orders::numeric / ca.order_count), 4)
        ELSE NULL
    END                                                                              AS brand_store_share,

    (c.created_at IS NOT NULL)                                                       AS is_registered,
    c.created_at                                                                     AS customer_created_at

FROM customers_georgia c
INNER JOIN cust_agg ca          ON ca.customer_id   = c.shopify_customer_id
LEFT  JOIN latest_city lc       ON lc.customer_id   = c.shopify_customer_id
LEFT  JOIN customer_machine cm  ON cm.customer_id   = c.shopify_customer_id
LEFT  JOIN machine_first mf     ON mf.customer_id   = c.shopify_customer_id
LEFT  JOIN capsule_metrics cap  ON cap.customer_id  = c.shopify_customer_id
LEFT  JOIN top_categories tc    ON tc.customer_id   = c.shopify_customer_id
LEFT  JOIN top_item ti          ON ti.customer_id   = c.shopify_customer_id
LEFT  JOIN top_flavors tf       ON tf.customer_id   = c.shopify_customer_id
LEFT  JOIN top_formats tfo      ON tfo.customer_id  = c.shopify_customer_id
LEFT  JOIN intensity_profile ip ON ip.customer_id   = c.shopify_customer_id
LEFT  JOIN capsule_price_ranked cpr
                                ON cpr.customer_id  = c.shopify_customer_id
LEFT  JOIN capsule_categories ccat
                                ON ccat.customer_id = c.shopify_customer_id
CROSS JOIN capsule_category_universe ccu
LEFT  JOIN return_metrics rm    ON rm.customer_id   = c.shopify_customer_id
LEFT  JOIN machine_recommendation_signals mrs
                                ON mrs.customer_id  = c.shopify_customer_id
LEFT  JOIN fulfillment_counts fc
                                ON fc.customer_id   = c.shopify_customer_id
LEFT  JOIN rfm_scores rs        ON rs.customer_id   = c.shopify_customer_id;

-- ---- Indexes ----
CREATE UNIQUE INDEX portfolio_customers_pk
    ON portfolio_customers (shopify_customer_id);

CREATE INDEX portfolio_customers_status_idx
    ON portfolio_customers (status);

CREATE INDEX portfolio_customers_segment_idx
    ON portfolio_customers (segment);

CREATE INDEX portfolio_customers_region_idx
    ON portfolio_customers (region);

CREATE INDEX portfolio_customers_channel_idx
    ON portfolio_customers (channel);

CREATE INDEX portfolio_customers_machine_idx
    ON portfolio_customers (has_machine);

CREATE INDEX portfolio_customers_last_order_idx
    ON portfolio_customers (last_order_at DESC NULLS LAST);

CREATE INDEX portfolio_customers_spend_idx
    ON portfolio_customers (total_spend DESC);

CREATE INDEX portfolio_customers_health_idx
    ON portfolio_customers (health_score DESC);

CREATE INDEX portfolio_customers_promo_share_idx
    ON portfolio_customers (promo_share DESC);

CREATE INDEX portfolio_customers_email_idx
    ON portfolio_customers (email text_pattern_ops);

-- ---- Nightly refresh function ----
CREATE OR REPLACE FUNCTION refresh_portfolio_customers()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
    REFRESH MATERIALIZED VIEW CONCURRENTLY portfolio_customers;
$$;

-- ============================================================
-- 0013 · Fix financial_status filter across all product RPCs
--
-- Correct filter: ('paid', 'partially_paid', 'partially_refunded')
-- Removed:  'pending'          — payment not yet cleared
-- Added:    'partially_refunded' — purchase happened, part returned
--
-- Also fixes in this migration:
--   • get_product_stats        — revenue_30d: SUM(price) not SUM(qty*price)
--                                + expanded channel filter (mobile app source)
--   • get_product_segment_buyers — SUM(price) not SUM(qty*price)
--                                + expanded channel filter
-- ============================================================

-- ── 1. get_product_stats ─────────────────────────────────────
CREATE OR REPLACE FUNCTION get_product_stats()
RETURNS TABLE (
    sku         TEXT,
    units_30d   BIGINT,
    revenue_30d NUMERIC,
    repeat_rate NUMERIC,
    m0  BIGINT, m1  BIGINT, m2  BIGINT, m3  BIGINT,
    m4  BIGINT, m5  BIGINT, m6  BIGINT, m7  BIGINT,
    m8  BIGINT, m9  BIGINT, m10 BIGINT, m11 BIGINT
)
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
WITH
retail AS (
    SELECT shopify_order_id, customer_id, processed_at
    FROM   meama_georgia_orders
    WHERE  source IN ('web', 'pos', '195189899265', 'online_store', 'Online Store')
      AND  processed_at >= NOW() - INTERVAL '13 months'
      AND  financial_status IN ('paid', 'partially_paid', 'partially_refunded')
      AND  cancelled_at IS NULL
),
items AS (
    SELECT i.sku::TEXT AS sku, i.shopify_order_id AS order_id,
           i.quantity::BIGINT AS qty, i.price::NUMERIC AS price,
           r.customer_id::TEXT AS customer_id, r.processed_at
    FROM   meama_georgia_order_items i
    JOIN   retail r ON r.shopify_order_id = i.shopify_order_id
    WHERE  i.sku IS NOT NULL AND i.quantity > 0
),
monthly AS (
    SELECT sku,
        SUM(CASE WHEN processed_at >= NOW() - INTERVAL '30 days' THEN qty   ELSE 0 END) AS units_30d,
        SUM(CASE WHEN processed_at >= NOW() - INTERVAL '30 days' THEN price ELSE 0 END) AS revenue_30d,
        SUM(CASE WHEN date_trunc('month', processed_at) = date_trunc('month', NOW() - INTERVAL '11 months') THEN qty ELSE 0 END) AS m0,
        SUM(CASE WHEN date_trunc('month', processed_at) = date_trunc('month', NOW() - INTERVAL '10 months') THEN qty ELSE 0 END) AS m1,
        SUM(CASE WHEN date_trunc('month', processed_at) = date_trunc('month', NOW() - INTERVAL '9 months')  THEN qty ELSE 0 END) AS m2,
        SUM(CASE WHEN date_trunc('month', processed_at) = date_trunc('month', NOW() - INTERVAL '8 months')  THEN qty ELSE 0 END) AS m3,
        SUM(CASE WHEN date_trunc('month', processed_at) = date_trunc('month', NOW() - INTERVAL '7 months')  THEN qty ELSE 0 END) AS m4,
        SUM(CASE WHEN date_trunc('month', processed_at) = date_trunc('month', NOW() - INTERVAL '6 months')  THEN qty ELSE 0 END) AS m5,
        SUM(CASE WHEN date_trunc('month', processed_at) = date_trunc('month', NOW() - INTERVAL '5 months')  THEN qty ELSE 0 END) AS m6,
        SUM(CASE WHEN date_trunc('month', processed_at) = date_trunc('month', NOW() - INTERVAL '4 months')  THEN qty ELSE 0 END) AS m7,
        SUM(CASE WHEN date_trunc('month', processed_at) = date_trunc('month', NOW() - INTERVAL '3 months')  THEN qty ELSE 0 END) AS m8,
        SUM(CASE WHEN date_trunc('month', processed_at) = date_trunc('month', NOW() - INTERVAL '2 months')  THEN qty ELSE 0 END) AS m9,
        SUM(CASE WHEN date_trunc('month', processed_at) = date_trunc('month', NOW() - INTERVAL '1 month')   THEN qty ELSE 0 END) AS m10,
        SUM(CASE WHEN date_trunc('month', processed_at) = date_trunc('month', NOW())                         THEN qty ELSE 0 END) AS m11
    FROM items GROUP BY sku
),
orders_per_customer AS (
    SELECT sku, customer_id, COUNT(DISTINCT order_id) AS n_orders
    FROM   items WHERE customer_id IS NOT NULL
    GROUP BY sku, customer_id
),
repeat_summary AS (
    SELECT sku, COUNT(*) AS total_buyers,
           COUNT(*) FILTER (WHERE n_orders > 1) AS repeat_buyers
    FROM   orders_per_customer GROUP BY sku
)
SELECT m.sku, m.units_30d, m.revenue_30d,
    COALESCE(r.repeat_buyers::NUMERIC / NULLIF(r.total_buyers, 0), 0) AS repeat_rate,
    m.m0,m.m1,m.m2,m.m3,m.m4,m.m5,m.m6,m.m7,m.m8,m.m9,m.m10,m.m11
FROM monthly m
LEFT JOIN repeat_summary r ON r.sku = m.sku
$$;

-- ── 2. get_product_channel_stats ─────────────────────────────
CREATE OR REPLACE FUNCTION get_product_channel_stats()
RETURNS TABLE (
    sku              TEXT,
    units_30d_web    BIGINT,  revenue_30d_web  NUMERIC,  avg_price_web  NUMERIC,
    units_30d_pos    BIGINT,  revenue_30d_pos  NUMERIC,  avg_price_pos  NUMERIC
)
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
WITH retail AS (
    SELECT shopify_order_id, source
    FROM   meama_georgia_orders
    WHERE  source IN ('web', 'pos', '195189899265', 'online_store', 'Online Store')
      AND  processed_at >= NOW() - INTERVAL '30 days'
      AND  financial_status IN ('paid', 'partially_paid', 'partially_refunded')
      AND  cancelled_at IS NULL
),
items AS (
    SELECT i.sku::TEXT AS sku, i.quantity::BIGINT AS qty, i.price::NUMERIC AS price,
           CASE WHEN r.source IN ('web','online_store','Online Store','195189899265') THEN 'web'
                WHEN r.source = 'pos' THEN 'pos' ELSE r.source END AS source
    FROM   meama_georgia_order_items i
    JOIN   retail r ON r.shopify_order_id = i.shopify_order_id
    WHERE  i.sku IS NOT NULL AND i.quantity > 0
)
SELECT sku,
    SUM(qty)   FILTER (WHERE source='web')  AS units_30d_web,
    SUM(price) FILTER (WHERE source='web')  AS revenue_30d_web,
    CASE WHEN SUM(qty) FILTER (WHERE source='web') > 0
         THEN SUM(price) FILTER (WHERE source='web') / SUM(qty) FILTER (WHERE source='web')
         ELSE NULL END AS avg_price_web,
    SUM(qty)   FILTER (WHERE source='pos')  AS units_30d_pos,
    SUM(price) FILTER (WHERE source='pos')  AS revenue_30d_pos,
    CASE WHEN SUM(qty) FILTER (WHERE source='pos') > 0
         THEN SUM(price) FILTER (WHERE source='pos') / SUM(qty) FILTER (WHERE source='pos')
         ELSE NULL END AS avg_price_pos
FROM items GROUP BY sku
$$;

-- ── 3. get_product_new_metrics ───────────────────────────────
CREATE OR REPLACE FUNCTION get_product_new_metrics()
RETURNS TABLE (
    sku                     TEXT,
    total_revenue           NUMERIC,  total_quantity          BIGINT,
    format_rank_pct         NUMERIC,  total_rank_pct          NUMERIC,
    monthly_growth_pct      NUMERIC,  margin_pct              NUMERIC,
    full_price_revenue      NUMERIC,  full_price_units        BIGINT,
    discounted_revenue      NUMERIC,  discounted_units        BIGINT,
    avg_monthly_consumption NUMERIC,  refund_rate             NUMERIC
)
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
WITH
retail AS (
    SELECT shopify_order_id, processed_at, source
    FROM   meama_georgia_orders
    WHERE  source IN ('web', 'pos', '195189899265', 'online_store', 'Online Store')
      AND  financial_status IN ('paid', 'partially_paid', 'partially_refunded')
      AND  cancelled_at IS NULL
),
items AS (
    SELECT i.sku::TEXT AS sku, i.shopify_order_id AS order_id,
           i.quantity::BIGINT AS qty, i.price::NUMERIC AS price,
           COALESCE(i.line_item_discount::NUMERIC, 0) AS discount,
           COALESCE(i.refunded_quantity::BIGINT, 0)   AS refunded_qty,
           r.processed_at
    FROM meama_georgia_order_items i
    JOIN retail r ON r.shopify_order_id = i.shopify_order_id
    WHERE i.sku IS NOT NULL AND i.quantity > 0
),
totals AS (
    SELECT sku, SUM(qty) AS total_quantity, SUM(price) AS total_revenue
    FROM   items GROUP BY sku
),
rank_base AS (
    SELECT i.sku, pm.category, SUM(i.qty) AS qty_90d
    FROM   items i
    JOIN   products_master pm ON pm.sku = i.sku
    WHERE  i.processed_at >= now() - INTERVAL '90 days'
    GROUP  BY i.sku, pm.category
),
fmt_totals  AS (SELECT category, SUM(qty_90d) AS fmt_total FROM rank_base GROUP BY category),
grand_total AS (SELECT SUM(qty_90d) AS gtotal FROM rank_base),
growth AS (
    SELECT sku,
        SUM(qty) FILTER (WHERE date_trunc('month',processed_at)=date_trunc('month',now()-INTERVAL '1 month')) AS prev_qty,
        SUM(qty) FILTER (WHERE date_trunc('month',processed_at)=date_trunc('month',now()))                    AS curr_qty
    FROM items GROUP BY sku
),
promo AS (
    SELECT sku,
        SUM(price) FILTER (WHERE discount  = 0) AS full_rev,
        SUM(qty)   FILTER (WHERE discount  = 0) AS full_units,
        SUM(price) FILTER (WHERE discount != 0) AS disc_rev,
        SUM(qty)   FILTER (WHERE discount != 0) AS disc_units
    FROM items GROUP BY sku
),
consumption AS (
    SELECT sku, SUM(qty)::NUMERIC / 6.0 AS avg_monthly
    FROM   items WHERE processed_at >= now() - INTERVAL '6 months'
    GROUP  BY sku
),
refunds AS (
    SELECT sku,
        COUNT(DISTINCT order_id)                                  AS total_orders,
        COUNT(DISTINCT order_id) FILTER (WHERE refunded_qty > 0) AS refund_orders
    FROM items GROUP BY sku
)
SELECT
    pm.sku::TEXT,
    COALESCE(t.total_revenue,  0) AS total_revenue,
    COALESCE(t.total_quantity, 0) AS total_quantity,
    rb.qty_90d * 1.0 / NULLIF(ft.fmt_total, 0) AS format_rank_pct,
    rb.qty_90d * 1.0 / NULLIF(gt.gtotal,    0) AS total_rank_pct,
    CASE WHEN COALESCE(g.prev_qty,0)=0 THEN NULL
         ELSE ROUND((COALESCE(g.curr_qty,0)-g.prev_qty)::NUMERIC/g.prev_qty,4)
    END AS monthly_growth_pct,
    CASE WHEN pm.cogs IS NULL OR COALESCE(t.total_quantity,0)=0 OR COALESCE(t.total_revenue,0)=0 THEN NULL
         ELSE ROUND((t.total_revenue/1.18 - pm.cogs*t.total_quantity)/(t.total_revenue/1.18),4)
    END AS margin_pct,
    COALESCE(p.full_rev,   0) AS full_price_revenue,
    COALESCE(p.full_units, 0) AS full_price_units,
    COALESCE(p.disc_rev,   0) AS discounted_revenue,
    COALESCE(p.disc_units, 0) AS discounted_units,
    COALESCE(cons.avg_monthly, 0) AS avg_monthly_consumption,
    COALESCE(r.refund_orders::NUMERIC / NULLIF(r.total_orders,0), 0) AS refund_rate
FROM  products_master pm
LEFT JOIN totals      t    ON t.sku    = pm.sku
LEFT JOIN rank_base   rb   ON rb.sku   = pm.sku
LEFT JOIN fmt_totals  ft   ON ft.category = rb.category
CROSS JOIN grand_total gt
LEFT JOIN growth      g    ON g.sku    = pm.sku
LEFT JOIN promo       p    ON p.sku    = pm.sku
LEFT JOIN consumption cons ON cons.sku = pm.sku
LEFT JOIN refunds     r    ON r.sku    = pm.sku
WHERE pm.category NOT IN ('Shipping','Test','None') AND pm.category IS NOT NULL
$$;

-- ── 4. get_product_reorder_rates ─────────────────────────────
CREATE OR REPLACE FUNCTION get_product_reorder_rates()
RETURNS TABLE (
    sku               TEXT,  total_buyers      BIGINT,
    reorder_rate_30d  NUMERIC, reorder_rate_60d  NUMERIC,
    reorder_rate_90d  NUMERIC, retention_rate    NUMERIC
)
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
WITH retail AS (
    SELECT shopify_order_id, customer_id, processed_at
    FROM   meama_georgia_orders
    WHERE  source IN ('web', 'pos', '195189899265', 'online_store', 'Online Store')
      AND  processed_at >= NOW() - INTERVAL '13 months'
      AND  financial_status IN ('paid', 'partially_paid', 'partially_refunded')
      AND  cancelled_at IS NULL
      AND  customer_id IS NOT NULL
),
items AS (
    SELECT i.sku::TEXT AS sku, i.shopify_order_id AS order_id,
           r.customer_id::TEXT AS customer_id, r.processed_at
    FROM   meama_georgia_order_items i
    JOIN   retail r ON r.shopify_order_id = i.shopify_order_id
    WHERE  i.sku IS NOT NULL AND i.quantity > 0
),
first_purchase AS (
    SELECT sku, customer_id, MIN(processed_at) AS first_date
    FROM   items GROUP BY sku, customer_id
),
next_purchase AS (
    SELECT fp.sku, fp.customer_id, fp.first_date, MIN(i.processed_at) AS next_date
    FROM   first_purchase fp
    JOIN   items i ON i.sku=fp.sku AND i.customer_id=fp.customer_id AND i.processed_at>fp.first_date
    GROUP  BY fp.sku, fp.customer_id, fp.first_date
),
combined AS (
    SELECT fp.sku, fp.customer_id, fp.first_date, np.next_date,
           EXTRACT(EPOCH FROM (np.next_date - fp.first_date)) / 86400 AS days_to_reorder
    FROM first_purchase fp
    LEFT JOIN next_purchase np ON np.sku=fp.sku AND np.customer_id=fp.customer_id
),
active_last_90d AS (
    SELECT DISTINCT sku, customer_id FROM items
    WHERE processed_at >= NOW() - INTERVAL '90 days'
)
SELECT c.sku,
    COUNT(DISTINCT c.customer_id) AS total_buyers,
    COUNT(*) FILTER (WHERE days_to_reorder <= 30) * 1.0 / COUNT(*) AS reorder_rate_30d,
    COUNT(*) FILTER (WHERE days_to_reorder <= 60) * 1.0 / COUNT(*) AS reorder_rate_60d,
    COUNT(*) FILTER (WHERE days_to_reorder <= 90) * 1.0 / COUNT(*) AS reorder_rate_90d,
    COUNT(DISTINCT a.customer_id) * 1.0 / NULLIF(COUNT(DISTINCT c.customer_id),0) AS retention_rate
FROM combined c
LEFT JOIN active_last_90d a ON a.sku=c.sku AND a.customer_id=c.customer_id
GROUP BY c.sku
$$;

-- ── 5. get_product_affinity_pairs ────────────────────────────
CREATE OR REPLACE FUNCTION get_product_affinity_pairs()
RETURNS TABLE (
    sku_a TEXT, sku_b TEXT, co_orders BIGINT, name_a TEXT, name_b TEXT
)
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
WITH retail_orders AS (
    SELECT shopify_order_id
    FROM   meama_georgia_orders
    WHERE  source IN ('web', 'pos', '195189899265', 'online_store', 'Online Store')
      AND  cancelled_at IS NULL
      AND  financial_status IN ('paid', 'partially_paid', 'partially_refunded')
      AND  processed_at >= NOW() - INTERVAL '6 months'
),
sku_pairs AS (
    SELECT a.sku::TEXT AS sku_a, b.sku::TEXT AS sku_b,
           COUNT(DISTINCT a.shopify_order_id) AS co_orders
    FROM   meama_georgia_order_items a
    JOIN   meama_georgia_order_items b ON a.shopify_order_id=b.shopify_order_id AND a.sku < b.sku
    JOIN   retail_orders ro ON ro.shopify_order_id = a.shopify_order_id
    WHERE  a.sku IS NOT NULL AND b.sku IS NOT NULL AND a.quantity > 0 AND b.quantity > 0
    GROUP BY a.sku, b.sku
    HAVING COUNT(DISTINCT a.shopify_order_id) >= 3
)
SELECT sp.sku_a, sp.sku_b, sp.co_orders,
    COALESCE(pa.name_en, pa.name, sp.sku_a) AS name_a,
    COALESCE(pb.name_en, pb.name, sp.sku_b) AS name_b
FROM sku_pairs sp
LEFT JOIN products_master pa ON pa.sku = sp.sku_a
LEFT JOIN products_master pb ON pb.sku = sp.sku_b
ORDER BY sp.co_orders DESC LIMIT 60
$$;

-- ── 6. get_product_top_bundles ───────────────────────────────
CREATE OR REPLACE FUNCTION get_product_top_bundles()
RETURNS TABLE (
    sku TEXT, top_bundle_sku TEXT, top_bundle_name TEXT, top_bundle_count BIGINT
)
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
WITH recent_orders AS (
    SELECT shopify_order_id
    FROM   meama_georgia_orders
    WHERE  source IN ('web', 'pos', '195189899265', 'online_store', 'Online Store')
      AND  cancelled_at IS NULL
      AND  financial_status IN ('paid', 'partially_paid', 'partially_refunded')
      AND  processed_at >= NOW() - INTERVAL '6 months'
),
pairs AS (
    SELECT a.sku::TEXT AS anchor, b.sku::TEXT AS partner,
           COUNT(DISTINCT a.shopify_order_id) AS co_count
    FROM   meama_georgia_order_items a
    JOIN   meama_georgia_order_items b ON a.shopify_order_id=b.shopify_order_id AND a.sku != b.sku
    JOIN   recent_orders ro ON ro.shopify_order_id = a.shopify_order_id
    WHERE  a.sku IS NOT NULL AND b.sku IS NOT NULL AND a.quantity > 0 AND b.quantity > 0
    GROUP  BY a.sku, b.sku
    HAVING COUNT(DISTINCT a.shopify_order_id) >= 2
),
top1 AS (
    SELECT DISTINCT ON (anchor) anchor AS sku, partner, co_count
    FROM pairs ORDER BY anchor, co_count DESC
)
SELECT t.sku, t.partner AS top_bundle_sku,
    COALESCE(pm.name_en, pm.name, t.partner) AS top_bundle_name,
    t.co_count AS top_bundle_count
FROM   top1 t
LEFT JOIN products_master pm ON pm.sku = t.partner
$$;

-- ── 7. get_product_segment_buyers ────────────────────────────
CREATE OR REPLACE FUNCTION get_product_segment_buyers(p_sku TEXT)
RETURNS TABLE (
    segment TEXT, rfm_label TEXT,
    customer_count BIGINT, total_spend NUMERIC, avg_spend NUMERIC
)
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
WITH retail AS (
    SELECT shopify_order_id, customer_id::TEXT AS customer_id
    FROM   meama_georgia_orders
    WHERE  source IN ('web', 'pos', '195189899265', 'online_store', 'Online Store')
      AND  financial_status IN ('paid', 'partially_paid', 'partially_refunded')
      AND  cancelled_at IS NULL
      AND  processed_at >= now() - INTERVAL '12 months'
      AND  customer_id IS NOT NULL
),
sku_buyers AS (
    SELECT DISTINCT r.customer_id AS customer_id
    FROM   meama_georgia_order_items i
    JOIN   retail r ON r.shopify_order_id = i.shopify_order_id
    WHERE  i.sku = p_sku AND i.quantity > 0
),
buyer_spend AS (
    SELECT sb.customer_id, SUM(i.price)::NUMERIC AS total_spend
    FROM sku_buyers sb
    JOIN retail r ON r.customer_id = sb.customer_id
    JOIN meama_georgia_order_items i ON i.shopify_order_id = r.shopify_order_id
                                    AND i.sku = p_sku AND i.quantity > 0
    GROUP BY sb.customer_id
)
SELECT
    COALESCE(pc.segment,   'unknown') AS segment,
    COALESCE(pc.rfm_label, 'unknown') AS rfm_label,
    COUNT(*)                           AS customer_count,
    ROUND(SUM(bs.total_spend), 2)     AS total_spend,
    ROUND(AVG(bs.total_spend), 2)     AS avg_spend
FROM buyer_spend bs
LEFT JOIN portfolio_customers pc ON pc.shopify_customer_id::TEXT = bs.customer_id
GROUP BY COALESCE(pc.segment,'unknown'), COALESCE(pc.rfm_label,'unknown')
ORDER BY COUNT(*) DESC
$$;

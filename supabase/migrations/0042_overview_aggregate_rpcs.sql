-- ============================================================
-- Command Overview aggregate RPCs (0042)
-- Server-side aggregation for the executive homepage so the
-- backend never pulls the 97K-row portfolio_customers matview
-- into Python. Numbers reuse the same definitions as the
-- dedicated pages (portfolio_customers view, retail order sources).
-- Apply in Supabase SQL editor or via Management API.
-- ============================================================

-- ── 1. Customer + channel/delivery aggregates (single row) ──────────
--    Sourced from the portfolio_customers materialized view so status,
--    region, delivery preference and machine->capsule match the
--    Customer 360 page exactly.
CREATE OR REPLACE FUNCTION overview_customer_stats()
RETURNS TABLE (
  total_registered      BIGINT,
  active_buyers_90d     BIGINT,
  ltv_avg               NUMERIC,
  status_active         BIGINT,
  status_at_risk        BIGINT,
  status_lost           BIGINT,
  region_capital        BIGINT,
  region_regional       BIGINT,
  region_unknown        BIGINT,
  pref_delivery         BIGINT,
  pref_pickup           BIGINT,
  pref_other            BIGINT,
  machine_customers     BIGINT,
  machine_then_capsule  BIGINT
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
SELECT
  COUNT(*)                                                              AS total_registered,
  COUNT(*) FILTER (WHERE last_order_at >= now() - INTERVAL '90 days')   AS active_buyers_90d,
  ROUND(AVG(total_spend) FILTER (WHERE total_spend > 0), 2)             AS ltv_avg,
  COUNT(*) FILTER (WHERE status = 'active')                             AS status_active,
  COUNT(*) FILTER (WHERE status = 'at_risk')                            AS status_at_risk,
  COUNT(*) FILTER (WHERE status = 'lost')                               AS status_lost,
  COUNT(*) FILTER (WHERE capital_vs_regional = 'capital')               AS region_capital,
  COUNT(*) FILTER (WHERE capital_vs_regional = 'regional')              AS region_regional,
  COUNT(*) FILTER (WHERE capital_vs_regional NOT IN ('capital','regional')
                      OR capital_vs_regional IS NULL)                   AS region_unknown,
  COUNT(*) FILTER (WHERE delivery_vs_pickup_preference = 'delivery')    AS pref_delivery,
  COUNT(*) FILTER (WHERE delivery_vs_pickup_preference = 'pickup_or_store') AS pref_pickup,
  COUNT(*) FILTER (WHERE delivery_vs_pickup_preference NOT IN ('delivery','pickup_or_store')
                      OR delivery_vs_pickup_preference IS NULL)         AS pref_other,
  COUNT(*) FILTER (WHERE has_machine)                                   AS machine_customers,
  COUNT(*) FILTER (WHERE machine_to_capsule_conversion_status = 'machine_then_capsules') AS machine_then_capsule
FROM portfolio_customers
$$;

-- ── 2. Order split — last 30 days ──────────────────────────────────
--    Retail split (registered vs guest) uses the same retail sources
--    + paid/not-cancelled filter as the product stats RPCs. The
--    all-channels total also folds in vending + b2b order tables.
CREATE OR REPLACE FUNCTION overview_order_split()
RETURNS TABLE (
  orders_total_all_channels BIGINT,
  retail_orders             BIGINT,
  guest_orders              BIGINT,
  registered_orders         BIGINT
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
WITH retail AS (
  SELECT customer_id
  FROM   meama_georgia_orders
  WHERE  source IN ('web', 'online_store', 'Online Store', '195189899265',
                    'shopify_draft_order', 'pos')
    AND  processed_at >= now() - INTERVAL '30 days'
    AND  financial_status IN ('paid', 'partially_paid', 'partially_refunded')
    AND  cancelled_at IS NULL
),
geo_all AS (
  SELECT 1
  FROM   meama_georgia_orders
  WHERE  processed_at >= now() - INTERVAL '30 days'
    AND  financial_status IN ('paid', 'partially_paid', 'partially_refunded')
    AND  cancelled_at IS NULL
),
vend AS (
  SELECT 1
  FROM   vending_orders
  WHERE  processed_at >= now() - INTERVAL '30 days'
    AND  financial_status IN ('paid', 'partially_paid', 'partially_refunded')
    AND  cancelled_at IS NULL
),
b2b AS (
  SELECT 1
  FROM   b2b_orders
  WHERE  processed_at >= now() - INTERVAL '30 days'
    AND  financial_status IN ('paid', 'partially_paid', 'partially_refunded')
    AND  cancelled_at IS NULL
)
SELECT
  (SELECT COUNT(*) FROM geo_all)
    + (SELECT COUNT(*) FROM vend)
    + (SELECT COUNT(*) FROM b2b)                             AS orders_total_all_channels,
  (SELECT COUNT(*) FROM retail)                              AS retail_orders,
  (SELECT COUNT(*) FROM retail WHERE customer_id IS NULL)    AS guest_orders,
  (SELECT COUNT(*) FROM retail WHERE customer_id IS NOT NULL) AS registered_orders
$$;

-- ── 3. Average capsule selling price by channel — last 30 days ─────
--    ecom = web/online sources, brand_store = pos. Capsule = any
--    products_georgia.product_type containing "capsule".
CREATE OR REPLACE FUNCTION overview_capsule_price()
RETURNS TABLE (
  avg_price_ecom        NUMERIC,
  avg_price_brand_store NUMERIC
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
WITH capsule_skus AS (
  SELECT DISTINCT variant_sku::TEXT AS sku
  FROM   products_georgia
  WHERE  product_type ILIKE '%capsule%'
),
retail AS (
  SELECT shopify_order_id,
         CASE WHEN source = 'pos' THEN 'brand_store' ELSE 'ecom' END AS channel
  FROM   meama_georgia_orders
  WHERE  source IN ('web', 'online_store', 'Online Store', '195189899265',
                    'shopify_draft_order', 'pos')
    AND  processed_at >= now() - INTERVAL '30 days'
    AND  financial_status IN ('paid', 'partially_paid', 'partially_refunded')
    AND  cancelled_at IS NULL
),
items AS (
  SELECT i.quantity::NUMERIC AS qty,
         i.price::NUMERIC     AS price,
         r.channel
  FROM   meama_georgia_order_items i
  JOIN   retail r ON r.shopify_order_id = i.shopify_order_id
  JOIN   capsule_skus c ON c.sku = i.sku::TEXT
  WHERE  i.sku IS NOT NULL AND i.quantity > 0 AND i.price >= 0
)
SELECT
  CASE WHEN SUM(qty) FILTER (WHERE channel='ecom') > 0
       THEN ROUND(SUM(price) FILTER (WHERE channel='ecom') /
                  SUM(qty) FILTER (WHERE channel='ecom'), 2)
       ELSE NULL END AS avg_price_ecom,
  CASE WHEN SUM(qty) FILTER (WHERE channel='brand_store') > 0
       THEN ROUND(SUM(price) FILTER (WHERE channel='brand_store') /
                  SUM(qty) FILTER (WHERE channel='brand_store'), 2)
       ELSE NULL END AS avg_price_brand_store
FROM items
$$;

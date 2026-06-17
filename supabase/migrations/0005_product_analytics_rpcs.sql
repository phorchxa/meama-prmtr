-- ============================================================
-- Product analytics RPCs (0005)
-- Adds: channel split, reorder rates, affinity pairs
-- Apply in Supabase SQL editor or via Management API.
-- ============================================================

-- ── 1. Channel-split stats ──────────────────────────────────
CREATE OR REPLACE FUNCTION get_product_channel_stats()
RETURNS TABLE (
  sku            TEXT,
  units_30d_web  BIGINT,
  revenue_30d_web NUMERIC,
  avg_price_web  NUMERIC,
  units_30d_pos  BIGINT,
  revenue_30d_pos NUMERIC,
  avg_price_pos  NUMERIC
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
WITH retail AS (
  SELECT shopify_order_id, source
  FROM   meama_georgia_orders
  WHERE  source IN ('web', 'pos', '195189899265', 'online_store', 'Online Store')
    AND  processed_at >= now() - INTERVAL '30 days'
    AND  financial_status IN ('paid', 'partially_paid', 'partially_refunded')
    AND  cancelled_at IS NULL
),
items AS (
  SELECT i.sku::TEXT AS sku,
         i.quantity::BIGINT AS qty,
         i.price::NUMERIC AS price,
         -- normalise mobile app + legacy sources to canonical channel names
         CASE
           WHEN r.source IN ('web', 'online_store', 'Online Store', '195189899265') THEN 'web'
           WHEN r.source = 'pos' THEN 'pos'
           ELSE r.source
         END AS source
  FROM   meama_georgia_order_items i
  JOIN   retail r ON r.shopify_order_id = i.shopify_order_id
  WHERE  i.sku IS NOT NULL AND i.quantity > 0
)
SELECT
  sku,
  SUM(qty) FILTER (WHERE source='web')  AS units_30d_web,
  SUM(price) FILTER (WHERE source='web') AS revenue_30d_web,
  CASE WHEN SUM(qty) FILTER (WHERE source='web') > 0
       THEN SUM(price) FILTER (WHERE source='web') /
            SUM(qty) FILTER (WHERE source='web')
       ELSE NULL END AS avg_price_web,
  SUM(qty) FILTER (WHERE source='pos')  AS units_30d_pos,
  SUM(price) FILTER (WHERE source='pos') AS revenue_30d_pos,
  CASE WHEN SUM(qty) FILTER (WHERE source='pos') > 0
       THEN SUM(price) FILTER (WHERE source='pos') /
            SUM(qty) FILTER (WHERE source='pos')
       ELSE NULL END AS avg_price_pos
FROM items
GROUP BY sku
$$;

-- ── 2. Reorder rates per SKU ────────────────────────────────
CREATE OR REPLACE FUNCTION get_product_reorder_rates()
RETURNS TABLE (
  sku               TEXT,
  total_buyers      BIGINT,
  reorder_rate_30d  NUMERIC,
  reorder_rate_60d  NUMERIC,
  reorder_rate_90d  NUMERIC,
  retention_rate    NUMERIC
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
WITH retail AS (
  SELECT shopify_order_id, customer_id, processed_at
  FROM   meama_georgia_orders
  WHERE  source IN ('web', 'pos', '195189899265', 'online_store', 'Online Store')
    AND  processed_at >= now() - INTERVAL '13 months'
    AND  financial_status IN ('paid', 'partially_paid', 'partially_refunded')
    AND  cancelled_at IS NULL
    AND  customer_id IS NOT NULL
),
items AS (
  SELECT i.sku::TEXT AS sku,
         i.shopify_order_id AS order_id,
         r.customer_id::TEXT AS customer_id,
         r.processed_at
  FROM   meama_georgia_order_items i
  JOIN   retail r ON r.shopify_order_id = i.shopify_order_id
  WHERE  i.sku IS NOT NULL AND i.quantity > 0
),
first_purchase AS (
  SELECT sku, customer_id, MIN(processed_at) AS first_date
  FROM   items
  GROUP BY sku, customer_id
),
next_purchase AS (
  SELECT fp.sku,
         fp.customer_id,
         fp.first_date,
         MIN(i.processed_at) AS next_date
  FROM   first_purchase fp
  JOIN   items i ON i.sku = fp.sku
                AND i.customer_id = fp.customer_id
                AND i.processed_at > fp.first_date
  GROUP BY fp.sku, fp.customer_id, fp.first_date
),
combined AS (
  SELECT fp.sku,
         fp.customer_id,
         fp.first_date,
         np.next_date,
         EXTRACT(EPOCH FROM (np.next_date - fp.first_date)) / 86400 AS days_to_reorder
  FROM first_purchase fp
  LEFT JOIN next_purchase np ON np.sku = fp.sku AND np.customer_id = fp.customer_id
),
-- Retention: active in last 90d (bought this SKU at least once in last 90d)
active_last_90d AS (
  SELECT DISTINCT sku, customer_id
  FROM items
  WHERE processed_at >= now() - INTERVAL '90 days'
)
SELECT
  c.sku,
  COUNT(DISTINCT c.customer_id)                                             AS total_buyers,
  COUNT(*) FILTER (WHERE days_to_reorder <= 30) * 1.0 / COUNT(*)           AS reorder_rate_30d,
  COUNT(*) FILTER (WHERE days_to_reorder <= 60) * 1.0 / COUNT(*)           AS reorder_rate_60d,
  COUNT(*) FILTER (WHERE days_to_reorder <= 90) * 1.0 / COUNT(*)           AS reorder_rate_90d,
  COUNT(DISTINCT a.customer_id) * 1.0 / NULLIF(COUNT(DISTINCT c.customer_id), 0) AS retention_rate
FROM combined c
LEFT JOIN active_last_90d a ON a.sku = c.sku AND a.customer_id = c.customer_id
GROUP BY c.sku
$$;

-- ── 3. Affinity pairs (bought-together) ─────────────────────
CREATE OR REPLACE FUNCTION get_product_affinity_pairs()
RETURNS TABLE (
  sku_a      TEXT,
  sku_b      TEXT,
  co_orders  BIGINT,
  name_a     TEXT,
  name_b     TEXT
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
WITH retail_orders AS (
  SELECT shopify_order_id
  FROM   meama_georgia_orders
  WHERE  source IN ('web', 'pos', '195189899265', 'online_store', 'Online Store')
    AND  cancelled_at IS NULL
    AND  financial_status IN ('paid', 'partially_paid', 'partially_refunded')
    AND  processed_at >= now() - INTERVAL '6 months'
),
sku_pairs AS (
  SELECT a.sku::TEXT AS sku_a,
         b.sku::TEXT AS sku_b,
         COUNT(DISTINCT a.shopify_order_id) AS co_orders
  FROM   meama_georgia_order_items a
  JOIN   meama_georgia_order_items b
    ON   a.shopify_order_id = b.shopify_order_id AND a.sku < b.sku
  JOIN   retail_orders ro ON ro.shopify_order_id = a.shopify_order_id
  WHERE  a.sku IS NOT NULL AND b.sku IS NOT NULL
    AND  a.quantity > 0 AND b.quantity > 0
  GROUP BY a.sku, b.sku
  HAVING COUNT(DISTINCT a.shopify_order_id) >= 3
)
SELECT
  sp.sku_a,
  sp.sku_b,
  sp.co_orders,
  COALESCE(pa.name_en, pa.name, sp.sku_a) AS name_a,
  COALESCE(pb.name_en, pb.name, sp.sku_b) AS name_b
FROM sku_pairs sp
LEFT JOIN products_master pa ON pa.sku = sp.sku_a
LEFT JOIN products_master pb ON pb.sku = sp.sku_b
ORDER BY sp.co_orders DESC
LIMIT 60
$$;

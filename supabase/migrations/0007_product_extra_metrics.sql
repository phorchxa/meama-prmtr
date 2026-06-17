-- ============================================================
-- 0007 · Two focused RPCs for new product metrics
--
-- get_product_new_metrics()  — totals, rankings, growth, margin,
--                              promo split, consumption, refund
-- get_product_top_bundles()  — top 1 bought-together per SKU
-- ============================================================

-- ── 1. New lightweight metrics RPC ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_product_new_metrics()
RETURNS TABLE (
  sku                     TEXT,
  -- all-time retail totals
  total_revenue           NUMERIC,
  total_quantity          BIGINT,
  -- market share last 90 days
  format_rank_pct         NUMERIC,
  total_rank_pct          NUMERIC,
  -- month-over-month growth (current month vs prev month units)
  monthly_growth_pct      NUMERIC,
  -- gross margin % — NULL until products_master.cogs is populated
  margin_pct              NUMERIC,
  -- promo behaviour: full price vs discounted
  full_price_revenue      NUMERIC,
  full_price_units        BIGINT,
  discounted_revenue      NUMERIC,
  discounted_units        BIGINT,
  -- average monthly consumption (last 6 months / 6)
  avg_monthly_consumption NUMERIC,
  -- refund rate: refunded-item orders / total orders
  refund_rate             NUMERIC
)
LANGUAGE sql
SECURITY DEFINER
STABLE
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
  SELECT
    i.sku::TEXT                                AS sku,
    i.shopify_order_id                         AS order_id,
    i.quantity::BIGINT                         AS qty,
    i.price::NUMERIC                           AS price,
    COALESCE(i.line_item_discount::NUMERIC, 0) AS discount,
    COALESCE(i.refunded_quantity::BIGINT, 0)   AS refunded_qty,
    r.processed_at
  FROM meama_georgia_order_items i
  JOIN retail r ON r.shopify_order_id = i.shopify_order_id
  WHERE i.sku IS NOT NULL AND i.quantity > 0
),
-- all-time totals
totals AS (
  SELECT sku,
         SUM(qty)         AS total_quantity,
         SUM(price) AS total_revenue
  FROM   items
  GROUP  BY sku
),
-- market share last 90 days
rank_base AS (
  SELECT i.sku, pm.category, SUM(i.qty) AS qty_90d
  FROM   items i
  JOIN   products_master pm ON pm.sku = i.sku
  WHERE  i.processed_at >= now() - INTERVAL '90 days'
  GROUP  BY i.sku, pm.category
),
fmt_totals  AS (SELECT category, SUM(qty_90d) AS fmt_total FROM rank_base GROUP BY category),
grand_total AS (SELECT SUM(qty_90d) AS gtotal FROM rank_base),
-- month-over-month growth
growth AS (
  SELECT sku,
         SUM(qty) FILTER (WHERE date_trunc('month',processed_at)=date_trunc('month',now()-INTERVAL '1 month')) AS prev_qty,
         SUM(qty) FILTER (WHERE date_trunc('month',processed_at)=date_trunc('month',now()))                    AS curr_qty
  FROM   items
  GROUP  BY sku
),
-- promo split
promo AS (
  SELECT sku,
         SUM(price) FILTER (WHERE discount  = 0) AS full_rev,
         SUM(qty)   FILTER (WHERE discount  = 0) AS full_units,
         SUM(price) FILTER (WHERE discount != 0) AS disc_rev,
         SUM(qty)       FILTER (WHERE discount != 0) AS disc_units
  FROM   items
  GROUP  BY sku
),
-- avg monthly consumption last 6 months
consumption AS (
  SELECT sku, SUM(qty)::NUMERIC / 6.0 AS avg_monthly
  FROM   items
  WHERE  processed_at >= now() - INTERVAL '6 months'
  GROUP  BY sku
),
-- refund rate
refunds AS (
  SELECT sku,
         COUNT(DISTINCT order_id)                                     AS total_orders,
         COUNT(DISTINCT order_id) FILTER (WHERE refunded_qty > 0)    AS refund_orders
  FROM   items
  GROUP  BY sku
)
SELECT
  pm.sku::TEXT,
  COALESCE(t.total_revenue,  0)  AS total_revenue,
  COALESCE(t.total_quantity, 0)  AS total_quantity,
  rb.qty_90d * 1.0 / NULLIF(ft.fmt_total, 0) AS format_rank_pct,
  rb.qty_90d * 1.0 / NULLIF(gt.gtotal,    0) AS total_rank_pct,
  CASE
    WHEN COALESCE(g.prev_qty, 0) = 0 THEN NULL
    ELSE ROUND((COALESCE(g.curr_qty,0) - g.prev_qty)::NUMERIC / g.prev_qty, 4)
  END AS monthly_growth_pct,
  CASE
    WHEN pm.cogs IS NULL
      OR COALESCE(t.total_quantity, 0) = 0
      OR COALESCE(t.total_revenue,  0) = 0 THEN NULL
    ELSE ROUND(
      (t.total_revenue/1.18 - pm.cogs * t.total_quantity) / (t.total_revenue/1.18), 4)
  END AS margin_pct,
  COALESCE(p.full_rev,  0) AS full_price_revenue,
  COALESCE(p.full_units,0) AS full_price_units,
  COALESCE(p.disc_rev,  0) AS discounted_revenue,
  COALESCE(p.disc_units,0) AS discounted_units,
  COALESCE(cons.avg_monthly, 0) AS avg_monthly_consumption,
  COALESCE(r.refund_orders::NUMERIC / NULLIF(r.total_orders,0), 0) AS refund_rate
FROM  products_master pm
LEFT JOIN totals      t   ON t.sku = pm.sku
LEFT JOIN rank_base   rb  ON rb.sku = pm.sku
LEFT JOIN fmt_totals  ft  ON ft.category = rb.category
CROSS JOIN grand_total gt
LEFT JOIN growth      g   ON g.sku = pm.sku
LEFT JOIN promo       p   ON p.sku = pm.sku
LEFT JOIN consumption cons ON cons.sku = pm.sku
LEFT JOIN refunds     r   ON r.sku = pm.sku
WHERE pm.category NOT IN ('Shipping','Test','None') AND pm.category IS NOT NULL
$$;

-- ── 2. Top bundle partner per SKU ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_product_top_bundles()
RETURNS TABLE (
  sku              TEXT,
  top_bundle_sku   TEXT,
  top_bundle_name  TEXT,
  top_bundle_count BIGINT
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
WITH
recent_orders AS (
  SELECT shopify_order_id
  FROM   meama_georgia_orders
  WHERE  source IN ('web', 'pos', '195189899265', 'online_store', 'Online Store')
    AND  cancelled_at IS NULL
    AND  financial_status IN ('paid', 'partially_paid', 'partially_refunded')
    AND  processed_at >= now() - INTERVAL '6 months'
),
pairs AS (
  SELECT a.sku::TEXT AS anchor,
         b.sku::TEXT AS partner,
         COUNT(DISTINCT a.shopify_order_id) AS co_count
  FROM   meama_georgia_order_items a
  JOIN   meama_georgia_order_items b
         ON  a.shopify_order_id = b.shopify_order_id AND a.sku != b.sku
  JOIN   recent_orders ro ON ro.shopify_order_id = a.shopify_order_id
  WHERE  a.sku IS NOT NULL AND b.sku IS NOT NULL
    AND  a.quantity > 0    AND b.quantity > 0
  GROUP  BY a.sku, b.sku
  HAVING COUNT(DISTINCT a.shopify_order_id) >= 2
),
top1 AS (
  SELECT DISTINCT ON (anchor) anchor AS sku, partner, co_count
  FROM   pairs
  ORDER  BY anchor, co_count DESC
)
SELECT
  t.sku,
  t.partner                                   AS top_bundle_sku,
  COALESCE(pm.name_en, pm.name, t.partner)    AS top_bundle_name,
  t.co_count                                  AS top_bundle_count
FROM   top1 t
LEFT JOIN products_master pm ON pm.sku = t.partner
$$;

-- ── Drop the slow mega-RPC (replaced by the two above + existing RPCs) ────────
DROP FUNCTION IF EXISTS get_product_full_stats();

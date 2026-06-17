-- ============================================================
-- 0011 — Fix revenue calculations: price is a line total,
--        not a unit price. Replace SUM(qty * price) → SUM(price)
--        across all product analytics and portfolio functions.
-- ============================================================

-- ── 1. get_product_channel_stats (from 0005) ────────────────
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
  SUM(qty)   FILTER (WHERE source='web')  AS units_30d_web,
  SUM(price) FILTER (WHERE source='web')  AS revenue_30d_web,
  CASE WHEN SUM(qty) FILTER (WHERE source='web') > 0
       THEN SUM(price) FILTER (WHERE source='web') /
            SUM(qty)   FILTER (WHERE source='web')
       ELSE NULL END                       AS avg_price_web,
  SUM(qty)   FILTER (WHERE source='pos')  AS units_30d_pos,
  SUM(price) FILTER (WHERE source='pos')  AS revenue_30d_pos,
  CASE WHEN SUM(qty) FILTER (WHERE source='pos') > 0
       THEN SUM(price) FILTER (WHERE source='pos') /
            SUM(qty)   FILTER (WHERE source='pos')
       ELSE NULL END                       AS avg_price_pos
FROM items
GROUP BY sku
$$;

-- ── 2. get_product_new_metrics (from 0007) ──────────────────
CREATE OR REPLACE FUNCTION get_product_new_metrics()
RETURNS TABLE (
  sku                  TEXT,
  total_revenue        NUMERIC,
  total_quantity       BIGINT,
  format_rank_pct      NUMERIC,
  total_rank_pct       NUMERIC,
  monthly_growth_pct   NUMERIC,
  margin_pct           NUMERIC,
  full_price_revenue   NUMERIC,
  full_price_units     BIGINT,
  discounted_revenue   NUMERIC,
  discounted_units     BIGINT,
  avg_monthly_consumption NUMERIC,
  refund_rate          NUMERIC
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
totals AS (
  SELECT sku,
         SUM(qty)   AS total_quantity,
         SUM(price) AS total_revenue
  FROM   items
  GROUP  BY sku
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
  FROM   items
  GROUP  BY sku
),
promo AS (
  SELECT sku,
         SUM(price) FILTER (WHERE discount  = 0) AS full_rev,
         SUM(qty)   FILTER (WHERE discount  = 0) AS full_units,
         SUM(price) FILTER (WHERE discount != 0) AS disc_rev,
         SUM(qty)   FILTER (WHERE discount != 0) AS disc_units
  FROM   items
  GROUP  BY sku
),
consumption AS (
  SELECT sku, SUM(qty)::NUMERIC / 6.0 AS avg_monthly
  FROM   items
  WHERE  processed_at >= now() - INTERVAL '6 months'
  GROUP  BY sku
),
refunds AS (
  SELECT sku,
         COUNT(DISTINCT order_id)                                     AS total_orders,
         COUNT(DISTINCT order_id) FILTER (WHERE refunded_qty > 0)    AS refund_orders
  FROM   items
  GROUP  BY sku
),
margin_base AS (
  SELECT
    i.sku,
    SUM(i.price)                              AS revenue_ex_vat_proxy,
    SUM(pm.cogs * i.qty)                      AS total_cogs
  FROM  items i
  JOIN  products_master pm ON pm.sku = i.sku
  WHERE pm.cogs IS NOT NULL
  GROUP BY i.sku
)
SELECT
  t.sku,
  ROUND(t.total_revenue,    2)                                          AS total_revenue,
  t.total_quantity,
  ROUND(rb.qty_90d * 1.0 / NULLIF(ft.fmt_total, 0), 4)                AS format_rank_pct,
  ROUND(rb.qty_90d * 1.0 / NULLIF(gt.gtotal,    0), 4)                AS total_rank_pct,
  CASE WHEN COALESCE(g.prev_qty, 0) > 0
       THEN ROUND((COALESCE(g.curr_qty,0) - g.prev_qty)::NUMERIC / g.prev_qty, 4)
       ELSE NULL END                                                    AS monthly_growth_pct,
  CASE WHEN mb.revenue_ex_vat_proxy > 0
       THEN ROUND(1.0 - (mb.total_cogs / mb.revenue_ex_vat_proxy), 4)
       ELSE NULL END                                                    AS margin_pct,
  COALESCE(ROUND(p.full_rev,  2), 0)                                   AS full_price_revenue,
  COALESCE(p.full_units,  0)                                           AS full_price_units,
  COALESCE(ROUND(p.disc_rev,  2), 0)                                   AS discounted_revenue,
  COALESCE(p.disc_units,  0)                                           AS discounted_units,
  ROUND(COALESCE(c.avg_monthly, 0), 2)                                 AS avg_monthly_consumption,
  ROUND(COALESCE(rf.refund_orders, 0)::NUMERIC / NULLIF(rf.total_orders, 0), 4) AS refund_rate
FROM      totals t
LEFT JOIN rank_base  rb ON rb.sku = t.sku
LEFT JOIN fmt_totals ft ON ft.category = rb.category
CROSS JOIN grand_total gt
LEFT JOIN growth     g  ON g.sku  = t.sku
LEFT JOIN promo      p  ON p.sku  = t.sku
LEFT JOIN consumption c ON c.sku  = t.sku
LEFT JOIN refunds    rf ON rf.sku = t.sku
LEFT JOIN margin_base mb ON mb.sku = t.sku
$$;

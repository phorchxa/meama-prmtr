-- ============================================================
-- 0006 · Comprehensive product analytics
--
-- 1. Extends products_master with cogs + stock_quantity
-- 2. Replaces 3 separate RPCs with one get_product_full_stats()
--    covering every metric the team needs:
--    total_revenue, total_quantity, format/total rank,
--    monthly growth, margin %, promo split, channel split,
--    avg monthly consumption, repeat/reorder/retention,
--    top bundle partner, refund rate, stock status
-- ============================================================

-- ── 1. Extend products_master ────────────────────────────────────────────────
ALTER TABLE products_master
  ADD COLUMN IF NOT EXISTS cogs           NUMERIC,        -- unit cost (GEL, ex-VAT)
  ADD COLUMN IF NOT EXISTS stock_quantity INTEGER;        -- current on-hand units

COMMENT ON COLUMN products_master.cogs           IS 'Cost of goods per unit, GEL, ex-VAT. Used for margin %.';
COMMENT ON COLUMN products_master.stock_quantity IS 'Current inventory on hand (units). Used for stock status.';

-- ── 2. Comprehensive stats RPC ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_product_full_stats()
RETURNS TABLE (
  sku                     TEXT,
  -- ── all-time retail totals ──────────────────────────────────────────
  total_revenue           NUMERIC,
  total_quantity          BIGINT,
  -- ── 30d window ─────────────────────────────────────────────────────
  units_30d               BIGINT,
  revenue_30d             NUMERIC,
  -- ── 12-month monthly series ────────────────────────────────────────
  m0  BIGINT, m1  BIGINT, m2  BIGINT, m3  BIGINT,
  m4  BIGINT, m5  BIGINT, m6  BIGINT, m7  BIGINT,
  m8  BIGINT, m9  BIGINT, m10 BIGINT, m11 BIGINT,
  -- ── market share (last 90 days) ────────────────────────────────────
  format_rank_pct         NUMERIC,   -- share within same category
  total_rank_pct          NUMERIC,   -- share of all retail units
  -- ── month-over-month growth ─────────────────────────────────────────
  monthly_growth_pct      NUMERIC,   -- NULL when prior month = 0
  -- ── gross margin (NULL until cogs is populated) ─────────────────────
  margin_pct              NUMERIC,
  -- ── promo behaviour (all-time) ──────────────────────────────────────
  full_price_revenue      NUMERIC,   -- line_item_discount = 0
  full_price_units        BIGINT,
  discounted_revenue      NUMERIC,   -- line_item_discount != 0
  discounted_units        BIGINT,
  -- ── channel split (last 30 days) ────────────────────────────────────
  units_30d_web           BIGINT,
  revenue_30d_web         NUMERIC,
  avg_price_web           NUMERIC,
  units_30d_pos           BIGINT,
  revenue_30d_pos         NUMERIC,
  avg_price_pos           NUMERIC,
  -- ── avg monthly consumption (last 6 months) ─────────────────────────
  avg_monthly_consumption NUMERIC,
  -- ── repeat purchase ─────────────────────────────────────────────────
  repeat_rate             NUMERIC,
  -- ── reorder + retention ─────────────────────────────────────────────
  total_buyers            BIGINT,
  reorder_rate_30d        NUMERIC,
  reorder_rate_60d        NUMERIC,
  reorder_rate_90d        NUMERIC,
  retention_rate          NUMERIC,
  -- ── top bought-together product (last 6 months) ─────────────────────
  top_bundle_sku          TEXT,
  top_bundle_name         TEXT,
  top_bundle_count        BIGINT,
  -- ── refund rate ─────────────────────────────────────────────────────
  refund_rate             NUMERIC,
  -- ── stock status ────────────────────────────────────────────────────
  stock_status            TEXT       -- 'understock' | 'in_stock' | 'overstock' | NULL
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
WITH
-- All valid retail orders (no customer_id filter — for volume/promo/channel)
retail_all AS (
  SELECT shopify_order_id,
         customer_id,
         processed_at,
         -- normalise mobile app + legacy sources to canonical channel names
         CASE
           WHEN source IN ('web', 'online_store', 'Online Store', '195189899265') THEN 'web'
           WHEN source = 'pos' THEN 'pos'
           ELSE source
         END AS source
  FROM   meama_georgia_orders
  WHERE  source IN ('web', 'pos', '195189899265', 'online_store', 'Online Store')
    AND  financial_status IN ('paid', 'partially_paid', 'partially_refunded')
    AND  cancelled_at IS NULL
),
-- All items on valid retail orders
items AS (
  SELECT
    i.sku::TEXT                                    AS sku,
    i.shopify_order_id                             AS order_id,
    i.quantity::BIGINT                             AS qty,
    i.price::NUMERIC                               AS price,
    COALESCE(i.line_item_discount::NUMERIC, 0)     AS discount,
    COALESCE(i.refunded_quantity::BIGINT, 0)       AS refunded_qty,
    r.customer_id::TEXT                            AS customer_id,
    r.processed_at,
    r.source
  FROM meama_georgia_order_items i
  JOIN retail_all r ON r.shopify_order_id = i.shopify_order_id
  WHERE i.sku IS NOT NULL AND i.quantity > 0
),

-- ── All-time totals ──────────────────────────────────────────────────────────
totals AS (
  SELECT sku,
         SUM(qty)         AS total_quantity,
         SUM(price) AS total_revenue
  FROM   items
  GROUP  BY sku
),

-- ── 30d stats + 12 monthly buckets ──────────────────────────────────────────
monthly AS (
  SELECT
    sku,
    SUM(qty)   FILTER (WHERE processed_at >= now() - INTERVAL '30 days')   AS units_30d,
    SUM(price) FILTER (WHERE processed_at >= now() - INTERVAL '30 days')   AS revenue_30d,
    SUM(qty)  FILTER (WHERE date_trunc('month',processed_at) = date_trunc('month', now() - INTERVAL '11 months')) AS m0,
    SUM(qty)  FILTER (WHERE date_trunc('month',processed_at) = date_trunc('month', now() - INTERVAL '10 months')) AS m1,
    SUM(qty)  FILTER (WHERE date_trunc('month',processed_at) = date_trunc('month', now() - INTERVAL  '9 months')) AS m2,
    SUM(qty)  FILTER (WHERE date_trunc('month',processed_at) = date_trunc('month', now() - INTERVAL  '8 months')) AS m3,
    SUM(qty)  FILTER (WHERE date_trunc('month',processed_at) = date_trunc('month', now() - INTERVAL  '7 months')) AS m4,
    SUM(qty)  FILTER (WHERE date_trunc('month',processed_at) = date_trunc('month', now() - INTERVAL  '6 months')) AS m5,
    SUM(qty)  FILTER (WHERE date_trunc('month',processed_at) = date_trunc('month', now() - INTERVAL  '5 months')) AS m6,
    SUM(qty)  FILTER (WHERE date_trunc('month',processed_at) = date_trunc('month', now() - INTERVAL  '4 months')) AS m7,
    SUM(qty)  FILTER (WHERE date_trunc('month',processed_at) = date_trunc('month', now() - INTERVAL  '3 months')) AS m8,
    SUM(qty)  FILTER (WHERE date_trunc('month',processed_at) = date_trunc('month', now() - INTERVAL  '2 months')) AS m9,
    SUM(qty)  FILTER (WHERE date_trunc('month',processed_at) = date_trunc('month', now() - INTERVAL  '1 month'))  AS m10,
    SUM(qty)  FILTER (WHERE date_trunc('month',processed_at) = date_trunc('month', now()))                        AS m11
  FROM items
  GROUP BY sku
),

-- ── Month-over-month growth ──────────────────────────────────────────────────
growth AS (
  SELECT sku,
         SUM(qty) FILTER (WHERE date_trunc('month',processed_at) = date_trunc('month', now() - INTERVAL '1 month')) AS prev_qty,
         SUM(qty) FILTER (WHERE date_trunc('month',processed_at) = date_trunc('month', now()))                        AS curr_qty
  FROM items
  GROUP BY sku
),

-- ── Market share last 90 days ────────────────────────────────────────────────
rank_base AS (
  SELECT i.sku, pm.category, SUM(i.qty) AS qty_90d
  FROM   items i
  JOIN   products_master pm ON pm.sku = i.sku
  WHERE  i.processed_at >= now() - INTERVAL '90 days'
  GROUP  BY i.sku, pm.category
),
format_totals AS (
  SELECT category, SUM(qty_90d) AS format_total FROM rank_base GROUP BY category
),
grand_total AS (SELECT SUM(qty_90d) AS total FROM rank_base),
rankings AS (
  SELECT rb.sku,
         rb.qty_90d * 1.0 / NULLIF(ft.format_total, 0) AS format_rank_pct,
         rb.qty_90d * 1.0 / NULLIF(gt.total, 0)        AS total_rank_pct
  FROM   rank_base rb
  JOIN   format_totals ft ON ft.category = rb.category
  CROSS JOIN grand_total gt
),

-- ── Promo behaviour (all-time) ───────────────────────────────────────────────
promo AS (
  SELECT sku,
         SUM(price) FILTER (WHERE discount  = 0) AS full_price_revenue,
         SUM(qty)   FILTER (WHERE discount  = 0) AS full_price_units,
         SUM(price) FILTER (WHERE discount != 0) AS discounted_revenue,
         SUM(qty)   FILTER (WHERE discount != 0) AS discounted_units
  FROM   items
  GROUP  BY sku
),

-- ── Channel split last 30 days ───────────────────────────────────────────────
channel AS (
  SELECT
    sku,
    SUM(qty)       FILTER (WHERE source='web') AS units_30d_web,
    SUM(price) FILTER (WHERE source='web') AS revenue_30d_web,
    CASE WHEN SUM(qty) FILTER (WHERE source='web') > 0
         THEN SUM(price) FILTER (WHERE source='web') / SUM(qty) FILTER (WHERE source='web')
         ELSE NULL END AS avg_price_web,
    SUM(qty)   FILTER (WHERE source='pos') AS units_30d_pos,
    SUM(price) FILTER (WHERE source='pos') AS revenue_30d_pos,
    CASE WHEN SUM(qty) FILTER (WHERE source='pos') > 0
         THEN SUM(price) FILTER (WHERE source='pos') / SUM(qty) FILTER (WHERE source='pos')
         ELSE NULL END AS avg_price_pos
  FROM   items
  WHERE  processed_at >= now() - INTERVAL '30 days'
  GROUP  BY sku
),

-- ── Avg monthly consumption — last 6 months ──────────────────────────────────
consumption AS (
  SELECT sku, SUM(qty)::NUMERIC / 6.0 AS avg_monthly_consumption
  FROM   items
  WHERE  processed_at >= now() - INTERVAL '6 months'
  GROUP  BY sku
),

-- ── Repeat rate (any window) ─────────────────────────────────────────────────
opc AS (
  SELECT sku, customer_id, COUNT(DISTINCT order_id) AS n_orders
  FROM   items WHERE customer_id IS NOT NULL
  GROUP  BY sku, customer_id
),
repeat_stats AS (
  SELECT sku,
         COUNT(*)                                    AS total_cust,
         COUNT(*) FILTER (WHERE n_orders > 1) * 1.0 / NULLIF(COUNT(*), 0) AS repeat_rate
  FROM   opc
  GROUP  BY sku
),

-- ── Reorder rates (first purchase → next purchase) ───────────────────────────
first_buy AS (
  SELECT sku, customer_id, MIN(processed_at) AS first_date
  FROM   items WHERE customer_id IS NOT NULL
  GROUP  BY sku, customer_id
),
next_buy AS (
  SELECT fb.sku, fb.customer_id,
         MIN(i.processed_at) AS next_date
  FROM   first_buy fb
  JOIN   items i ON i.sku = fb.sku
                AND i.customer_id = fb.customer_id
                AND i.processed_at > fb.first_date
  GROUP  BY fb.sku, fb.customer_id
),
reorder_combined AS (
  SELECT fb.sku, fb.customer_id,
         EXTRACT(EPOCH FROM (nb.next_date - fb.first_date)) / 86400 AS days_gap
  FROM   first_buy fb
  LEFT JOIN next_buy nb ON nb.sku = fb.sku AND nb.customer_id = fb.customer_id
),
active_90d AS (
  SELECT DISTINCT sku, customer_id FROM items
  WHERE  processed_at >= now() - INTERVAL '90 days'
),
reorder_stats AS (
  SELECT
    rc.sku,
    COUNT(DISTINCT rc.customer_id)                                                AS total_buyers,
    COUNT(*) FILTER (WHERE days_gap <= 30)  * 1.0 / COUNT(*)                     AS reorder_rate_30d,
    COUNT(*) FILTER (WHERE days_gap <= 60)  * 1.0 / COUNT(*)                     AS reorder_rate_60d,
    COUNT(*) FILTER (WHERE days_gap <= 90)  * 1.0 / COUNT(*)                     AS reorder_rate_90d,
    COUNT(DISTINCT a.customer_id)::NUMERIC / NULLIF(COUNT(DISTINCT rc.customer_id), 0) AS retention_rate
  FROM   reorder_combined rc
  LEFT JOIN active_90d a ON a.sku = rc.sku AND a.customer_id = rc.customer_id
  GROUP  BY rc.sku
),

-- ── Top bundle partner (last 6 months) ───────────────────────────────────────
recent_6m AS (
  SELECT DISTINCT shopify_order_id
  FROM   retail_all
  WHERE  processed_at >= now() - INTERVAL '6 months'
),
bundle_raw AS (
  SELECT a.sku::TEXT AS anchor, b.sku::TEXT AS partner,
         COUNT(DISTINCT a.shopify_order_id) AS co_count
  FROM   meama_georgia_order_items a
  JOIN   meama_georgia_order_items b
         ON  a.shopify_order_id = b.shopify_order_id AND a.sku != b.sku
  JOIN   recent_6m rm ON rm.shopify_order_id = a.shopify_order_id
  WHERE  a.sku IS NOT NULL AND b.sku IS NOT NULL
    AND  a.quantity > 0    AND b.quantity > 0
  GROUP  BY a.sku, b.sku
),
top_bundle AS (
  SELECT DISTINCT ON (anchor) anchor AS sku, partner AS top_bundle_sku, co_count
  FROM   bundle_raw
  ORDER  BY anchor, co_count DESC
),

-- ── Refund rate ───────────────────────────────────────────────────────────────
refund_agg AS (
  SELECT sku,
         COUNT(DISTINCT order_id)                                     AS total_orders,
         COUNT(DISTINCT order_id) FILTER (WHERE refunded_qty > 0)    AS refunded_orders
  FROM   items
  GROUP  BY sku
)

-- ── Final assembly ────────────────────────────────────────────────────────────
SELECT
  pm.sku::TEXT,
  COALESCE(t.total_revenue,  0)                   AS total_revenue,
  COALESCE(t.total_quantity, 0)                   AS total_quantity,
  COALESCE(m.units_30d,  0)                       AS units_30d,
  COALESCE(m.revenue_30d, 0)                      AS revenue_30d,
  COALESCE(m.m0,0), COALESCE(m.m1,0), COALESCE(m.m2,0),  COALESCE(m.m3,0),
  COALESCE(m.m4,0), COALESCE(m.m5,0), COALESCE(m.m6,0),  COALESCE(m.m7,0),
  COALESCE(m.m8,0), COALESCE(m.m9,0), COALESCE(m.m10,0), COALESCE(m.m11,0),
  rk.format_rank_pct,
  rk.total_rank_pct,
  CASE
    WHEN COALESCE(g.prev_qty, 0) = 0 THEN NULL
    ELSE ROUND((COALESCE(g.curr_qty,0) - g.prev_qty)::NUMERIC / g.prev_qty, 4)
  END AS monthly_growth_pct,
  CASE
    WHEN pm.cogs IS NULL
      OR COALESCE(t.total_quantity, 0) = 0
      OR COALESCE(t.total_revenue,  0) = 0 THEN NULL
    ELSE ROUND(
      (t.total_revenue / 1.18 - pm.cogs * t.total_quantity)
      / (t.total_revenue / 1.18), 4)
  END AS margin_pct,
  COALESCE(p.full_price_revenue, 0)               AS full_price_revenue,
  COALESCE(p.full_price_units,   0)               AS full_price_units,
  COALESCE(p.discounted_revenue, 0)               AS discounted_revenue,
  COALESCE(p.discounted_units,   0)               AS discounted_units,
  COALESCE(ch.units_30d_web,     0)               AS units_30d_web,
  COALESCE(ch.revenue_30d_web,   0)               AS revenue_30d_web,
  ch.avg_price_web,
  COALESCE(ch.units_30d_pos,     0)               AS units_30d_pos,
  COALESCE(ch.revenue_30d_pos,   0)               AS revenue_30d_pos,
  ch.avg_price_pos,
  COALESCE(cons.avg_monthly_consumption, 0)       AS avg_monthly_consumption,
  COALESCE(rs.repeat_rate, 0)                     AS repeat_rate,
  COALESCE(rr.total_buyers, 0)                    AS total_buyers,
  COALESCE(rr.reorder_rate_30d, 0)                AS reorder_rate_30d,
  COALESCE(rr.reorder_rate_60d, 0)                AS reorder_rate_60d,
  COALESCE(rr.reorder_rate_90d, 0)                AS reorder_rate_90d,
  COALESCE(rr.retention_rate, 0)                  AS retention_rate,
  tb.top_bundle_sku,
  COALESCE(pb.name_en, pb.name, tb.top_bundle_sku) AS top_bundle_name,
  tb.co_count                                     AS top_bundle_count,
  COALESCE(ra.refunded_orders::NUMERIC / NULLIF(ra.total_orders, 0), 0) AS refund_rate,
  CASE
    WHEN pm.stock_quantity IS NULL
      OR COALESCE(cons.avg_monthly_consumption, 0) = 0 THEN NULL
    WHEN pm.stock_quantity::NUMERIC / cons.avg_monthly_consumption < 2  THEN 'understock'
    WHEN pm.stock_quantity::NUMERIC / cons.avg_monthly_consumption <= 3 THEN 'in_stock'
    ELSE 'overstock'
  END AS stock_status
FROM  products_master pm
LEFT JOIN totals        t   ON t.sku   = pm.sku
LEFT JOIN monthly       m   ON m.sku   = pm.sku
LEFT JOIN growth        g   ON g.sku   = pm.sku
LEFT JOIN rankings      rk  ON rk.sku  = pm.sku
LEFT JOIN promo         p   ON p.sku   = pm.sku
LEFT JOIN channel       ch  ON ch.sku  = pm.sku
LEFT JOIN consumption   cons ON cons.sku = pm.sku
LEFT JOIN repeat_stats  rs  ON rs.sku  = pm.sku
LEFT JOIN reorder_stats rr  ON rr.sku  = pm.sku
LEFT JOIN top_bundle    tb  ON tb.sku  = pm.sku
LEFT JOIN products_master pb ON pb.sku = tb.top_bundle_sku
LEFT JOIN refund_agg    ra  ON ra.sku  = pm.sku
WHERE pm.category NOT IN ('Shipping','Test','None')
  AND pm.category IS NOT NULL
$$;

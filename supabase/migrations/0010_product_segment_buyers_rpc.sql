-- ============================================================
-- 0010 · Product → segment buyers RPC
--
-- get_product_segment_buyers(p_sku TEXT)
--   Returns the distribution of portfolio_customers segments and
--   RFM labels for customers who have purchased a given SKU in
--   the last 12 months (retail channels only).
--   Used by the Product Intelligence page to show which customer
--   segments buy each product, and to link to Portfolios.
-- ============================================================

CREATE OR REPLACE FUNCTION get_product_segment_buyers(p_sku TEXT)
RETURNS TABLE (
  segment        TEXT,
  rfm_label      TEXT,
  customer_count BIGINT,
  total_spend    NUMERIC,
  avg_spend      NUMERIC
)
LANGUAGE sql
SECURITY DEFINER
STABLE
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
  WHERE  i.sku = p_sku
    AND  i.quantity > 0
),
buyer_spend AS (
  SELECT
    sb.customer_id,
    SUM(i.price)::NUMERIC AS total_spend
  FROM sku_buyers sb
  JOIN retail r ON r.customer_id = sb.customer_id
  JOIN meama_georgia_order_items i ON i.shopify_order_id = r.shopify_order_id
                                   AND i.sku = p_sku
                                   AND i.quantity > 0
  GROUP BY sb.customer_id
)
SELECT
  COALESCE(pc.segment, 'unknown')   AS segment,
  COALESCE(pc.rfm_label, 'unknown') AS rfm_label,
  COUNT(*)                           AS customer_count,
  ROUND(SUM(bs.total_spend), 2)     AS total_spend,
  ROUND(AVG(bs.total_spend), 2)     AS avg_spend
FROM buyer_spend bs
LEFT JOIN portfolio_customers pc
       ON pc.shopify_customer_id::TEXT = bs.customer_id
GROUP BY COALESCE(pc.segment, 'unknown'),
         COALESCE(pc.rfm_label, 'unknown')
ORDER BY COUNT(*) DESC
$$;

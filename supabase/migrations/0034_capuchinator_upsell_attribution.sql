-- 0034 — Capuchinator checkout-upsell attribution (upsell-item revenue only).
--
-- The "capuchinator + metal cup 85₾" checkout upsell rides alongside a main
-- purchase: the order carries the main bundle's discount code, so the generic
-- code/tag/promotion_name attribution credits the order to the MAIN bundle and
-- the upsell never gets counted. This dedicated path credits the Upsell campaign
-- ONLY the upselled line items (capuchinator + metal cup ≈ ₾85), not the order
-- total, and is additive (the order still counts toward its main bundle).
--
-- Consolidation: the duplicate promotions "Capuchinator + Metal Cup 85₾" and
-- "Capuchinator + Metal Cup 85₾ (KA)" were the same offer as the upsell and have
-- been merged into "Capuchinator Checkout Upsell" (tag_pattern = 'capuchinator').

-- Identify upsell orders by the capuchinator+cup signal (code/promotion_name/tag),
-- then sum just the capuchinator (Milk Frother) + metal cup (mcm*) line items.
CREATE OR REPLACE FUNCTION campaigns.attribute_capuchinator_upsell(window_days integer DEFAULT 365)
RETURNS integer LANGUAGE sql SECURITY DEFINER SET search_path = campaigns, public AS $b$
WITH cmp AS (
  SELECT c.id FROM campaigns.campaigns c
  JOIN campaigns.promotions p ON p.id = c.promotion_id
  WHERE p.tag_pattern = 'capuchinator' LIMIT 1
),
o AS MATERIALIZED (
  SELECT shopify_order_id soid, customer_id, created_at
  FROM public.meama_georgia_orders
  WHERE financial_status='paid' AND cancelled_at IS NULL
    AND created_at > NOW() - make_interval(days => window_days)
    AND (discount_code ILIKE 'capucup85%'
      OR promotion_name ILIKE '%capuchinator + metal cup%'
      OR tag ILIKE '%capuchinator + metal cup%')
),
rev AS (
  SELECT o.soid, o.customer_id, o.created_at, COALESCE(SUM(oi.price),0) AS upsell_rev
  FROM o JOIN public.meama_georgia_order_items oi ON oi.shopify_order_id = o.soid
  WHERE oi.sku ILIKE 'Milk Frother%' OR oi.sku ILIKE 'mcm%'
  GROUP BY o.soid, o.customer_id, o.created_at
),
ins AS (
  INSERT INTO campaigns.campaign_orders (campaign_id, shopify_order_id, customer_id, attributed_revenue, attribution_window, created_at)
  SELECT (SELECT id FROM cmp), r.soid,
    CASE WHEN EXISTS(SELECT 1 FROM public.customers_georgia cg WHERE cg.shopify_customer_id=r.customer_id) THEN r.customer_id END,
    r.upsell_rev, 0, r.created_at
  FROM rev r
  WHERE r.upsell_rev > 0 AND (SELECT id FROM cmp) IS NOT NULL
  ON CONFLICT (campaign_id, shopify_order_id) DO UPDATE SET attributed_revenue = EXCLUDED.attributed_revenue
  RETURNING 1
)
SELECT count(*)::int FROM ins;
$b$;

GRANT EXECUTE ON FUNCTION campaigns.attribute_capuchinator_upsell(integer) TO service_role;

SELECT cron.schedule(
  'attribute-capuchinator-upsell',
  '12 * * * *',
  $$ SELECT campaigns.attribute_capuchinator_upsell(365); $$
);

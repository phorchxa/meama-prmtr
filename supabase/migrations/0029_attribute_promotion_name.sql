-- 0029 — Attribute orders to campaigns via the custom.promotion_name metafield.
--
-- promotion_name is the cleanest promo signal Shopify gives us: it names the
-- applied promotion directly. Values are matched in priority order against
-- campaigns.promotions:
--   1. exact discount code            -> p.shopify_code            (e.g. "mix8", "MEAMA20")
--   2. auto-generated prefixed code   -> p.shopify_code || '-%'    (e.g. "3PLUS1-0SGX09PGWI")
--   3. exact bundle tag               -> p.tag_pattern             (e.g. "6 Capsule Us")
--   4. exact promotion name           -> p.name
-- Exactly one promotion is chosen per order (DISTINCT ON by priority) so one
-- order is never double-counted across promotions. Idempotent via the existing
-- unique (campaign_id, shopify_order_id) constraint on campaign_orders.
--
-- NOTE: the orders CTE is MATERIALIZED on purpose. Without it the planner
-- evaluates the ILIKE prefix join as a 206K x 174 nested loop; materialising the
-- (tiny) set of orders that actually carry a promotion_name forces the join to
-- drive from there and keeps the function fast enough for the 15-min cron.

CREATE OR REPLACE FUNCTION campaigns.attribute_promotion_name_orders(window_days integer DEFAULT 30)
RETURNS integer LANGUAGE sql SECURITY DEFINER SET search_path = campaigns, public AS $b$
WITH o AS MATERIALIZED (
  SELECT shopify_order_id soid, customer_id, total, created_at,
         lower(btrim(promotion_name)) n, promotion_name pn
  FROM public.meama_georgia_orders
  WHERE promotion_name IS NOT NULL AND btrim(promotion_name) <> ''
    AND financial_status = 'paid' AND cancelled_at IS NULL
    AND created_at > NOW() - make_interval(days => window_days)
),
m AS (
  SELECT DISTINCT ON (o.soid) c.id cid, o.soid, o.customer_id, o.total, o.created_at
  FROM o JOIN campaigns.promotions p
    ON o.n = lower(p.shopify_code) OR o.pn ILIKE p.shopify_code || '-%'
    OR o.n = lower(p.tag_pattern) OR o.n = lower(p.name)
  JOIN campaigns.campaigns c ON c.promotion_id = p.id
  ORDER BY o.soid,
    CASE WHEN o.n = lower(p.shopify_code) THEN 1 WHEN o.pn ILIKE p.shopify_code || '-%' THEN 2
         WHEN o.n = lower(p.tag_pattern) THEN 3 ELSE 4 END
),
ins AS (
  INSERT INTO campaigns.campaign_orders (campaign_id, shopify_order_id, customer_id, attributed_revenue, attribution_window, created_at)
  SELECT cid, soid,
    CASE WHEN EXISTS (SELECT 1 FROM public.customers_georgia cg WHERE cg.shopify_customer_id = m.customer_id) THEN m.customer_id END,
    total, 0, created_at FROM m
  ON CONFLICT (campaign_id, shopify_order_id) DO NOTHING RETURNING 1
)
SELECT count(*)::int FROM ins;
$b$;

REVOKE ALL ON FUNCTION campaigns.attribute_promotion_name_orders(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION campaigns.attribute_promotion_name_orders(integer) TO service_role;

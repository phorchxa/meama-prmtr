-- 0039 — Cross-attribute promotion_name orders to STACKED tag promotions.
--
-- The canonical pipeline going forward:
--   1. Every promo order carries custom.promotion_name (guaranteed signal).
--   2. Match it to a promotion; auto-create one if unseen (migration 0038).
--   3. THEN look at the same order's `tag` column: if any tag matches an
--      EXISTING promotion's tag_pattern, credit that promotion's revenue too —
--      so a second offer stacked on the order (e.g. a 3+1 gift sitting beside a
--      bundle) gets its share. (This step.)
--
-- This makes attribute_promotion_name_orders emit TWO kinds of rows per order:
--   • prim      — exactly one promotion matched by promotion_name (unchanged 0029 logic).
--   • cross_tag — every EXISTING promotion whose tag_pattern appears in o.tag.
-- An order is credited (full revenue) to each matched campaign — multi-attribution
-- is by design (campaign_orders has no unique on shopify_order_id alone), so
-- SUM(revenue) across campaigns intentionally exceeds order revenue. Idempotent
-- via UNIQUE(campaign_id, shopify_order_id); the UNION + ON CONFLICT collapse the
-- case where the tag promo IS the promotion_name promo (no self double-count).
--
-- cross_tag NEVER creates promotions — it only credits ones already catalogued
-- (per the "use tag that is already in promotions table" rule).
--
-- EXCLUDED tag_patterns (umbrella / app-mechanism wrappers that sit on most
-- bundle orders and would otherwise swallow all bundle revenue, or that already
-- have their own dedicated attribution cron). Extend this list as new wrapper
-- tags appear:
--   'easybundle - bundle order'    Easy Bundle  — generic bundle-app wrapper
--   'kite: bxgy discount applied'  Kite BXGY    — app mechanism, not a specific offer
--   'cw:upsell'                    CW Upsell    — handled by attribute-checkout-cups-upsell
--   'capuchinator'                 Capuchinator — handled by attribute-capuchinator-upsell

CREATE OR REPLACE FUNCTION campaigns.attribute_promotion_name_orders(window_days integer DEFAULT 30)
RETURNS integer LANGUAGE sql SECURITY DEFINER SET search_path = campaigns, public AS $b$
WITH o AS MATERIALIZED (
  SELECT shopify_order_id soid, customer_id, total, created_at, tag,
         lower(btrim(promotion_name)) n, promotion_name pn
  FROM public.meama_georgia_orders
  WHERE promotion_name IS NOT NULL AND btrim(promotion_name) <> ''
    AND financial_status = 'paid' AND cancelled_at IS NULL
    AND created_at > NOW() - make_interval(days => window_days)
),
-- Primary: one promotion per order, matched by promotion_name (priority order).
prim AS (
  SELECT DISTINCT ON (o.soid) c.id cid, o.soid, o.customer_id, o.total, o.created_at
  FROM o JOIN campaigns.promotions p
    ON o.n = lower(p.shopify_code) OR o.pn ILIKE p.shopify_code || '-%'
    OR o.n = lower(p.tag_pattern) OR o.n = lower(p.name)
  JOIN campaigns.campaigns c ON c.promotion_id = p.id
  ORDER BY o.soid,
    CASE WHEN o.n = lower(p.shopify_code) THEN 1 WHEN o.pn ILIKE p.shopify_code || '-%' THEN 2
         WHEN o.n = lower(p.tag_pattern) THEN 3 ELSE 4 END
),
-- Stacked: every EXISTING tag-pattern promotion present in the order's tags,
-- minus the umbrella/app wrappers above.
cross_tag AS (
  SELECT DISTINCT c.id cid, o.soid, o.customer_id, o.total, o.created_at
  FROM o JOIN campaigns.promotions p
    ON p.tag_pattern IS NOT NULL AND btrim(p.tag_pattern) <> ''
   AND lower(btrim(p.tag_pattern)) <> ALL (ARRAY[
         'easybundle - bundle order',
         'kite: bxgy discount applied',
         'cw:upsell',
         'capuchinator'
       ])
   AND o.tag ILIKE '%' || p.tag_pattern || '%'
  JOIN campaigns.campaigns c ON c.promotion_id = p.id
),
combined AS (
  SELECT cid, soid, customer_id, total, created_at FROM prim
  UNION
  SELECT cid, soid, customer_id, total, created_at FROM cross_tag
),
ins AS (
  INSERT INTO campaigns.campaign_orders (campaign_id, shopify_order_id, customer_id, attributed_revenue, attribution_window, created_at)
  SELECT cid, soid,
    CASE WHEN EXISTS (SELECT 1 FROM public.customers_georgia cg WHERE cg.shopify_customer_id = combined.customer_id) THEN combined.customer_id END,
    total, 0, created_at FROM combined
  ON CONFLICT (campaign_id, shopify_order_id) DO NOTHING RETURNING 1
)
SELECT count(*)::int FROM ins;
$b$;

REVOKE ALL ON FUNCTION campaigns.attribute_promotion_name_orders(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION campaigns.attribute_promotion_name_orders(integer) TO service_role;

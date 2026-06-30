-- 0038 — Auto-create promotions from unseen custom.promotion_name values.
--
-- The hourly sync-order-promotions edge fn pulls custom.promotion_name onto
-- orders; attribute_promotion_name_orders (0029) then matches those names to
-- campaigns.promotions. Anything whose promotion_name has NO matching promotion
-- row stays unattributed. This migration closes that gap: it discovers unseen
-- promotion_name values and creates a stub promotion (+ a draft campaign) for
-- each, so the very next attribution pass picks them up. Coverage becomes
-- self-maintaining — new promos catalogue themselves.
--
-- Stubs are deliberately minimal and FLAGGED FOR REVIEW:
--   promotions.discovery_source = 'promotion_name', status = 'draft'
--   campaigns.origin = 'auto', status = 'draft'
-- They carry NO discount_value (type 'bundle') so there is zero discount risk
-- and they never read as a confirmed/official offer. A human enriches them
-- (real type, discount %, excluded_segments) from the Campaigns review queue.
--
-- TODO (later): a Claude batch job (claude-sonnet-4-6, strict JSON, per the
-- NO-ML rule) will classify discovery_source='promotion_name' stubs into a real
-- type/discount_type and, if it flips a stub to 'discount', it MUST also set
-- excluded_segments = ARRAY['capsule_loyalist','flavor_explorer'] and cap the
-- discount at 25% (MAX_DISCOUNT). Until then these stay 'bundle' stubs.

-- Mark machine-discovered promotions so reviewers (and the future Claude pass)
-- can find them, and so they never collide with the hand-curated catalogue.
ALTER TABLE campaigns.promotions
  ADD COLUMN IF NOT EXISTS discovery_source text;

-- Idempotency for descriptive (tag-style) stubs, which have a NULL shopify_code
-- and so can't use the existing UNIQUE(shopify_code) as a conflict target.
-- Scoped to discovered rows only, so it never clashes with curated promotions.
CREATE UNIQUE INDEX IF NOT EXISTS promotions_discovery_name_uidx
  ON campaigns.promotions (lower(name))
  WHERE discovery_source = 'promotion_name';

CREATE OR REPLACE FUNCTION campaigns.upsert_promotions_from_promotion_name(window_days integer DEFAULT 30)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = campaigns, public AS $b$
DECLARE
  v_created integer := 0;
  v_started timestamptz := clock_timestamp();
BEGIN
  -- o is MATERIALIZED so the planner drives the unseen/ILIKE checks from the
  -- tiny set of distinct promotion_names, not a 206K x 174 nested loop (same
  -- reason attribute_promotion_name_orders materialises its orders CTE).
  WITH o AS MATERIALIZED (
    SELECT DISTINCT lower(btrim(promotion_name)) AS n, btrim(promotion_name) AS pn
    FROM public.meama_georgia_orders
    WHERE promotion_name IS NOT NULL AND btrim(promotion_name) <> ''
      AND financial_status = 'paid' AND cancelled_at IS NULL
      AND created_at > NOW() - make_interval(days => window_days)
      -- employee codes are never promotions
      AND promotion_name NOT ILIKE '%employee%'
      AND promotion_name NOT ILIKE '%tanam%'
      AND promotion_name NOT ILIKE '%თანამშ%'
  ),
  -- keep only names not already matched by any promotion — identical priority
  -- logic to attribute_promotion_name_orders so the two never disagree.
  uncatalogued AS (
    SELECT o.n, o.pn FROM o
    WHERE NOT EXISTS (
      SELECT 1 FROM campaigns.promotions p
      WHERE o.n = lower(p.shopify_code)
         OR o.pn ILIKE p.shopify_code || '-%'
         OR o.n = lower(p.tag_pattern)
         OR o.n = lower(p.name)
    )
  ),
  -- A no-space value is a discount code; a spaced value is a descriptive tag.
  -- Strip Shopify's per-order auto-suffix ("base-<MIXED ALNUM 6+>") so every
  -- order of the same code collapses to ONE promotion. The suffix must contain
  -- both a letter and a digit to qualify, so pure-digit/date suffixes
  -- (e.g. "newcust-versbun-18062026") are kept as part of the real code.
  suffixed AS (
    SELECT pn,
           (pn !~ ' ') AS no_space,
           (regexp_match(pn, '-([A-Za-z0-9]{6,})$'))[1] AS suf
    FROM uncatalogued
  ),
  classified AS (
    SELECT pn,
           no_space AS is_code,
           CASE
             WHEN no_space AND suf IS NOT NULL AND suf ~ '[A-Za-z]' AND suf ~ '[0-9]'
               THEN left(pn, length(pn) - length(suf) - 1)   -- drop "-<suf>"
             WHEN no_space
               THEN pn
             ELSE NULL                                       -- descriptive
           END AS code_base
    FROM suffixed
  ),
  -- Collapse case variants and all suffixes of a code to a single row.
  deduped AS (
    SELECT DISTINCT ON (COALESCE(lower(code_base), lower(pn)))
           pn, is_code, code_base
    FROM classified
    ORDER BY COALESCE(lower(code_base), lower(pn)), pn
  ),
  ins_code AS (
    INSERT INTO campaigns.promotions (name, type, shopify_code, discovery_source, status)
    SELECT code_base, 'bundle', code_base, 'promotion_name', 'draft'
    FROM deduped
    WHERE is_code AND btrim(code_base) <> ''
    ON CONFLICT (shopify_code) DO NOTHING
    RETURNING 1
  ),
  ins_desc AS (
    INSERT INTO campaigns.promotions (name, type, tag_pattern, discovery_source, status)
    SELECT pn, 'bundle', pn, 'promotion_name', 'draft'
    FROM deduped
    WHERE NOT is_code
    ON CONFLICT (lower(name)) WHERE discovery_source = 'promotion_name' DO NOTHING
    RETURNING 1
  )
  SELECT (SELECT count(*) FROM ins_code) + (SELECT count(*) FROM ins_desc)
  INTO v_created;

  -- Give every discovered promotion lacking one a draft execution row.
  -- Idempotent: only inserts where no campaign yet exists for the promotion.
  INSERT INTO campaigns.campaigns (promotion_id, name, channel, status, origin)
  SELECT p.id, p.name || ' — Auto-discovered', 'ecommerce', 'draft', 'auto'
  FROM campaigns.promotions p
  LEFT JOIN campaigns.campaigns c ON c.promotion_id = p.id
  WHERE p.discovery_source = 'promotion_name' AND c.id IS NULL;

  -- Silent failures forbidden: every run leaves a sync_log row.
  INSERT INTO public.order_promotion_sync_log
    (sync_type, window_days, rows_synced, status, duration_ms)
  VALUES ('promotion-discovery', window_days, v_created, 'success',
          (extract(epoch FROM clock_timestamp() - v_started) * 1000)::int);

  RETURN v_created;
EXCEPTION WHEN OTHERS THEN
  INSERT INTO public.order_promotion_sync_log
    (sync_type, window_days, status, error_msg)
  VALUES ('promotion-discovery', window_days, 'error', SQLERRM);
  RAISE;
END;
$b$;

REVOKE ALL ON FUNCTION campaigns.upsert_promotions_from_promotion_name(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION campaigns.upsert_promotions_from_promotion_name(integer)
  TO service_role;

-- Re-point the existing 15-min attribution cron to discover first, then
-- attribute — so a promo discovered this tick is attributed in the same tick.
-- cron.schedule upserts by job name, so this just updates the 0031 schedule.
SELECT cron.schedule(
  'attribute-promotion-name-orders',
  '*/15 * * * *',
  $$
  SELECT campaigns.upsert_promotions_from_promotion_name(30);
  SELECT campaigns.attribute_promotion_name_orders(30);
  $$
);

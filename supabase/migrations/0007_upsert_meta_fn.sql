-- 0007_upsert_meta_fn.sql
-- Public-schema RPC that the nightly sync job calls to upsert Meta insights
-- into the campaigns schema (which is not exposed via REST directly).
-- SECURITY DEFINER so it runs as the function owner regardless of caller role.

CREATE OR REPLACE FUNCTION public.upsert_meta_insights(rows jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  inserted integer := 0;
BEGIN
  INSERT INTO campaigns.meta_insights (
    meta_campaign_id,
    meta_campaign_name,
    meta_account_id,
    date,
    spend_usd,
    impressions,
    clicks,
    roas,
    campaign_id
  )
  SELECT
    r->>'meta_campaign_id',
    r->>'meta_campaign_name',
    r->>'meta_account_id',
    (r->>'date')::date,
    (r->>'spend_usd')::numeric,
    (r->>'impressions')::bigint,
    (r->>'clicks')::bigint,
    CASE WHEN r->>'roas' IS NOT NULL AND r->>'roas' != 'null'
         THEN (r->>'roas')::numeric END,
    NULL
  FROM jsonb_array_elements(rows) r
  ON CONFLICT (meta_campaign_id, date) DO UPDATE SET
    spend_usd    = EXCLUDED.spend_usd,
    impressions  = EXCLUDED.impressions,
    clicks       = EXCLUDED.clicks,
    roas         = EXCLUDED.roas,
    synced_at    = now();

  GET DIAGNOSTICS inserted = ROW_COUNT;
  RETURN inserted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_meta_insights(jsonb) TO service_role;

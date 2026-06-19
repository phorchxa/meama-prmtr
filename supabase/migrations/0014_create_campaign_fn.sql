-- 0014_create_campaign_fn.sql
-- Public-schema RPC for creating a campaign (+ optional promotion) from the
-- "Add campaign" modal. The campaigns schema is not exposed via REST, so this
-- SECURITY DEFINER function runs as owner and is the only write path.
--
-- Business rules honoured here:
--   • New campaigns land as status='draft', origin='manual'.
--   • Discount/gift promotions exclude the no-discount VIP segments
--     (capsule_loyalist, flavor_explorer) per business_rules.py.
--   • The 25% discount cap is validated in the API layer before this is called.

CREATE OR REPLACE FUNCTION public.create_campaign(payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_name      text := NULLIF(trim(payload->>'name'), '');
  v_channel   text := COALESCE(NULLIF(payload->>'channel', ''), 'email');
  v_type      text := NULLIF(payload->>'promo_type', '');
  v_segment   text := NULLIF(payload->>'target_segment', '');
  v_disc      numeric := CASE WHEN payload->>'discount_value' ~ '^[0-9]+(\.[0-9]+)?$'
                              THEN (payload->>'discount_value')::numeric END;
  v_sched     timestamptz := CASE WHEN NULLIF(payload->>'scheduled_at', '') IS NOT NULL
                                  THEN (payload->>'scheduled_at')::timestamptz END;
  v_promo_id  uuid;
  v_id        uuid;
BEGIN
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'campaign name is required';
  END IF;

  -- Optional promotion row (so promo_type / discount survive in the catalogue).
  IF v_type IS NOT NULL THEN
    INSERT INTO campaigns.promotions (name, type, discount_type, discount_value, excluded_segments)
    VALUES (
      v_name,
      v_type,
      CASE WHEN v_disc IS NOT NULL THEN 'percentage' END,
      v_disc,
      CASE WHEN v_type IN ('discount', 'gift')
           THEN ARRAY['capsule_loyalist', 'flavor_explorer'] END
    )
    RETURNING id INTO v_promo_id;
  END IF;

  INSERT INTO campaigns.campaigns (promotion_id, name, channel, status, origin, target_segment, scheduled_at)
  VALUES (v_promo_id, v_name, v_channel, 'draft', 'manual', v_segment, v_sched)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'id',             v_id,
    'name',           v_name,
    'channel',        v_channel,
    'status',         'draft',
    'promo_type',     v_type,
    'discount_value', v_disc,
    'shopify_code',   NULL,
    'target_segment', v_segment,
    'scheduled_at',   v_sched
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_campaign(jsonb) TO service_role;

-- 0041 — Fix promotion/campaign status drift.
--
-- campaigns.status is the curated source of truth for "is this running" (migration 0026
-- explicitly re-activated only the confirmed-live campaigns; 0036 set both sides together
-- when disabling). But promotions.status kept the DEFAULT 'active' from migration 0020 and
-- was never back-filled, so 201 promotions read 'active' while their campaign reads
-- 'completed'. None of these are live offers (the 4 genuinely-live offers are active/active).
--
-- Intended invariant:  promo active ⇔ campaign active · promo inactive ⇔ campaign completed.

-- 1. Align the drifted 201: completed campaign ⇒ inactive promotion.
UPDATE campaigns.promotions p
SET status = 'inactive'
FROM campaigns.campaigns c
WHERE c.promotion_id = p.id
  AND p.status = 'active'
  AND c.status = 'completed';

-- 2. Keep the write path in sync going forward. set_campaign_status (the only write path,
--    from migration 0033) now also moves the linked promotion's status so the two can't
--    drift apart again.
CREATE OR REPLACE FUNCTION public.set_campaign_status(p_campaign_id uuid, p_status text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_status text;
  v_promo_status text;
BEGIN
  IF p_status NOT IN ('active','completed','draft','pending_approval','rejected') THEN
    RAISE EXCEPTION 'invalid status: %', p_status;
  END IF;

  UPDATE campaigns.campaigns SET status = p_status
   WHERE id = p_campaign_id
   RETURNING status INTO v_status;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'campaign not found: %', p_campaign_id;
  END IF;

  -- Map campaign status -> promotion offer status and sync the linked promotion.
  v_promo_status := CASE p_status
    WHEN 'active' THEN 'active'
    WHEN 'draft'  THEN 'draft'
    WHEN 'pending_approval' THEN 'draft'
    ELSE 'inactive'  -- completed / rejected
  END;
  UPDATE campaigns.promotions pr
     SET status = v_promo_status
    FROM campaigns.campaigns c
   WHERE c.id = p_campaign_id
     AND pr.id = c.promotion_id;

  RETURN jsonb_build_object('id', p_campaign_id, 'status', v_status);
END;
$$;

REVOKE ALL ON FUNCTION public.set_campaign_status(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_campaign_status(uuid, text) TO service_role;

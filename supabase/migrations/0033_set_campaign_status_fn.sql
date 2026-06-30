-- 0033 — RPC to toggle a campaign's status from the Promotions › Edit tab.
-- The campaigns schema is not exposed via REST, so this SECURITY DEFINER function
-- in public is the write path (mirrors create_campaign).
CREATE OR REPLACE FUNCTION public.set_campaign_status(p_campaign_id uuid, p_status text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_status text;
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
  RETURN jsonb_build_object('id', p_campaign_id, 'status', v_status);
END;
$$;

REVOKE ALL ON FUNCTION public.set_campaign_status(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_campaign_status(uuid, text) TO service_role;

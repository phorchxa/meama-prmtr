-- 0028 — Shopify order metafield custom.promotion_name
-- Adds the promotion_name column (synced from Shopify Admin API by the
-- sync-order-promotions edge function) and a bulk-update RPC used by it.

ALTER TABLE public.meama_georgia_orders
  ADD COLUMN IF NOT EXISTS promotion_name text;

-- Trigram-friendly btree on the trimmed/lowered value for fast attribution joins.
CREATE INDEX IF NOT EXISTS idx_orders_promotion_name
  ON public.meama_georgia_orders (lower(btrim(promotion_name)))
  WHERE promotion_name IS NOT NULL AND promotion_name <> '';

-- Bulk-set promotion_name for a batch of orders in one round trip.
-- rows :: [{ "shopify_order_id": 7102939463872, "promotion_name": "mix8" }, ...]
CREATE OR REPLACE FUNCTION public.apply_order_promotion_names(rows jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated integer;
BEGIN
  WITH incoming AS (
    SELECT shopify_order_id, NULLIF(btrim(promotion_name), '') AS promotion_name
    FROM jsonb_to_recordset(rows)
      AS x(shopify_order_id bigint, promotion_name text)
  ),
  upd AS (
    UPDATE public.meama_georgia_orders o
    SET promotion_name = i.promotion_name
    FROM incoming i
    WHERE o.shopify_order_id = i.shopify_order_id
      AND o.promotion_name IS DISTINCT FROM i.promotion_name
    RETURNING 1
  )
  SELECT count(*) INTO updated FROM upd;
  RETURN updated;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_order_promotion_names(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_order_promotion_names(jsonb) TO service_role;

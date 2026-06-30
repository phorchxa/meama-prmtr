-- 0030 — sync log for the order promotion_name backfill (mirrors product_sync_log).
CREATE TABLE IF NOT EXISTS public.order_promotion_sync_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_type    text,                 -- 'scheduled' | 'manual'
  window_days  integer,
  rows_scanned integer,              -- orders inspected from Shopify
  rows_synced  integer,              -- orders whose promotion_name changed
  status       text,                 -- 'success' | 'partial' | 'error'
  error_msg    text,
  duration_ms  integer,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_promotion_sync_log_created
  ON public.order_promotion_sync_log (created_at DESC);

ALTER TABLE public.order_promotion_sync_log ENABLE ROW LEVEL SECURITY;
-- service_role bypasses RLS; no policies needed for the edge function writer.

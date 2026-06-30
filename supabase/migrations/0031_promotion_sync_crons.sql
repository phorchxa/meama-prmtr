-- 0031 — pg_cron schedule for promotion_name sync + attribution.
-- cron.schedule upserts by job name, so re-running is safe.

-- Hourly: pull custom.promotion_name from Shopify into meama_georgia_orders
-- (defaults to a rolling 21-day window inside the edge function).
SELECT cron.schedule(
  'sync-order-promotions-hourly',
  '7 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://oquuapdsleffspiwmlzs.supabase.co/functions/v1/sync-order-promotions',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-scheduled','1',
      -- project anon key (public); same pattern as the other sync crons
      'Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9xdXVhcGRzbGVmZnNwaXdtbHpzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2NTUwMDUsImV4cCI6MjA4ODIzMTAwNX0.oU2RDQZFEy8aFVw3jDh9B7x5oMfBrEaOdW4rwuiQHj0'
    ),
    body := '{"source":"scheduler"}'::jsonb
  );
  $$
);

-- Every 15 min: attribute orders that carry a promotion_name to campaigns.
SELECT cron.schedule(
  'attribute-promotion-name-orders',
  '*/15 * * * *',
  $$ SELECT campaigns.attribute_promotion_name_orders(30); $$
);

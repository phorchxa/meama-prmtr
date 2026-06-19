-- 0008_campaign_cron_jobs.sql
-- Three pg_cron jobs for the campaigns schema:
--   1. attribute-code-orders   — every 15 min, discount code attribution
--   2. attribute-tag-orders    — every 15 min, bundle tag attribution
--   3. sync-campaign-results   — every 6 hours, aggregate metrics into campaign_results
--
-- Also adds the unique constraint on campaign_orders so ON CONFLICT actually deduplicates.

-- ── 1. Deduplication constraint ───────────────────────────────────────────────
-- Without this, the 30-min overlap window produces duplicate rows for the same order.
-- A unique index is sufficient for ON CONFLICT (campaign_id, shopify_order_id).
CREATE UNIQUE INDEX IF NOT EXISTS campaign_orders_unique_order_campaign_idx
  ON campaigns.campaign_orders (campaign_id, shopify_order_id);


-- ── 2. attribute-code-orders — every 15 min ───────────────────────────────────
-- Attributes paid orders to campaigns via discount code (exact + prefix match).
-- Skips employee codes. Only looks back 30 min (with 15-min schedule = safe overlap).
SELECT cron.schedule(
  'attribute-code-orders',
  '*/15 * * * *',
  $$
  INSERT INTO campaigns.campaign_orders (
    campaign_id, shopify_order_id, customer_id,
    attributed_revenue, attribution_window, created_at
  )
  SELECT
    c.id,
    o.shopify_order_id,
    CASE
      WHEN EXISTS (
        SELECT 1 FROM public.customers_georgia cg
        WHERE cg.shopify_customer_id = o.customer_id
      ) THEN o.customer_id
      ELSE NULL
    END,
    o.total,
    0,
    o.created_at
  FROM public.meama_georgia_orders o
  JOIN campaigns.promotions p
    ON o.discount_code = p.shopify_code
    OR o.discount_code ILIKE (p.shopify_code || '-%')
  JOIN campaigns.campaigns c ON c.promotion_id = p.id
  WHERE o.financial_status = 'paid'
    AND o.cancelled_at IS NULL
    AND o.discount_code IS NOT NULL AND o.discount_code != ''
    AND o.discount_code NOT ILIKE '%employee%'
    AND o.discount_code NOT ILIKE '%tanam%'
    AND o.discount_code NOT ILIKE '%თანამშ%'
    AND o.discount_code NOT IN ('Employee','EmployeeCapsules','EmployeeCapsulesUS')
    AND o.created_at > NOW() - INTERVAL '30 minutes'
  ON CONFLICT (campaign_id, shopify_order_id) DO NOTHING;
  $$
);


-- ── 3. attribute-tag-orders — every 15 min ────────────────────────────────────
-- Attributes paid orders to campaigns via bundle tag when no discount code present.
-- Filters out operational tags (dates, order refs, internal systems).
SELECT cron.schedule(
  'attribute-tag-orders',
  '*/15 * * * *',
  $$
  INSERT INTO campaigns.campaign_orders (
    campaign_id, shopify_order_id, customer_id,
    attributed_revenue, attribution_window, created_at
  )
  SELECT
    c.id,
    o.shopify_order_id,
    CASE
      WHEN EXISTS (
        SELECT 1 FROM public.customers_georgia cg
        WHERE cg.shopify_customer_id = o.customer_id
      ) THEN o.customer_id
      ELSE NULL
    END,
    o.total,
    0,
    o.created_at
  FROM public.meama_georgia_orders o
  JOIN campaigns.promotions p
    ON o.tag ILIKE ('%' || p.tag_pattern || '%')
  JOIN campaigns.campaigns c ON c.promotion_id = p.id
  WHERE o.financial_status = 'paid'
    AND o.cancelled_at IS NULL
    AND (o.discount_code IS NULL OR o.discount_code = '')
    AND p.tag_pattern IS NOT NULL
    AND o.tag NOT ILIKE '%kioskId%'
    AND o.tag NOT ILIKE '%Dropper%'
    AND o.tag NOT ILIKE '%dispenser%'
    AND o.tag NOT ILIKE '%Terminal%'
    AND o.tag NOT ILIKE '%BOG%'
    AND o.tag NOT ILIKE '%TBC%'
    AND o.tag NOT ILIKE '%Packer%'
    AND o.tag NOT ILIKE '%Showroom%'
    AND o.tag NOT ILIKE '%test%'
    AND o.tag NOT ILIKE '%Bundle%'
    AND o.tag NOT ILIKE '%glovo%'
    AND o.tag NOT ILIKE '%wolt%'
    AND o.tag NOT ILIKE '%yandex%'
    AND o.created_at > NOW() - INTERVAL '30 minutes'
  ON CONFLICT (campaign_id, shopify_order_id) DO NOTHING;
  $$
);


-- ── 4. sync-campaign-results — every 6 hours ─────────────────────────────────
-- Aggregates campaign_orders into campaign_results (revenue, ROI, AOV, conversion rate).
-- Step A: core metrics from order data.
-- Step B: audience reach + conversion rate from campaign_audience.
-- Runs as a single transaction so both steps stay in sync.
SELECT cron.schedule(
  'sync-campaign-results',
  '0 */6 * * *',
  $$
  -- Step A: upsert core metrics
  INSERT INTO campaigns.campaign_results (
    campaign_id,
    converted,
    revenue_total,
    discount_given,
    avg_order_value,
    roi,
    measured_at,
    updated_at
  )
  SELECT
    co.campaign_id,
    COUNT(DISTINCT co.shopify_order_id),
    ROUND(SUM(co.attributed_revenue)::numeric, 2),
    ROUND(SUM(o.discount_amount)::numeric, 2),
    ROUND(AVG(co.attributed_revenue)::numeric, 2),
    ROUND(
      (SUM(co.attributed_revenue) - SUM(o.discount_amount))
      / NULLIF(SUM(o.discount_amount), 0),
      4
    ),
    NOW(),
    NOW()
  FROM campaigns.campaign_orders co
  JOIN public.meama_georgia_orders o ON o.shopify_order_id = co.shopify_order_id
  GROUP BY co.campaign_id
  ON CONFLICT (campaign_id) DO UPDATE SET
    converted       = EXCLUDED.converted,
    revenue_total   = EXCLUDED.revenue_total,
    discount_given  = EXCLUDED.discount_given,
    avg_order_value = EXCLUDED.avg_order_value,
    roi             = EXCLUDED.roi,
    measured_at     = EXCLUDED.measured_at,
    updated_at      = EXCLUDED.updated_at;

  -- Step B: audience reach + conversion rate
  UPDATE campaigns.campaign_results cr
  SET
    reached         = ca.audience_count,
    conversion_rate = ROUND(
      cr.converted::numeric / NULLIF(ca.audience_count, 0) * 100,
      2
    )
  FROM (
    SELECT campaign_id, COUNT(DISTINCT customer_id) AS audience_count
    FROM campaigns.campaign_audience
    GROUP BY campaign_id
  ) ca
  WHERE ca.campaign_id = cr.campaign_id;
  $$
);


-- ── Verify ────────────────────────────────────────────────────────────────────
SELECT jobid, jobname, schedule, active
FROM cron.job
WHERE jobname IN (
  'attribute-code-orders',
  'attribute-tag-orders',
  'sync-campaign-results'
);

# Attribution Logic & Cron Jobs

## Classification Flow

For any order in meama_georgia_orders, classification goes in this order:

```
1. financial_status = 'paid' AND cancelled_at IS NULL AND total > 0
2. Skip employee codes
3. Skip operational tags only (no promo signal at all)
4. Has discount_code? → Path 1 (code attribution)
   No discount_code but has promo tag? → Path 2 (tag attribution)
   Both? → Path 1 wins (code takes priority)
   Neither? → Not a promotion order
5. ON CONFLICT (id) DO NOTHING (idempotent)
6. Flag if discount > 25% of subtotal (historical ok, new campaigns blocked)
```

---

## Employee Code Filter

```sql
AND o.discount_code NOT ILIKE '%employee%'
AND o.discount_code NOT ILIKE '%tanam%'
AND o.discount_code NOT ILIKE '%თანამშ%'
AND o.discount_code NOT IN ('Employee', 'EmployeeCapsules', 'EmployeeCapsulesUS')
```

---

## Operational Tag Filter (for tag-based queries)

```sql
AND TRIM(tag_value) !~ '^\d{2}/\d{2}/\d{4}'     -- date stamps
AND TRIM(tag_value) !~ '^#[A-Z]+-\d+'             -- order refs like #ME-198910-GE
AND TRIM(tag_value) !~ '^\d+$'                    -- pure numbers
AND TRIM(tag_value) !~ '^\d{2}:\d{2}'             -- time stamps
AND TRIM(tag_value) !~ 'at \d{2}:\d{2}'           -- packed at 11:52
AND TRIM(tag_value) !~ '(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{1,2} \d{4}'
AND TRIM(tag_value) NOT ILIKE '%kioskId%'
AND TRIM(tag_value) NOT ILIKE '%dropper%'
AND TRIM(tag_value) NOT ILIKE '%bundle%'           -- the word "bundle" (not bundle promos)
AND TRIM(tag_value) NOT ILIKE '%terminal%'
AND TRIM(tag_value) NOT ILIKE '%dispenser%'
AND TRIM(tag_value) NOT ILIKE '%BOG%'
AND TRIM(tag_value) NOT ILIKE '%TBC%'
AND TRIM(tag_value) NOT ILIKE '%Liberty%'
AND TRIM(tag_value) NOT ILIKE '%Packed%'
AND TRIM(tag_value) NOT ILIKE '%betlive%'
AND TRIM(tag_value) NOT ILIKE '%brand shop%'
AND TRIM(tag_value) NOT ILIKE '%dental%'
AND TRIM(tag_value) NOT ILIKE '%dento%'
AND TRIM(tag_value) NOT ILIKE '%delivery%'
AND TRIM(tag_value) NOT ILIKE '%fulfilled%'
AND TRIM(tag_value) NOT ILIKE '%packer%'
AND TRIM(tag_value) NOT ILIKE '%showroom%'
AND TRIM(tag_value) NOT ILIKE '%gori%'
AND TRIM(tag_value) NOT ILIKE '%konsignacia%'
AND TRIM(tag_value) NOT ILIKE '%glovo%'
AND TRIM(tag_value) NOT ILIKE '%tbilisi%'
AND TRIM(tag_value) NOT ILIKE '%tegeta%'
AND TRIM(tag_value) NOT ILIKE '%test%'
AND TRIM(tag_value) NOT ILIKE '%ტესტ%'
AND TRIM(tag_value) NOT ILIKE '%wolt%'
AND TRIM(tag_value) NOT ILIKE '%yandex%'
AND TRIM(tag_value) NOT ILIKE '%თანამ%'
AND TRIM(tag_value) NOT ILIKE '%კიოსკი%'
AND TRIM(tag_value) NOT ILIKE '%ლოკომოტივი%'
AND TRIM(tag_value) NOT ILIKE '%ახალი დროფერი%'
```

---

## Cron Job 1 — Discount Code Attribution (every 15 min)

```sql
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
  o.total, 0, o.created_at
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
  AND o.created_at > NOW() - INTERVAL '30 minutes'
ON CONFLICT (id) DO NOTHING;
```

---

## Cron Job 2 — Bundle Tag Attribution (every 15 min)

```sql
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
  o.total, 0, o.created_at
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
  AND o.created_at > NOW() - INTERVAL '30 minutes'
ON CONFLICT (id) DO NOTHING;
```

---

## Cron Job 3 — Sync Campaign Results (every 6 hours)

Run as two queries to avoid Supabase timeout:

**Step A — core metrics:**
```sql
INSERT INTO campaigns.campaign_results (
  campaign_id, converted, revenue_total, discount_given,
  avg_order_value, roi, measured_at, updated_at
)
SELECT
  co.campaign_id,
  COUNT(DISTINCT co.shopify_order_id),
  SUM(co.attributed_revenue),
  SUM(o.discount_amount),
  ROUND(AVG(co.attributed_revenue), 2),
  ROUND(
    (SUM(co.attributed_revenue) - SUM(o.discount_amount))
    / NULLIF(SUM(o.discount_amount), 0) * 100, 2
  ),
  NOW(), NOW()
FROM campaigns.campaign_orders co
JOIN public.meama_georgia_orders o ON o.shopify_order_id = co.shopify_order_id
GROUP BY co.campaign_id
ON CONFLICT (campaign_id) DO UPDATE SET
  converted = EXCLUDED.converted, revenue_total = EXCLUDED.revenue_total,
  discount_given = EXCLUDED.discount_given, avg_order_value = EXCLUDED.avg_order_value,
  roi = EXCLUDED.roi, measured_at = EXCLUDED.measured_at, updated_at = EXCLUDED.updated_at;
```

**Step B — reached + conversion_rate:**
```sql
UPDATE campaigns.campaign_results cr
SET
  reached = ca.audience_count,
  conversion_rate = ROUND(cr.converted::numeric / NULLIF(ca.audience_count, 0) * 100, 2)
FROM (
  SELECT campaign_id, COUNT(DISTINCT customer_id) AS audience_count
  FROM campaigns.campaign_audience
  GROUP BY campaign_id
) ca
WHERE ca.campaign_id = cr.campaign_id;
```

---

## pg_cron Registration

```sql
SELECT cron.schedule('attribute-code-orders',  '*/15 * * * *', $$ ... job1 ... $$);
SELECT cron.schedule('attribute-tag-orders',   '*/15 * * * *', $$ ... job2 ... $$);
SELECT cron.schedule('sync-campaign-results',  '0 */6 * * *',  $$ ... job3a ... $$);

-- Verify
SELECT jobid, jobname, schedule, active FROM cron.job
WHERE jobname IN ('attribute-code-orders','attribute-tag-orders','sync-campaign-results');
```

---

## Adding a New Promotion Mid-Campaign

When a new promotion is added to Shopify:
1. Insert into `campaigns.promotions`
2. Insert into `campaigns.campaigns` (status = draft → pending_approval → active)
3. Cron jobs pick it up automatically on next run
4. No backfill needed — `created_at > NOW() - INTERVAL '30 minutes'` window handles it

---

## Deduplication

`campaign_orders` primary key is UUID (always unique) so `ON CONFLICT (id)` never fires.
The 30-minute overlap window means the same order can be processed twice — this is safe
because the second insert generates a new UUID and writes a duplicate row.

To prevent true duplicates, add a unique constraint:
```sql
ALTER TABLE campaigns.campaign_orders
  ADD CONSTRAINT campaign_orders_unique_order_campaign
  UNIQUE (campaign_id, shopify_order_id);
```
Then `ON CONFLICT DO NOTHING` actually works as intended.

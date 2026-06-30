# Attribution Logic & Cron Jobs

## How the `promotions` table gets filled

A `campaigns.promotions` row is the *catalogue entry* for an offer. Rows arrive
two ways:

1. **Manual / historical backfill** — migrations `0018`–`0037` seeded the
   catalogue (bundles, discount codes, gift tags, upsells) from the order
   history. This is the bulk of the table.
2. **Auto-discovery from `promotion_name`** (migration `0038`, NEW) — the
   `attribute-promotion-name-orders` cron calls
   `campaigns.upsert_promotions_from_promotion_name(30)` each tick. It scans
   paid orders whose `custom.promotion_name` metafield matches **no** existing
   promotion and creates a stub row so the offer catalogues itself. See "Cron
   Job 4" below.

> ⚠️ There is **no** auto-discovery for the `discount_code` or `tag` paths.
> Those crons only attribute to promotions that **already exist** in the table.
> A brand-new discount code that nobody catalogued (and that never lands in the
> `promotion_name` metafield) will go **unattributed** until someone inserts it.

Every promotion should also get a `campaigns.campaigns` row (the execution
record) or the attribution joins can't reach it. Auto-discovered promotions get
a `draft` / `origin='auto'` campaign automatically.

### Identifying auto-discovered rows
```sql
SELECT * FROM campaigns.promotions WHERE discovery_source = 'promotion_name';
-- type='bundle', no discount_value, status='draft' — these are STUBS awaiting
-- human review (correct the type/discount %, merge EN/KA duplicates).
```

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

## Cron Job 4 — Promotion-Name Discovery + Attribution (every 15 min)

Job name `attribute-promotion-name-orders`. Runs two steps in sequence so a
promo discovered this tick is attributed the same tick:

```sql
SELECT campaigns.upsert_promotions_from_promotion_name(30);  -- discover + catalogue
SELECT campaigns.attribute_promotion_name_orders(30);        -- attribute
```

**Source signal:** `custom.promotion_name`, a Shopify order metafield naming the
applied promotion (e.g. `mix8`, `6 Capsule Us`, `mix15-12E8MYYU40`). It is
pulled onto `meama_georgia_orders.promotion_name` hourly by the
`sync-order-promotions` edge function (rolling 21-day window). Order webhooks do
NOT carry metafields, so this Admin-API pull is the only source.

**Discovery (`upsert_promotions_from_promotion_name`, migration 0038):** for each
distinct `promotion_name` on paid, non-cancelled orders in the window that
matches no promotion (same 4-way priority as attribution below):
- **No spaces → discount code.** A trailing Shopify auto-suffix
  `-<MIXED ALNUM 6+>` is stripped and deduped, so `mix15-12E8MYYU40` →
  one promotion `shopify_code='mix15'`, **not one per order**. The suffix must
  contain both a letter and a digit, so pure-digit/date suffixes
  (`newcust-versbun-18062026`) are kept as part of the real code.
- **Has spaces → descriptive tag.** Stored as `tag_pattern = <value>`.
- Inserts as a stub: `type='bundle'`, no discount, `discovery_source='promotion_name'`,
  `status='draft'`; plus a `draft`/`origin='auto'` campaign. Idempotent via
  `UNIQUE(shopify_code)` + partial unique index `promotions_discovery_name_uidx`
  on `lower(name)`. Logs to `order_promotion_sync_log` (sync_type='promotion-discovery').

**Attribution (`attribute_promotion_name_orders`, migrations 0029 + 0039):**
emits two kinds of `campaign_orders` rows per order, idempotent via
`UNIQUE(campaign_id, shopify_order_id)`:

*Primary* — one promotion matched by `promotion_name`, priority order (DISTINCT ON):
```
1. exact shopify_code            o.n = lower(p.shopify_code)
2. auto-generated prefixed code  o.pn ILIKE p.shopify_code || '-%'
3. exact tag_pattern             o.n = lower(p.tag_pattern)
4. exact promotion name          o.n = lower(p.name)
```

*Cross-tag (stacked offers, migration 0039)* — the SAME order is also credited
(full revenue) to **every EXISTING promotion** whose `tag_pattern` appears in the
order's `tag` column: `o.tag ILIKE '%' || p.tag_pattern || '%'`. This captures a
second offer stacked on the order (e.g. a `3+1` gift beside a bundle). Rules:
- **Never creates** promotions — credits catalogued ones only.
- **Excludes umbrella / app-wrapper tag_patterns** that sit on most bundle orders
  or own a dedicated cron, else they'd swallow all bundle revenue / double-count:
  `easybundle - bundle order` (Easy Bundle), `kite: bxgy discount applied`
  (Kite BXGY), `cw:upsell` (→ checkout-cups cron), `capuchinator`
  (→ capuchinator cron). Extend the array in 0039 as new wrappers appear.
- Multi-attribution is **intentional**: one order can credit several campaigns,
  so `SUM(revenue)` across campaigns exceeds true order revenue. The
  `UNION` + `ON CONFLICT` collapse the case where the tag promo *is* the
  promotion_name promo (no self double-count).

---

## Coverage: does this catch every promotion an order used?

**No — and it's important to be precise about the gaps.** Attribution has three
independent paths (code, tag, promotion_name) plus two bespoke upsell jobs
(`attribute-capuchinator-upsell`, `attribute-checkout-cups-upsell`). An order is
attributed if **any** path matches a catalogued promotion. What it catches and
misses:

| Situation | Caught? |
|-----------|---------|
| Order's `promotion_name` names an unseen promo | ✅ now auto-catalogued + attributed (0038) |
| Order's `discount_code` matches a catalogued promo (exact or `code-%`) | ✅ code cron |
| Order's `tag` matches a catalogued `tag_pattern` | ✅ tag cron |
| Order uses a discount code that is **not** catalogued and is **not** in `promotion_name` | ❌ unattributed (no code-path auto-discovery) |
| Promo applied but Shopify set neither code, promo-tag, nor `promotion_name` | ❌ no signal to match on |
| Order older than the cron window / not `paid` / cancelled / employee code | ❌ excluded by design |
| Order used **multiple** promotions | ⚠️ promotion_name path attributes only the **single** highest-priority one; the code & tag crons can each add their own row, so multi-promo coverage is partial |

**Reality of the `promotion_name` signal (June 2026):** only ~911 of ~207K paid
orders carry a `promotion_name` (metafield is recent + sparsely populated, 21-day
sync window), vs ~36.7K carrying a `discount_code`. So promotion_name
auto-discovery is a **narrow, self-healing supplement** — it guarantees the
metafield path never leaves an uncatalogued promo behind. It does **not** make
the catalogue exhaustive on its own; the code & tag paths (against the manually
backfilled catalogue) still carry the bulk of attribution.

**To make code/tag coverage self-healing too** would require an analogous
discovery step that mines uncatalogued `discount_code` / promo-`tag` values —
not yet built (would need the operational-tag junk filter above to avoid
cataloguing kioskId/Dropper/etc. as "promotions").

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
SELECT cron.schedule('attribute-code-orders',           '*/15 * * * *', $$ ... job1 ... $$);
SELECT cron.schedule('attribute-tag-orders',            '*/15 * * * *', $$ ... job2 ... $$);
SELECT cron.schedule('attribute-promotion-name-orders', '*/15 * * * *', $$
  SELECT campaigns.upsert_promotions_from_promotion_name(30);
  SELECT campaigns.attribute_promotion_name_orders(30);
$$);                                                                   -- job4 (0038)
SELECT cron.schedule('sync-order-promotions-hourly',    '7 * * * *',    $$ ...http_post... $$);
SELECT cron.schedule('attribute-capuchinator-upsell',   '12 * * * *',   $$ SELECT campaigns.attribute_capuchinator_upsell(365); $$);
SELECT cron.schedule('attribute-checkout-cups-upsell',  '12 * * * *',   $$ SELECT campaigns.attribute_checkout_cups_upsell(365); $$);
SELECT cron.schedule('sync-campaign-results',           '0 */6 * * *',  $$ ... job3a ... $$);

-- Verify
SELECT jobid, jobname, schedule, active FROM cron.job ORDER BY jobname;
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

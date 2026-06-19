# Campaign Intelligence — Schema & Metric Logic

**Audience:** senior review of how the Campaigns module stores data and computes every metric shown on the dashboard.
**Database:** Supabase / Postgres, schema `campaigns` (project `Meama_Pulse`).
**Verified against live data:** 2026-06-18. Where the internal skill doc and the *deployed* SQL disagree, this document follows the **deployed** SQL.

> Scope reminder: this module covers **E-commerce + Brand Stores** retail only. Order money is **GEL (₾)**; Meta ad money is **USD ($)** and is never mixed into GEL metrics.

---

## 1. Tables (schema `campaigns`)

| Table | Rows (2026-06-18) | Purpose | Filled by |
|-------|------:|---------|-----------|
| `promotions` | 174 | The offer catalogue — what the deal is (type, discount, code, tag pattern) | manual backfill + `create_campaign` RPC |
| `campaigns` | 174 | Execution record — who/when/which channel; one per promotion (historical) | manual backfill + `create_campaign` RPC |
| `campaign_orders` | 48,126 | Attribution — which orders are credited to which campaign | cron, every 15 min |
| `campaign_audience` | 42,965 | Who was targeted / converted | email platform + backfill |
| `campaign_results` | 127 | Aggregated metrics per campaign (the numbers on screen) | cron, every 6 hours |
| `campaign_ai_log` | 0 | AI suggestion audit trail | LangGraph pipeline (not built yet) |
| `meta_insights` | 5,408 | Meta ad spend/impressions/clicks/ROAS (USD) | nightly Meta sync job |

**Note:** 174 campaigns but only **127** `campaign_results` rows → 47 campaigns have no attributed orders yet (no results row, so they show blanks).

### Key columns

`promotions`: `type` (`bundle`/`discount`/`gift`/`subscription`/`clearance`), `discount_type`, `discount_value`, `min_order_value` (fixed bundle price), `shopify_code` (exact code or prefix), `tag_pattern` (Shopify tag for bundle matching), `excluded_segments`, `valid_from`/`valid_to`.

`campaigns`: `promotion_id` (FK, nullable), `name`, `channel`, `status` (`draft`/`pending_approval`/`active`/`completed`/`rejected`), `origin` (`manual` historical / `ai` future), `target_segment`, `scheduled_at`/`launched_at`. AI fields (`predicted_revenue`, `audience_size`, `subject_line`, …) exist but are **all empty** for the historical data.

`campaign_orders`: `campaign_id`, `shopify_order_id`, `customer_id` (NULL if the buyer isn't in `customers_georgia`), `attributed_revenue`, `attribution_window`. Unique on **(`campaign_id`, `shopify_order_id`)** — one order can belong to multiple campaigns, but not twice to the same one.

`campaign_results`: `converted`, `reached`, `conversion_rate`, `revenue_total`, `discount_given`, `avg_order_value`, `roi`, `measured_at`.

---

## 2. Data flow

```
public.meama_georgia_orders ──┐
                              │  (cron, every 15 min — 2 attribution paths)
campaigns.promotions ─────────┼──▶ campaigns.campaign_orders   (one row per credited order)
campaigns.campaigns ──────────┘            │
                                           │  (cron, every 6 hours — aggregate)
campaigns.campaign_audience ───────────────┼──▶ campaigns.campaign_results  (the dashboard numbers)
                                           │
                              FastAPI GET /campaigns ──▶ React dashboard
```

---

## 3. Attribution — which orders count (cron, every 15 min)

An order is credited to a campaign by linking it to that campaign's promotion. **Two paths**, evaluated against orders created in the last 30 minutes (the historical 121K-order base was backfilled once):

**Path 1 — discount code** (`attribute-code-orders`):
```sql
JOIN campaigns.promotions p
  ON o.discount_code = p.shopify_code               -- exact match
  OR o.discount_code ILIKE (p.shopify_code || '-%') -- auto-generated codes (prefix)
```

**Path 2 — bundle tag** (`attribute-tag-orders`), only when the order has **no** discount code:
```sql
JOIN campaigns.promotions p
  ON o.tag ILIKE ('%' || p.tag_pattern || '%')
```

**Always filtered:** `financial_status = 'paid'`, `cancelled_at IS NULL`, employee codes excluded (`%employee%`, `%tanam%`, `%თანამშ%`, …), and operational tags excluded (`kioskId`, `Dropper`, `Terminal`, `BOG`, `TBC`, `Showroom`, `glovo`, `wolt`, `yandex`, the literal word `Bundle`, …). Code wins over tag when both are present. `ON CONFLICT (campaign_id, shopify_order_id) DO NOTHING` keeps it idempotent.

**What revenue is credited:** `attributed_revenue = o.total` — the **entire order total**, not just the promoted item. ⚠️ See caveats.

---

## 4. How each metric is counted (cron `sync-campaign-results`, every 6 hours)

Computed by aggregating `campaign_orders` joined to `meama_georgia_orders`. **Exact deployed formulas:**

| Metric | Formula (as deployed) | Meaning |
|--------|----------------------|---------|
| `converted` | `COUNT(DISTINCT co.shopify_order_id)` | distinct orders credited to the campaign |
| `revenue_total` | `ROUND(SUM(co.attributed_revenue), 2)` | sum of full order totals (GEL) |
| `discount_given` | `ROUND(SUM(o.discount_amount), 2)` | total discount on those orders (GEL) |
| `avg_order_value` | `ROUND(AVG(co.attributed_revenue), 2)` | mean order total |
| **`roi`** | `ROUND((SUM(revenue) − SUM(discount)) / NULLIF(SUM(discount),0), 4)` | **revenue ÷ discount ratio — NOT profit ROI** |
| `reached` | `COUNT(DISTINCT customer_id)` from `campaign_audience` | distinct customers recorded as targeted |
| `conversion_rate` | `ROUND(converted / NULLIF(reached,0) × 100, 2)` | percent; **can exceed 100%** |

### Worked example — "Simple Bundles 2.0 — Historical"
Live values: `revenue_total = 1,512,058.27`, `discount_given = 11,433.02`, `converted = 8,226`, `reached = 5,077`, `avg_order_value = 183.81`.

- **roi** = (1,512,058.27 − 11,433.02) / 11,433.02 = **131.25** → UI shows `131.3×`
- **conversion_rate** = 8,226 / 5,077 × 100 = **162.02%**

Both are arithmetically correct from real order data. The dashboard label was changed from "ROI" to **"Rev / disc"** to reflect what this number actually is.

---

## 5. ⚠️ Caveats to review (the important part)

1. **`roi` is a revenue-to-discount ratio, not a profit ROI.** It divides full attributed revenue by discount given, with **no COGS**. A bundle with a small nominal discount but large tagged revenue produces a huge ratio. Across 127 results: **median ≈ 1.8×, max ≈ 565×, only 5 campaigns exceed 50×.** The 131× outlier is real but not representative. *(The internal skill doc shows this formula with `× 100`; the deployed function omits it, so the stored value is a plain ratio.)*
2. **Whole-basket attribution.** `attributed_revenue = o.total` credits the **entire order** to the campaign, even non-promoted items. This inflates `revenue_total` and therefore `roi`. A true incremental measure would credit only promoted line items (and net of COGS).
3. **`conversion_rate` can exceed 100%.** `converted` counts distinct *orders*; `reached` counts distinct *customers* in `campaign_audience`. For historical/backfilled campaigns the audience is under-counted (the skill notes `sent_at`/`opened_at` are NULL for backfill), and one customer can place several orders — so conversions outnumber recorded reach. The UI now flags values over 100% with a "historical audience under-counted" note.
4. **Coverage gap.** 174 campaigns vs 127 results — 47 campaigns have no attributed orders.
5. **30-minute ongoing window.** The attribution crons only scan orders created in the last 30 minutes; the full history was a one-time backfill. A missed window = a permanently unattributed order unless re-backfilled.
6. **25% discount cap** (`MAX_DISCOUNT` in `business_rules.py`) is a forward rule for new campaigns. Historical codes above 25% (e.g. `Christmas56`, `MORE50`) are kept for reporting.

---

## 6. Dashboard KPIs (top of the Campaigns page)

Computed in the frontend over all campaigns returned by `GET /campaigns` — verified to match the DB exactly on 2026-06-18:

| KPI | Definition | Value |
|-----|------------|------:|
| Active campaigns | `count(status = 'active')` | 26 |
| Attributed revenue | `sum(revenue_total)` | ₾5,067,532 |
| Avg rev / disc | `avg(roi)` over results with roi | 11.8× |
| Pending approval | `count(status IN ('draft','pending_approval'))` | 0 |

---

## 7. Write path — creating a campaign

The `campaigns` schema is **not exposed to PostgREST** (reads go through the `public.execute_readonly_query` RPC). The "Add campaign" button writes through one `SECURITY DEFINER` function:

`public.create_campaign(payload jsonb)` → inserts a `status='draft'`, `origin='manual'` campaign (+ an optional promotion). Discount/gift promotions automatically get `excluded_segments = {capsule_loyalist, flavor_explorer}` per the no-discount VIP rule. Migration: `supabase/migrations/0014_create_campaign_fn.sql`.

---

## 8. Verification queries (run anytime to re-check)

```sql
-- Recompute a campaign's roi/conversion from raw orders and compare to stored
SELECT c.name, cr.revenue_total, cr.discount_given, cr.roi,
       ROUND((cr.revenue_total - cr.discount_given)/NULLIF(cr.discount_given,0), 4) AS roi_recomputed,
       cr.converted, cr.reached, cr.conversion_rate
FROM campaigns.campaigns c
JOIN campaigns.campaign_results cr ON cr.campaign_id = c.id
WHERE c.name = 'Simple Bundles 2.0 — Historical';

-- ROI distribution (shows the outliers)
SELECT MIN(roi), MAX(roi),
       percentile_cont(0.5) WITHIN GROUP (ORDER BY roi) AS median,
       COUNT(*) FILTER (WHERE roi > 50) AS over_50x
FROM campaigns.campaign_results WHERE roi IS NOT NULL;

-- Active attribution jobs
SELECT jobname, schedule, active FROM cron.job
WHERE jobname LIKE 'attribute-%' OR jobname = 'sync-campaign-results';
```

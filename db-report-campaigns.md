# MEAMA PRMTR — Campaign Tables DB Report

**Date:** 2026-06-18
**Project:** `Meama_Pulse` · `oquuapdsleffspiwmlzs` (Postgres 17, ap-southeast-2)
**Scope:** The campaign/promotion tables only. All five live in the **`campaigns`** schema, **not** `public`.

> Note: this is why `0001_core.sql` is irrelevant here — its flat `public.campaigns` table was never used. The real campaign system runs entirely inside the `campaigns` schema, sourced from the live Shopify tables in `public`.

---

## The 6 tables & who writes them

| Table | Purpose | Written by | Live rows |
|---|---|---|---|
| `campaigns.promotions` | The **offer catalog** — what the deal is (code, type, discount) | Manual insert / backfill | **174** |
| `campaigns.campaigns` | **Execution record** — who/when/which channel, 1 per promotion today | Backfill (`origin='manual'`); AI engine later | **174** |
| `campaigns.campaign_orders` | **Attribution** — which orders belong to which campaign | Cron, every 15 min | **48,126** |
| `campaigns.campaign_audience` | **Who was targeted/converted** | Email platform + backfill | **42,965** |
| `campaigns.campaign_results` | **Aggregated metrics** per campaign | Cron, every 6 h | **127** |
| `campaigns.campaign_ai_log` | AI audit trail (LangGraph steps) | AI pipeline (not built yet) | **0** |

Current composition:
- **promotions.type:** bundle 127 · discount 32 · gift 8 · subscription 7
- **promotions.discount_type:** fixed 68 · (null/bundle) 68 · percentage 31 · clearance 3 · bogo 3 · tiered 1
- **campaigns.origin:** manual 174 (0 AI — engine not live yet)
- **campaigns.status:** completed 148 · active 26
- **campaigns.channel:** ecommerce 168 · pos 3 · paid 2 · email 1

---

## Data flow — how a row gets filled

```
                     public.meama_georgia_orders  (214K orders, live Shopify)
                                   │
        ┌──────────────────────────┴───────────────────────────┐
        │  match order.discount_code            match order.tag │
        │  ── against ──                         ── against ──   │
        ▼                                                        ▼
campaigns.promotions.shopify_code            campaigns.promotions.tag_pattern
        │                                                        │
        └──────────────┬─────────────────────────────────────────┘
                       │  JOIN promotions → campaigns (c.promotion_id = p.id)
                       ▼
            campaigns.campaign_orders   ← cron every 15 min (attribution)
                       │
                       │  aggregate (SUM/COUNT/GROUP BY campaign_id)
                       ▼
            campaigns.campaign_results  ← cron every 6 h (metrics rollup)

campaigns.campaign_audience  ← who was sent the message (backfill + email platform)
```

---

## 1. `campaigns.promotions` — the offer catalog

The **source of truth for a deal**. Manually inserted (174 historical promotions backfilled from Shopify). Rarely updated after creation — only `valid_to` extensions or corrections.

Key columns and how they drive attribution:
- `shopify_code` (text, unique) — the exact Shopify discount code, **or a prefix** for auto-generated codes. Drives **Path 1** attribution.
- `tag_pattern` (text) — Shopify order-tag substring for `ILIKE` matching. Drives **Path 2** attribution. NULL for code-only promos.
- `type` — `bundle` / `discount` / `gift` / `subscription` / `clearance`.
- `discount_type` + `discount_value` — `fixed` / `percentage` / `bogo` / `tiered` / `clearance`; NULL for tag-only bundles.
- `excluded_segments` (text[]) — must contain `['capsule_loyalist','flavor_explorer']` on every discount promo (these segments never get discounts).
- `valid_from` / `valid_to` — NULL = always-on.

**Update cadence:** insert-once, manual. Not touched by cron.

---

## 2. `campaigns.campaigns` — the execution record

One campaign per promotion today (all `origin='manual'`, backfilled). Going forward the **AI suggestion engine** creates these with `origin='ai'`.

- Links to the offer via `promotion_id → promotions.id`.
- Lifecycle: `status` moves `draft → pending_approval → active → completed` (or `rejected`).
- AI/prediction columns (`predicted_revenue`, `predicted_roi`, `predicted_margin`, `fatigue_risk`, `predicted_uplift`) and copy columns (`subject_line`, `body_copy`, `cta_text`) are **all NULL for the manual backfill** — they fill only when the LangGraph pipeline runs.
- Timestamps (`scheduled_at`, `launched_at`, `completed_at`, `submitted_for_approval_at`, `reviewed_at`) track the approval/launch workflow.

**Update cadence:** written at creation; status/timestamps updated by the workflow (manager approval, launch, measure). Not touched by attribution cron.

---

## 3. `campaigns.campaign_orders` — attribution (the live engine)

This is the only campaign table that **grows continuously**. Two pg_cron jobs run **every 15 min** (`*/15 * * * *`, both `active=true`):

**Path 1 — `attribute-code-orders`** (code wins when both code and tag exist):
```sql
JOIN campaigns.promotions p
  ON o.discount_code = p.shopify_code                 -- exact match
  OR o.discount_code ILIKE (p.shopify_code || '-%')   -- prefix for auto-generated codes
WHERE o.discount_code IS NOT NULL AND o.discount_code != ''
```

**Path 2 — `attribute-tag-orders`** (only when no discount code):
```sql
JOIN campaigns.promotions p
  ON o.tag ILIKE ('%' || p.tag_pattern || '%')
WHERE (o.discount_code IS NULL OR o.discount_code = '')
  AND p.tag_pattern IS NOT NULL
```

Both always filter: `financial_status='paid'`, `cancelled_at IS NULL`, exclude employee codes (`%employee%`/`%tanam%`/`%თანამშ%`), and a **30-minute lookback window** (`created_at > NOW() - INTERVAL '30 minutes'`) so each run only processes recent orders.

Columns written:
- `attributed_revenue` = `order.total`
- `attribution_window` = 0 (direct match)
- `created_at` = the **order's** `created_at` (not insert time)
- `customer_id` = the Shopify customer id **only if** it exists in `public.customers_georgia`, else NULL (b2b/vending/franchise/collect customers → NULL).

> ⚠️ **Known dedup gap.** The PK is a random UUID, so `ON CONFLICT (id) DO NOTHING` never fires. With the 30-min window overlapping the 15-min schedule, the same order **can be inserted twice**. The fix (documented, not yet applied) is a unique constraint on `(campaign_id, shopify_order_id)`. Row count drifting (48,123 → 48,126) is consistent with the cron running.

---

## 4. `campaigns.campaign_audience` — who was targeted

42,965 rows. For **historical/backfilled** campaigns only `converted_at` is derivable from order data — `sent_at` / `opened_at` / `clicked_at` are NULL (no email-platform telemetry for the past). Going forward the email/SMS platform fills the engagement timestamps.

- `customer_id` (bigint) → `customers_georgia.shopify_customer_id`
- `unsubscribed` (bool)

**Update cadence:** backfill insert; live updates from the messaging platform per send/open/click/convert event.

---

## 5. `campaigns.campaign_results` — metrics rollup

127 rows (one per campaign that has attributed orders). Refreshed by **`sync-campaign-results`** cron, **every 6 h** (`0 */6 * * *`, `active=true`), run as two steps to dodge timeouts:

**Step A** — `INSERT … ON CONFLICT (campaign_id) DO UPDATE`, recomputed from `campaign_orders` joined to orders:
- `converted` = `COUNT(DISTINCT shopify_order_id)`
- `revenue_total` = `SUM(attributed_revenue)`
- `discount_given` = `SUM(order.discount_amount)`
- `avg_order_value` = `AVG(attributed_revenue)`
- `roi` = `(revenue − discount) / discount × 100`
- `measured_at` / `updated_at` = `NOW()`

**Step B** — `UPDATE` to set `reached` (distinct audience count from `campaign_audience`) and `conversion_rate` = `converted / reached × 100`.

**Not yet calculated** (NULL placeholders awaiting COGS / extra logic): `gross_margin`, `revenue_capsules`, `lapsed_reactivated`, `new_customers`, and (for historical) `opened` / `clicked`. ML-feedback columns `revenue_variance` / `roi_variance` / `ml_feedback_sent` fill only once the AI loop runs.

---

## 6. `campaigns.campaign_ai_log` — AI audit trail

Empty (0 rows). One row per LangGraph node (`segment_node`, `offer_node`, `predict_node`, …) capturing `input_features`/`output` jsonb + `model_version`. Populates only when the **AI suggestion pipeline is built** — currently a placeholder.

---

## Live cron summary (all `active=true`)

| Job | Schedule | Writes |
|---|---|---|
| `attribute-code-orders` | `*/15 * * * *` | campaign_orders (Path 1) |
| `attribute-tag-orders` | `*/15 * * * *` | campaign_orders (Path 2) |
| `sync-campaign-results` | `0 */6 * * *` | campaign_results |
| `resync-georgia-customers` | `*/5 * * * *` | (feeds `customers_georgia`) |
| `refresh-mv-customer-intelligence` | `5 * * * *` | (customer MV) |
| `refresh-mv-customer-segments` | `10 * * * *` | (segment MV) |
| `refresh-mv-order-product-base` | `0 * * * *` | (order/product MV) |

---

## Open items / risks

1. **No unique constraint on `campaign_orders`** → duplicate attribution rows possible (see §3). Recommend `UNIQUE (campaign_id, shopify_order_id)` + `ON CONFLICT DO NOTHING`.
2. **All campaigns are `origin='manual'`** — the AI engine and `campaign_ai_log` are still placeholders.
3. **`campaign_results` is partly hollow** — `gross_margin`, `revenue_capsules`, `lapsed_reactivated`, `new_customers` need COGS + extra logic before reports can trust them.
4. **RLS is disabled** on the `public` source tables (customer PII). Campaign attribution reads them server-side, but the exposure is real — flagged separately.

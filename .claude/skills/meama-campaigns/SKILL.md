---
name: meama-campaigns
description: >
  Complete reference for Meama's campaigns schema — promotions, campaigns,
  campaign_orders, campaign_audience, campaign_results, and campaign_ai_log.
  Use this skill whenever working on anything related to Meama's Campaign
  Intelligence module: writing SQL queries, building attribution logic,
  creating new promotions, debugging cron jobs, inserting campaign data,
  understanding table relationships, or building the AI suggestion pipeline.
  Trigger on: promotions table, campaigns table, campaign_orders, attribution,
  discount codes, bundle tags, tag_pattern, shopify_code, campaign results,
  ROI, cron jobs, backfill, campaign intelligence, or any reference to
  Meama's marketing or promotion data.
---

# Meama Campaign Intelligence — Schema & Attribution Guide

## Stack
- **Database**: Supabase (PostgreSQL), schema `campaigns`
- **Orders source**: `public.meama_georgia_orders`
- **Customers source**: `public.customers_georgia` (+ b2b, vending, franchise, collect)
- **Backend**: FastAPI + LangGraph
- **Orchestration**: LangGraph agents
- **Campaign AI**: Claude API (claude-sonnet-4-6)

---

## Table Overview

| Table | Purpose | Filled by |
|-------|---------|-----------|
| `promotions` | The offer catalog — what the deal is | Manual insert + this skill |
| `campaigns` | Execution record — who, when, which channel | AI suggestion engine + manual |
| `campaign_orders` | Attribution — which orders came from which campaign | Cron job every 15 min |
| `campaign_audience` | Who was targeted/converted | Email platform + backfill |
| `campaign_results` | Aggregated metrics per campaign | Cron job every 6 hours |
| `campaign_ai_log` | AI audit trail — every suggestion step | LangGraph nodes |

See `references/schema.md` for full column definitions.
See `references/attribution.md` for attribution logic and cron jobs.
See `references/promotions-catalog.md` for all 174 promotions and their types.

---

## Critical Business Rules

1. **Capsule loyalists and flavor explorers must never receive discount offers.**
   These segments must be in `excluded_segments = ARRAY['capsule_loyalist','flavor_explorer']`
   on every discount-type promotion row.

2. **Maximum safe discount = 25%.**
   Historical data has codes above 25% (Christmas56, MORE50 etc.) — kept for reporting.
   New campaigns created by the AI must not exceed 25%.

3. **Employee codes are never promotions.**
   Filter: `discount_code NOT ILIKE '%employee%' AND NOT ILIKE '%tanam%' AND NOT ILIKE '%თანამშ%'`

4. **Operational tags are never promotions.**
   Filter out: `kioskId`, `Dropper`, `dispenser`, `Terminal`, `BOG`, `TBC`, `Showroom`,
   `Packer`, `payment_failed`, `Pickup`, `Delivered`, `Cancelled`, `Bundle` (the word),
   `pre-order-item`, `App Order`, `Call Center`, dates (`\d{2}/\d{2}/\d{4}`),
   references (`#[A-Z]+-\d+`), pure numbers (`^\d+$`), timestamps (`at \d{2}:\d{2}`).

5. **Code wins over tag when both present.**
   If an order has both a `discount_code` and a bundle `tag`, attribute via the code.

6. **Auto-generated codes use prefix matching.**
   Codes like `candlecoffee67-GHWSPTLT95` match promotion `shopify_code = candlecoffee67`
   via: `o.discount_code ILIKE (p.shopify_code || '-%')`

---

## Attribution Logic — Two Paths

### Path 1: Discount Code
```sql
JOIN campaigns.promotions p
  ON o.discount_code = p.shopify_code              -- exact match
  OR o.discount_code ILIKE (p.shopify_code || '-%') -- prefix for auto-generated
WHERE o.discount_code IS NOT NULL AND o.discount_code != ''
```

### Path 2: Bundle Tag (no discount code)
```sql
JOIN campaigns.promotions p
  ON o.tag ILIKE ('%' || p.tag_pattern || '%')
WHERE (o.discount_code IS NULL OR o.discount_code = '')
  AND p.tag_pattern IS NOT NULL
```

Always filter:
```sql
WHERE o.financial_status = 'paid'
  AND o.cancelled_at IS NULL
  AND o.discount_code NOT ILIKE '%employee%'
  AND o.discount_code NOT ILIKE '%tanam%'
  AND o.discount_code NOT ILIKE '%თანამშ%'
```

---

## Promotion Types

| Type | Description | Attribution |
|------|-------------|-------------|
| `bundle` | Fixed price bundle, BOGO, POS mix | Code or tag |
| `discount` | % or fixed amount off | Code only |
| `gift` | Free item added to order | Code or tag |
| `subscription` | Plan tag — no discount value | Tag only |
| `clearance` | Outlet / overstock discount | Tag only |

---

## Cron Jobs (pg_cron)

```sql
-- Every 15 min: attribute discount code orders
cron.schedule('attribute-code-orders', '*/15 * * * *', $$ ... $$)

-- Every 15 min: attribute bundle tag orders
cron.schedule('attribute-tag-orders', '*/15 * * * *', $$ ... $$)

-- Every 6 hours: sync campaign_results
cron.schedule('sync-campaign-results', '0 */6 * * *', $$ ... $$)
```

Full cron SQL is in `references/attribution.md`.

---

## Customer FK Handling

`campaign_orders.customer_id` FK only enforces against `customers_georgia`.
Customers from other channels (b2b, vending, franchise, collect) get `customer_id = NULL`:

```sql
CASE
  WHEN EXISTS (
    SELECT 1 FROM public.customers_georgia cg
    WHERE cg.shopify_customer_id = o.customer_id
  ) THEN o.customer_id
  ELSE NULL
END AS customer_id
```

---

## Current Data State (as of June 2026 backfill)

| Table | Rows |
|-------|------|
| promotions | 174 |
| campaigns | 174 (1 per promotion, historical) |
| campaign_orders | 48,123 (24,752 code + 23,371 tag) |
| campaign_audience | 42,965 |
| campaign_results | 127 |

Going forward: AI suggestion engine creates campaigns with full targeting data.
Historical rows have `origin = 'manual'`, AI rows will have `origin = 'ai'`.

---

## Adding a New Promotion

```sql
INSERT INTO campaigns.promotions (
  name, type, discount_type, discount_value,
  shopify_code, tag_pattern, excluded_segments,
  valid_from, valid_to
)
VALUES (
  'My New Promo', 'discount', 'percentage', 20,
  'NEWCODE', NULL,
  ARRAY['capsule_loyalist','flavor_explorer'],
  NOW(), NOW() + INTERVAL '30 days'
);

-- Then create a campaign row for it
INSERT INTO campaigns.campaigns (promotion_id, name, channel, status, origin)
SELECT id, name || ' — Campaign', 'email', 'draft', 'ai'
FROM campaigns.promotions WHERE shopify_code = 'NEWCODE';
```

---

## AI Suggestion Pipeline (LangGraph — to be built)

Each node writes to `campaign_ai_log`:
1. **Segment node** — picks target segment + lifecycle stage
2. **Offer node** — selects promotion from `promotions` table
3. **Predict node** — estimates revenue, ROI, margin, fatigue risk
4. **Copy node** — generates subject line, body copy, CTA
5. **Approval node** — submits to manager queue (`status = 'pending_approval'`)
6. **Launch node** — fires to email/SMS platform, sets `launched_at`
7. **Measure node** — reads `campaign_results` after attribution window
8. **Learn node** — computes `revenue_variance`, `roi_variance`, sets `ml_feedback_sent = true`

---

## Quick Reference Queries

```sql
-- Top campaigns by revenue
SELECT c.name, cr.revenue_total, cr.roi, cr.converted
FROM campaigns.campaign_results cr
JOIN campaigns.campaigns c ON c.id = cr.campaign_id
ORDER BY cr.revenue_total DESC LIMIT 10;

-- Campaigns with no attribution yet
SELECT c.name, p.type, p.shopify_code, p.tag_pattern
FROM campaigns.campaigns c
JOIN campaigns.promotions p ON p.id = c.promotion_id
LEFT JOIN campaigns.campaign_results cr ON cr.campaign_id = c.id
WHERE cr.campaign_id IS NULL;

-- Check attribution coverage
SELECT
  COUNT(*) FILTER (WHERE discount_code IS NOT NULL AND discount_code != '') AS code_orders,
  COUNT(*) FILTER (WHERE tag IS NOT NULL AND tag != '')                     AS tag_orders,
  COUNT(*) AS total_paid_orders
FROM public.meama_georgia_orders
WHERE financial_status = 'paid' AND cancelled_at IS NULL;
```

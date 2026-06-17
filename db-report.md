# MEAMA PRMTR — Supabase DB Inspection Report

**Date:** 2026-06-15  
**Project URL:** `https://oquuapdsleffspiwmlzs.supabase.co`  
**Scope:** Read-only SELECT queries. No PII in this document (masked per task rules).

---

## Context note

The MEAMA PRMTR `0001_core.sql` migration has **not yet been run** on this Supabase project.  
The project currently contains the **Meama Commerce Dashboard** schema — a Shopify-sourced production dataset. All meama-prmtr "target" table names (`customers`, `orders`, `order_items`, `products`) do not yet exist.  
This report describes what **is actually in the DB** (the live Shopify data), which is the correct source for ETL into the new schema.

---

## Step 1 — Schema

### SQL used

```sql
-- 1. Columns
SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
ORDER BY table_name, ordinal_position
LIMIT 500;

-- 2. FK constraints
SELECT tc.table_name, kcu.column_name,
       ccu.table_name AS foreign_table, ccu.column_name AS foreign_column
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public';

-- 3. Row counts
SELECT relname AS table_name, n_live_tup AS approx_rows
FROM pg_stat_user_tables ORDER BY n_live_tup DESC;
```

### Public schema tables (non-empty, non-system)

| Table | Description |
|---|---|
| `customers_georgia` | Retail e-commerce + POS customers from Shopify Georgia store |
| `meama_georgia_orders` | All orders (all channels) from Shopify Georgia store |
| `meama_georgia_order_items` | Line items for above orders |
| `products_georgia` | Shopify product + variant catalogue |
| `products_master` | Internal SKU master (price tiers, collection) |
| `Meama Products Bible` | Product attribute master (intensity, flavor, ingredients, etc.) |
| `SKU Matching` | SKU ↔ unified code ↔ collection mapping |
| `customers_b2b` | B2B channel customers |
| `customers_collect` | Collect channel customers |
| `customers_franchise` | Franchise channel customers |
| `customers_vending` | Vending channel customers |
| `unified_customers` | Cross-channel identity resolution (email + phone dedup) |
| `georgia_abandoned_carts` | Abandoned checkout events |
| `georgia_abandoned_cart_items` | Line items in abandoned carts |
| `campaigns` | CRM campaign records |
| `campaign_audience` | Target customers per campaign |
| `campaign_orders` | Orders attributed to campaigns |
| `campaign_results` | Campaign outcome summary |
| `promotions` | Promotion definitions |
| `backfill_state` / `customer_backfill_jobs` / `customers_backfill_state` | ETL state tracking |
| `meama_georgia_orders_raw_debug` | Raw Shopify webhook payloads (debug) |

### FK relationships

```
meama_georgia_order_items.shopify_order_id
    → meama_georgia_orders.shopify_order_id
```

No other public FK constraints declared. Joins between `meama_georgia_orders.customer_id` and `customers_georgia.shopify_customer_id` are **logical only** (no enforced FK).

---

## Step 2 — Core table identification

| Role | Table | PK |
|---|---|---|
| Customers | `customers_georgia` | `shopify_customer_id` (bigint) |
| Orders | `meama_georgia_orders` | `shopify_order_id` (bigint) |
| Order line items | `meama_georgia_order_items` | `shopify_line_id` (bigint) |
| Product catalogue | `products_georgia` | (`shopify_product_id`, `shopify_variant_id`) |
| Product attributes | `Meama Products Bible` | `id` (bigint) |
| SKU master | `products_master` | `sku` (text) |
| Machine/device ownership | `customers_georgia.machine_registered` (bool) — see Step 3 | — |
| Refunds | `meama_georgia_orders.refunded_amount` + `meama_georgia_order_items.refunded_quantity` / `.refunded_amount` | — |
| Abandoned carts | `georgia_abandoned_carts` | `token` (text) |
| Subscriptions | ❌ not present | — |
| Web sessions/events | ❌ not present | — |

---

## Step 3 — Field availability checklist (Customer "Portfolios" CRM view)

### Customer identity

| Field | Status | Column |
|---|---|---|
| Customer ID | ✅ | `customers_georgia.shopify_customer_id` (bigint) |
| Full name | ✅ | `customers_georgia.first_name` + `last_name` (separate text cols) |
| Email | ✅ | `customers_georgia.email` |
| Phone | ✅ | `customers_georgia.phone` + `default_address_phone` (two separate cols) |
| Registration date | ⚠️ | No `registration_date`; only `created_at` (Shopify account creation timestamp) |
| City / location | ⚠️ | `customers_georgia.default_address_city` (free-text, inconsistent casing: "Tbilisi" / "tbilisi" / ""; no region enum) |

### Marketing consent

| Field | Status | Column |
|---|---|---|
| Email opt-in | ✅ | `customers_georgia.accept_marketing_email` (bool, nullable) |
| SMS opt-in | ✅ | `customers_georgia.sms_marketing` (bool, nullable) |

Note: Both columns have NULLs (~1/3 of rows appear to have null `sms_marketing` — not consistently filled during import.

### Orders

| Field | Status | Column |
|---|---|---|
| Order ID | ✅ | `meama_georgia_orders.shopify_order_id` (bigint) |
| Customer link | ✅ | `meama_georgia_orders.customer_id` (bigint) → logical FK to `customers_georgia.shopify_customer_id`; guest orders have NULL |
| Placed/processed date | ✅ | `processed_at`, `created_at`, `paid_at`, `fulfilled_at` (all timestamptz) |
| Total amount | ✅ | `total` (numeric), `subtotal` (numeric) |
| Currency | ✅ | `currency` (text; GEL in practice) |
| Financial status | ✅ | `financial_status` (paid / partially_paid / refunded / voided / pending / partially_refunded) |
| Fulfillment status | ✅ | `fulfillment_status` (fulfilled / unfulfilled / partial / restocked) |
| Cancelled flag | ✅ | `cancelled_at` (timestamptz, NULL = not cancelled) |

### Discounts / promo

| Field | Status | Column |
|---|---|---|
| Discount amount per order | ✅ | `meama_georgia_orders.discount_amount` (numeric) |
| Discount code used | ✅ | `meama_georgia_orders.discount_code` (text) |
| Full-price vs discounted distinction | ✅ | Derive: `discount_amount > 0` OR `discount_code IS NOT NULL` |

### Channel / source

| Field | Status | Column |
|---|---|---|
| Online vs in-store | ⚠️ | `meama_georgia_orders.source` (web / pos / shopify_draft_order / Shopify-app-numeric-ID); `location` stores a Shopify **location ID** (bigint string), not a human-readable branch name. No mapping table found in DB. |

### Line items

| Field | Status | Column |
|---|---|---|
| Order link | ✅ | `meama_georgia_order_items.shopify_order_id` |
| Product / variant | ⚠️ | `sku` (text — **empty string for ~15 % of rows**), `title` (product name, always present) |
| SKU | ⚠️ | `sku` (text) — present but empty string on some items; no enforced NOT NULL |
| Quantity | ✅ | `quantity` (integer) |
| Unit price | ✅ | `price` (numeric) |
| Per-line discount | ✅ | `line_item_discount` (numeric) |

No FK from `meama_georgia_order_items.sku` to `products_georgia.variant_sku` — join is text-match only.

### Products

| Field | Status | Column |
|---|---|---|
| Name | ✅ | `products_georgia.title` (text) |
| Category | ⚠️ | No structured category enum; `product_type` (free-text) is the closest, with ~30 distinct values (see Step 4). `Meama Products Bible` has additional attributes. |
| Flavor / attributes | ✅ | `products_georgia.flavor_profile` (text ARRAY), `capsule_format` (text), tags (text ARRAY in Georgian + Latin) |
| Product type (capsule/machine/etc.) | ✅ | `products_georgia.product_type` — but contains "(POS)" variants (e.g. "Machine" vs "Machine (POS)") that need normalization |

### Machine ownership

| Field | Status | Column |
|---|---|---|
| Machine registered flag | ✅ | `customers_georgia.machine_registered` (bool) — explicit field! |
| Machine model | ❌ | No model detail on customer; `products_georgia.preferred_machine` (ARRAY) is on the product side only |

### Other entities

| Entity | Status | Notes |
|---|---|---|
| Refunds / returns | ✅ | `meama_georgia_orders.refunded_amount`; `meama_georgia_order_items.refunded_quantity` + `refunded_amount` |
| Subscriptions | ❌ | No subscriptions table |
| Web sessions / events | ❌ | No sessions or analytics events table |
| Abandoned carts | ✅ | `georgia_abandoned_carts` (1,101 rows) + `georgia_abandoned_cart_items` |

---

## Step 4 — Distinct values

### SQL used

```sql
SELECT financial_status, COUNT(*) FROM meama_georgia_orders GROUP BY 1 ORDER BY 2 DESC;
SELECT fulfillment_status, COUNT(*) FROM meama_georgia_orders GROUP BY 1 ORDER BY 2 DESC;
SELECT source, COUNT(*) FROM meama_georgia_orders GROUP BY 1 ORDER BY 2 DESC LIMIT 10;
SELECT location, COUNT(*) FROM meama_georgia_orders GROUP BY 1 ORDER BY 2 DESC LIMIT 10;
SELECT product_type, COUNT(*) FROM products_georgia GROUP BY 1 ORDER BY 2 DESC LIMIT 30;
SELECT discount_code, COUNT(*), SUM(discount_amount) FROM meama_georgia_orders
  WHERE discount_code IS NOT NULL AND discount_code <> ''
  GROUP BY 1 ORDER BY 2 DESC LIMIT 20;
SELECT payment_method, COUNT(*) FROM meama_georgia_orders GROUP BY 1 ORDER BY 2 DESC LIMIT 15;
SELECT MIN(processed_at), MAX(processed_at), COUNT(*) FROM meama_georgia_orders;
SELECT MIN(created_at), MAX(created_at), COUNT(*) FROM customers_georgia;
```

### `meama_georgia_orders.financial_status`

| Value | Count |
|---|---|
| paid | 205,134 |
| partially_paid | 3,379 |
| refunded | 2,944 |
| voided | 2,038 |
| pending | 429 |
| partially_refunded | 102 |
| (null) | 26 |

### `meama_georgia_orders.fulfillment_status`

| Value | Count |
|---|---|
| fulfilled | 210,625 |
| unfulfilled | 3,302 |
| partial | 85 |
| restocked | 41 |

### `meama_georgia_orders.source` (channel proxy)

| Value | Count | Interpretation |
|---|---|---|
| web | 102,850 | Online store (ecom) |
| pos | 72,786 | Brand store / POS |
| 195189899265 | 35,824 | Shopify app (Meama mobile app?) |
| shopify_draft_order | 2,588 | Manual / draft orders |
| online_store / Online Store | 3 | Legacy values |

### `meama_georgia_orders.location` (store ID)

| Shopify Location ID | Count | Human label (unknown — needs mapping) |
|---|---|---|
| (null) | 141,124 | Online / web orders |
| 71883522240 | 44,854 | Brand store A |
| 73621995712 | 15,089 | Brand store B |
| 73711780032 | 11,940 | Brand store C |
| 71256834240 | 1,038 | Brand store D |
| 75188207808 | 7 | Brand store E |

### `products_georgia.product_type` (top 30)

| Value | Count |
|---|---|
| (empty string) | 211 |
| Multi Capsule Coffee | 53 |
| European Coffee Capsule | 42 |
| Multi Capsule Tea | 38 |
| Machine | 33 |
| Metal Cup | 24 |
| Metal Cup (POS) | 24 |
| Multi Capsule Coffee (POS) | 17 |
| Variety Box | 16 |
| European Coffee Capsule (POS) | 14 |
| Multi Capsule KidsLine | 14 |
| Multi Capsule Wellness (POS) | 13 |
| Multi Capsule Tea (POS) | 13 |
| Machine (POS) | 13 |
| GIST_GIFT_CARD | 12 |
| Multi Capsule Wellness | 12 |
| Collect Gift Capsule | 9 |
| offer | 9 |
| Ceramic Mug (POS) | 8 |
| Glass Cup | 8 |
| Glass Cup (POS) | 7 |
| Bean Coffee | 6 |
| Ground Coffee Bags | 5 |
| Ground Coffee Bags (POS) | 5 |
| Ceramic Mug | 5 |
| Acrylic Holder | 4 |
| Ground Coffee Sachets (POS) | 4 |
| Ground Coffee Sachets | 4 |
| Acrylic Holder (POS) | 3 |
| Small Metal Cup | 3 |

### Top discount codes (orders)

| Code | Orders | Total discount (GEL) |
|---|---|---|
| oneplusonepos | 8,842 | 404,809 |
| ONEPLUSONE | 1,831 | 141,019 |
| mixPOS5 | 2,607 | 13,035 |
| Gift Cup | 1,650 | 24,795 |
| mixPOS15 | 1,342 | 20,429 |
| mixPOS50 | 657 | 32,850 |
| თანამშრომელი | 460 | 45,568 |
| FreeCup280 | 420 | 16,796 |
| MORE50 | 254 | 12,758 |

### Date ranges

| Entity | Min | Max | Total rows |
|---|---|---|---|
| customers_georgia.created_at | 2024-06-12 | 2026-06-15 | 96,002 |
| meama_georgia_orders.processed_at | 2024-06-27 | 2026-06-14 | 214,052 |

### Payment methods (orders)

| Method | Count |
|---|---|
| Flitt payment gateway | 65,305 |
| Bog | 33,543 |
| (empty string) | 31,914 |
| Tbc | 27,331 |
| cyber_source | 21,260 |
| (null) | 19,247 |
| cash | 8,095 |
| manual | 6,000 |
| Liberty | 1,308 |

---

## Step 5 — Sample rows (PII masked)

### `customers_georgia` (3 rows, ordered by created_at)

| shopify_customer_id | initials | email | phone | city | created_at | email_optin | sms_optin | machine_reg | orders_count | total_spent |
|---|---|---|---|---|---|---|---|---|---|---|
| 7223496212672 | N.A. | a\*\*\*@gmail.com | \*\*\*4144 | (null) | 2024-06-12 | false | true | true | 30 | 710.77 |
| 7515993833664 | L.S. | l\*\*\*@meama.ge | \*\*\*0006 | Tbilisi | 2024-10-03 | false | true | true | 72 | 514.71 |
| 8938319380672 | L.G. | d\*\*\*@gmail.com | (null) | (empty) | 2024-10-07 | (null) | (null) | (null) | 164 | 2,163.90 |

### `meama_georgia_orders` (3 rows, ordered by processed_at)

| shopify_order_id | customer_id | email | financial_status | fulfillment_status | source | location | total | discount_code | discount_amt | refunded_amt | payment_method | processed_at | cancelled_at |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 5577935323328 | 7223496212672 | a\*\*\*@gmail.com | voided | unfulfilled | web | (null) | 28.19 | (null) | 0 | (null) | საბანკო გადმ… | 2024-06-27 | 2024-09-04 |
| 5741135233216 | 7570443600064 | 0\*\*\*@otp.customer.meama.ge | refunded | unfulfilled | web | (null) | 5.54 | MEAMA90 | 4.86 | 5.54 | cyber_source | 2024-10-23 | 2024-10-30 |
| 5741170557120 | 8938319380672 | d\*\*\*@gmail.com | refunded | unfulfilled | web | (null) | 5.54 | MEAMA90 | 4.86 | 5.54 | cyber_source | 2024-10-23 | 2024-10-30 |

Note: `tag` column contains values like `"QSHPR: Delivered"`, `"QSHPR: Cancelled"` (QSHPR = Shopify flow status tag).

### `meama_georgia_order_items` (3 rows)

| shopify_line_id | shopify_order_id | sku | title | qty | price | line_discount | refunded_qty | refunded_amt |
|---|---|---|---|---|---|---|---|---|
| 13896677851328 | 5743250473152 | (empty) | ბულდოგი | 1 | 0 | 30 | 1 | 0 |
| 13896793587904 | 5743318204608 | (empty) | ტყის თხილი | 1 | 0 | 27 | 1 | 0 |
| 13896798077120 | 5743320924352 | (empty) | ტყის თხილი | 1 | 0 | 27 | 1 | 0 |

Note: price=0 + refunded_qty=1 pattern = items that were comped or given as free gifts.

### `products_georgia` (3 rows)

| variant_sku | title | product_type | price | capsule_format | package_type | flavor_profile | preferred_machine | status |
|---|---|---|---|---|---|---|---|---|
| cap51-1225 | ბულდოგი | Multi Capsule Coffee | 18.00 | მულტი კაფსულა | Multi Capsule Package | [არომატის გარეშე] | [Multi Machine] | ACTIVE |
| cap51-1222 | მულტივიტამინი | Multi Capsule Coffee | 18.00 | მულტი კაფსულა | Multi Capsule Package | [არომატის გარეშე] | [Multi Machine] | ACTIVE |
| cap51-1221 | ყავა კოლაგენით | Multi Capsule Coffee | 18.00 | მულტი კაფსულა | Multi Capsule Package | [არომატის გარეშე] | [Multi Machine] | ACTIVE |

---

## Step 6 — Notes & complications

### Critical gaps for MEAMA PRMTR

1. **No `region` enum.** `customers_georgia.default_address_city` is free-text with inconsistent casing ("Tbilisi" / "tbilisi" / "" / null). The meama-prmtr `region_t` enum (tbilisi / regions) must be derived via ILIKE normalization during ETL.

2. **Channel tagging is complex.** `meama_georgia_orders.source` distinguishes web vs POS but:
   - The Shopify app orders (`source = "195189899265"`) are ambiguous — ecom or brand-store?
   - `location` stores a **Shopify location ID** (bigint string), not a branch name. You need a hardcoded or fetched mapping (`{71883522240: "brand_store_X", ...}`) to apply the `channel_t` enum correctly.
   - **⚠️ Without this mapping, you cannot distinguish ecom from brand_store.**

3. **No FK between order_items ↔ products.** `meama_georgia_order_items.sku` links to `products_georgia.variant_sku` by text match only. ~15% of order_items have an empty-string SKU (free gifts, promo items, POS giveaways). These rows cannot be joined to a product.

4. **product_type has "(POS)" suffix variants.** "Machine" and "Machine (POS)" should map to the same category. Normalization: `REGEXP_REPLACE(product_type, ' \(POS\)$', '')`.

5. **`cost_per_item` is null** for all checked products_georgia rows — COGS is not populated from Shopify. The `products_master` table has `price_without_vat`, `price_b2c`, `price_b2b_low`, etc. but no explicit COGS column. **COGS must be loaded separately** (from `Meama Products Bible` or internal spreadsheet).

6. **`customers_georgia.machine_registered`** is a boolean flag, not a machine model. There is no machine model stored per customer. To derive `has_machine = true` + model, you'd need to scan order_items for Machine product_type purchases (products_georgia.product_type = 'Machine').

7. **Denormalized `email` in orders.** `meama_georgia_orders.email` is a copy of the customer email at order time — useful for guest orders (customer_id IS NULL), but can drift from the customer record.

8. **OTP email pattern.** Some customers have `email` like `0***@otp.customer.meama.ge` — these are phone-login customers with synthetic email addresses. Filter or mark these if using email for campaigns.

9. **`accept_marketing_email` and `sms_marketing` are nullable.** Treat NULL as unknown (not false) during ETL.

10. **Multiple channel customer tables.** `customers_b2b`, `customers_collect`, `customers_franchise`, `customers_vending` are separate tables with similar structures but different columns. `unified_customers` provides cross-channel identity resolution by canonical email/phone. Retail ETL should use only `customers_georgia`.

11. **ARRAY columns in products_georgia.** `tags`, `flavor_profile`, `ingredients`, `preferred_machine`, `vending_capsule_type`, `unit_and_child_skus` are Postgres `text[]` arrays. Querying requires `= ANY(array_col)` or `unnest()`.

12. **pg_stat shows 0 rows for products_georgia** despite data existing — this is a vacuum stats lag (table was populated recently). Use `SELECT COUNT(*)` for true count.

13. **Georgian text in titles and discount codes.** `title`, `discount_code` (e.g. `"თანამშრომელი"`), and product names are in Georgian script. Ensure UTF-8 throughout the ETL pipeline.

14. **`tag` column in orders** stores Shopify flow tags like `"QSHPR: Delivered"` / `"QSHPR: Cancelled"`. Not the same as the meama-prmtr channel enum.

15. **No subscriptions, no web session/event data** in the DB. These features would need to be built from scratch.

---

## Appendix: Row counts summary

| Table | Approx rows |
|---|---|
| meama_georgia_order_items | 553,727 |
| meama_georgia_orders | 214,052 |
| meama_georgia_orders_raw_debug | 162,491 |
| customers_georgia | 96,002 |
| campaign_orders | 48,123 |
| campaign_audience | 42,965 |
| job_run_details | 5,391 |
| georgia_abandoned_carts | 1,101 |
| customers_collect | 427 |
| campaigns | 174 |
| promotions | 174 |
| campaign_results | 127 |
| customers_vending | 87 |
| customers_b2b | 2 |
| products_georgia | (vacuum lag — data exists) |
| products_master | (vacuum lag) |

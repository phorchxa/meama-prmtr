# PORTFOLIO_AUDIT.md
> Read-only inventory. No code was changed. Date: 2026-06-15.
> **LIVE VERIFICATION ADDED 2026-06-15** — all population figures are real counts from the live Supabase DB.

---

## 1. DB Layer — `portfolio_customers` materialized view

### Source file
`supabase/migrations/0004_portfolio_view.sql`

### Status
**LIVE — view exists and is populated.** Total rows: **42,372**. The matview has been applied to the live DB. Verification query: `GET /rest/v1/portfolio_customers` → `Content-Range: 0-0/42372`.

### Column inventory (61 columns in final SELECT)

| # | Column | Derived type | Nullable? | Notes |
|---|--------|-------------|-----------|-------|
| 1 | `shopify_customer_id` | bigint | NOT NULL | PK, unique index |
| 2 | `full_name` | text | effectively NOT NULL | TRIM(first_name \|\| ' ' \|\| last_name) |
| 3 | `email` | text | **NULLABLE** | NULL for OTP accounts (`%@otp.customer.meama.ge`) |
| 4 | `phone` | text | NULLABLE | COALESCE(phone, default_address_phone) |
| 5 | `phone_only` | bool | NOT NULL | true when email is OTP-masked |
| 6 | `initials` | text | NOT NULL | UPPER(first_char \|\| last_char), '?' fallback |
| 7 | `accept_marketing_email` | bool | NOT NULL (COALESCE false) | consent flag |
| 8 | `sms_marketing` | bool | NOT NULL (COALESCE false) | consent flag |
| 9 | `region` | text | NOT NULL | 'tbilisi' / 'regions' / 'unknown' |
| 10 | `order_count` | int | NOT NULL | all valid retail orders |
| 11 | `total_spend` | numeric | NOT NULL | SUM(total) WHERE total > 0 |
| 12 | `aov` | numeric | NOT NULL | total_spend / order_count — **see AOV bug note** |
| 13 | `first_order_at` | timestamptz | NULLABLE | MIN(processed_at) |
| 14 | `last_order_at` | timestamptz | NULLABLE | MAX(processed_at) |
| 15 | `days_since_last_order` | int | NULLABLE | EXTRACT DAY from NOW() - last_order_at |
| 16 | `customer_since` | timestamptz | NULLABLE | COALESCE(created_at, first_order_at) |
| 17 | `tenure_days` | int | NULLABLE | days since customer_since |
| 18 | `tenure_months` | int | NULLABLE | floor(tenure_days / 30) |
| 19 | `active_months` | int | NOT NULL | COUNT DISTINCT month buckets with an order |
| 20 | `status` | text | NOT NULL | new / active / at_risk / lost |
| 21 | `segment` | text | NOT NULL | new_machine / loyalist / lapsed / at_risk / active |
| 22 | `health_score` | int | NOT NULL | 0–100 (recency 40 + freq 35 + monetary 25) |
| 23 | `recency_score` | int | NOT NULL | 0/10/20/30/40 |
| 24 | `frequency_score` | int | NOT NULL | 0/8/18/28/35 |
| 25 | `monetary_score` | int | NOT NULL | (1 – promo_share) × 25 — promo purity, NOT spend |
| 26 | `rfm_label` | text | NOT NULL | Champions / Loyal / Potential loyalist / At risk / Hibernating |
| 27 | `has_machine` | bool | NOT NULL | true if Machine product found in order items |
| 28 | `machine_model` | text | NULLABLE | most-recent Machine item title |
| 29 | `machine_acquisition_date` | timestamptz | NULLABLE | MIN(processed_at) of Machine orders |
| 30 | `machine_to_capsule_conversion_status` | text | NULLABLE | 5-value enum |
| 31 | `channel` | text | NULLABLE | online / in_store / app / mixed |
| 32 | `top_product_types` | text[] | NULLABLE | top-3 non-machine product types by order count |
| 33 | `top_item_title` | text | NULLABLE | most-ordered item title |
| 34 | `capsule_aov` | numeric | NULLABLE | capsule_spend / capsule_order_count |
| 35 | `avg_capsule_packs_per_month` | numeric | NULLABLE | capsule_quantity / active_months |
| 36 | `expected_next_order_date` | timestamptz | NULLABLE | last_order + avg inter-order gap; NULL if <2 orders |
| 37 | `top_flavors` | text[] | NULLABLE | top-3 flavor_profile values weighted by quantity |
| 38 | `format_preferences` | text[] | NULLABLE | top-3 capsule_format/package_type values |
| 39 | `never_bought_capsules_flag` | bool | NOT NULL | true if capsule_quantity = 0 |
| 40 | `favorite_intensity` | numeric | NULLABLE | qty-weighted avg of Products Bible intensity |
| 41 | `avg_capsule_price` | numeric | NULLABLE | SUM(qty × price) / SUM(qty) for capsules |
| 42 | `capsule_price_range` | text | NULLABLE | budget / mid_range / premium (NTILE 3) |
| 43 | `bought_capsule_categories` | text[] | NULLABLE | categories from bible_collection > beverage_type > capsule_format |
| 44 | `never_bought_capsule_categories` | text[] | NULLABLE | universe EXCEPT bought_capsule_categories |
| 45 | `avg_return_interval_days` | numeric | NULLABLE | avg of LAG gaps; NULL for 1-order customers |
| 46 | `median_return_interval_days` | numeric | NULLABLE | PERCENTILE_CONT(0.5) of gaps |
| 47 | `return_period_label` | text | NULLABLE | frequent / regular / slow / lapsed_pattern |
| 48 | `expected_return_window_start` | timestamptz | NULLABLE | last_order + 0.75 × median_interval |
| 49 | `expected_return_window_end` | timestamptz | NULLABLE | last_order + 1.25 × median_interval |
| 50 | `churn_reason` | text | NOT NULL | 8-value rule-based enum |
| 51 | `recommended_next_machine` | text | NULLABLE | NULL for existing machine owners |
| 52 | `delivery_vs_pickup_preference` | text | NOT NULL | delivery / pickup_or_store / mixed / unknown |
| 53 | `promo_orders` | int | NOT NULL | order count where discount_amount > 0 or discount_code set |
| 54 | `promo_spend` | numeric | NOT NULL | GEL spend on promo orders |
| 55 | `full_price_spend` | numeric | NOT NULL | GEL spend on non-promo orders |
| 56 | `promo_share` | numeric | NOT NULL | promo_orders / order_count |
| 57 | `capital_vs_regional` | text | NULLABLE | 'capital' / 'regional' / 'unknown' |
| 58 | `ecommerce_share` | numeric | NULLABLE | ecommerce_orders / order_count |
| 59 | `brand_store_share` | numeric | NULLABLE | brand_store_orders / order_count |
| 60 | `is_registered` | bool | NOT NULL | true when customers_georgia.created_at IS NOT NULL |
| 61 | `customer_created_at` | timestamptz | NULLABLE | c.created_at (raw Shopify account creation) |

### Population — LIVE COUNTS (42,372 total rows)

Verified by fetching all 42,372 rows and aggregating in Python. Run 2026-06-15.

| Column | Count | % populated | Notes |
|---|---|---|---|
| `email` | 20,185 | **47%** | 53% are OTP/guest — email NULL for ~half the base |
| `phone` | 42,044 | **99%** | Near-universal; good for SMS outreach |
| `top_flavors` (non-empty) | 32,925 | **77%** | flavor_profile data largely present in products table |
| `favorite_intensity` | 25,386 | **59%** | Products Bible Intensity level joins working for majority |
| `capsule_aov` | 33,152 | **78%** | Same cohort as bought_capsule_categories |
| `bought_capsule_categories` (non-empty) | 33,152 | **78%** | Same 33k cohort — good Bible coverage |
| `machine_model` | 13,619 | **32%** | Matches machine_owners exactly |
| `has_machine = true` | 13,619 | **32%** | 32% of customers bought a machine via Shopify |
| `expected_next_order_date` | 21,364 | **50%** | Customers with ≥2 orders |
| `return_period_label` | 21,364 | **50%** | Same 21k cohort as above — consistent |

### System/guest account filtering — LIVE CONFIRMED

**meamaguest@gmail.com IS in the view.** ID `7984494608576`, channel=`app`, **31,914 orders**, total spend 87,420 GEL, AOV 2.7 GEL. This account ranks #1 by spend and #1 by order count, by a factor of ~500×. It is almost certainly a system aggregator or vending/collection endpoint routed through source `195189899265`.

A second system account `ds@meama.ge` (ID `7874897281216`, "Meama2023") has **3,135 orders**, spend of only 20 GEL, and AOV 0.0 — another internal test/batch account.

Other suspicious accounts (extremely high order count, AOV < 5 GEL):
- `Dropper Dropper` — 2,110 orders, spend 6,441 GEL, AOV 3.0
- `Irakli Titvinidze` — 431 orders, spend 1,253 GEL, AOV 2.9
- `Teona Tvildiani` — 242 orders, spend 0 GEL, AOV 0.0

**None of these are excluded by the matview.** They pollute all aggregated metrics (averages, counts, segments). meamaguest@gmail.com alone represents 31,914 out of the total order volume.

### Channel source 195189899265 — LIVE CONFIRMED
Labeled **`app`** throughout. Live channel distribution:

| channel | customers | % |
|---------|-----------|---|
| online | 20,461 | 48.3% |
| in_store | 15,913 | 37.6% |
| mixed | 5,388 | 12.7% |
| **app** | **610** | **1.4%** |

Note: meamaguest@gmail.com (31,914 orders) is one of the 610 `app` customers. Its presence inflates the `app` segment's order and spend totals enormously.

---

## 2. API Layer

### GET `/api/v1/portfolios` — List endpoint

**File:** `backend/app/routers/portfolios.py` — `_LIST_COLS` string

**Fields returned:** All 61 matview columns **except `first_order_at`** (it is excluded from `_LIST_COLS`).

The response schema is `Page[PortfolioSummary]` with `items`, `total`, `page`, `page_size`.

**Available filters:**

| Param | Type | Description |
|-------|------|-------------|
| `q` | string | ilike search on full_name, email, phone |
| `status` | string | eq filter: new / active / at_risk / lost |
| `segment` | string | eq filter: loyalist / at_risk / lapsed / new_machine / active |
| `region` | string | eq filter: tbilisi / regions / unknown |
| `channel` | string | eq filter: online / in_store / app / mixed |
| `has_machine` | bool | eq filter |
| `no_machine` | bool | shorthand for has_machine=false |
| `email_consent` | bool | eq on accept_marketing_email |
| `sms_consent` | bool | eq on sms_marketing |
| `any_consent` | bool | OR(accept_marketing_email=true, sms_marketing=true) |
| `promo_heavy` | bool | promo_share >= 0.6 |
| `sort` | string | one of: last_order_at, total_spend, order_count, days_since_last_order, aov, health_score, promo_share |
| `desc` | bool | sort direction (default true) |
| `page` | int ≥1 | (default 1) |
| `page_size` | int 1–200 | (default 50) |

**Missing field from list API:** `first_order_at` (present in matview, absent from `_LIST_COLS`).

---

### GET `/api/v1/portfolios/{id}` — Detail endpoint

**File:** `backend/app/routers/portfolios.py` — `get_portfolio()`

Uses `select("*")` — returns **all 61 matview columns** including `first_order_at`.

Additionally returns `recent_orders` (up to 20 most-recent retail orders, same channel filter):

| Field | Type |
|-------|------|
| `shopify_order_id` | int |
| `processed_at` | datetime |
| `total` | float |
| `source` | string (web / pos / 195189899265) |
| `discount_code` | string |
| `discount_amount` | float |

---

## 3. Frontend Layer

### Card component (`CustomerCard` in `Portfolios.tsx`)

Fields **rendered** on the list card:

| Section | Fields rendered |
|---------|----------------|
| Avatar | `initials`, `health_score` (as background color) |
| Header | `full_name` (or `shopify_customer_id` fallback), `segment` tag, `status` tag, `total_spend` |
| Health bar | `health_score` (bar + number) |
| Metrics grid | `order_count`, `aov`, `last_order_at`, `expected_next_order_date`, `channel`, `region`, `has_machine`/`machine_model`/`machine_to_capsule_conversion_status` (composite), `capsule_price_range` |
| Product signal | `top_flavors[0]` or `top_item_title`, `top_product_types[0]`, `promo_share` (as %) |
| Footer | `churn_reason`, reachable badge from `accept_marketing_email`/`sms_marketing` |

---

### Drawer (`CustomerDrawer` in `Portfolios.tsx`) and Detail page (`PortfolioDetail.tsx`)

Both render **identical sections**. Detail page uses 4-column grid; drawer uses 2-column.

| Section | Fields rendered |
|---------|----------------|
| **Header** | `initials`, `full_name`, `segment` tag, `status` tag, `churn_reason` tag |
| **Stats row** | `total_spend` (LTV), `order_count`, `aov`, `health_score` |
| **Overview** | `full_name`, `email`, `phone`, `region`, `customer_since`, `tenure_months`, `active_months`, `is_registered` |
| **Commercial** | `total_spend`, `order_count`, `aov`, `health_score`, `recency_score`, `frequency_score`, `monetary_score`, `rfm_label` |
| **Lifecycle** | `status`, `segment`, `days_since_last_order`, `expected_next_order_date`, `return_period_label`, `last_order_at` |
| **Product DNA** | `top_flavors[0]`+`top_item_title` (composite), `favorite_intensity`, `avg_capsule_price`, `capsule_price_range`, `top_flavors` (chip list), `format_preferences` (chip list), `bought_capsule_categories` (chip list), `never_bought_capsule_categories` (chip list) |
| **Machine Journey** | `has_machine`/`machine_model` (composite), `machine_model`, `machine_acquisition_date`, `machine_to_capsule_conversion_status`, `recommended_next_machine`, `avg_capsule_packs_per_month` |
| **Behavior** | `avg_return_interval_days`, `median_return_interval_days`, `expected_return_window_start`, `expected_return_window_end`, `delivery_vs_pickup_preference`, `channel`, channel split bar (`ecommerce_share` + `brand_store_share`) |
| **Marketing** | `accept_marketing_email`, `sms_marketing`, `promo_share`, `promo_spend`, `full_price_spend`, reachable (composite) |
| **Risk & Opportunity** | `churn_reason`, `nextBestAction()` (derived from churn_reason + recommended_next_machine + expected_next_order_date) |
| **Recent Orders** | `shopify_order_id`, `processed_at`, `source`, `total` (up to 6 rows in drawer, 12 in detail page) |

### Fields in API but NOT rendered anywhere

| Field | Available in | Not rendered |
|-------|-------------|--------------|
| `capital_vs_regional` | both APIs | card + drawer + detail |
| `capsule_aov` | both APIs | card + drawer + detail |
| `phone_only` | both APIs | shown as null email only, no explicit flag |
| `never_bought_capsules_flag` (bool) | both APIs | never_bought_capsule_categories list IS shown |
| `promo_orders` (count) | both APIs | promo_share % + promo_spend ₾ are shown, not the count |
| `tenure_days` | both APIs | tenure_months IS shown |
| `customer_created_at` | both APIs | customer_since is shown (=COALESCE of this) |
| `first_order_at` | detail API only | customer_since covers this |

---

## 4. Gap Table — Customer 360 Spec

### Legend
- **Matview?** — column exists in `portfolio_customers` final SELECT
- **Populated?** — Y = always populated by logic; NULL = nullable / conditional; 0/null = computed but often zero; ~= estimated from logic (live DB not queryable)
- **List API?** — returned by `GET /api/v1/portfolios`
- **Detail API?** — returned by `GET /api/v1/portfolios/{id}`
- **Card?** — rendered on CustomerCard
- **Drawer/Detail?** — rendered in CustomerDrawer + PortfolioDetail page

### Identity

| Field | In matview? | Populated? | List API? | Detail API? | Card? | Drawer? | Notes |
|-------|-------------|-----------|-----------|-------------|-------|---------|-------|
| `customer_id` | ✅ as `shopify_customer_id` | Y | ✅ | ✅ | ✅ (fallback label) | ✅ (header) | |
| `full_name` | ✅ | Y (may be empty string) | ✅ | ✅ | ✅ | ✅ | |
| `email` | ✅ | ~80% (NULL for OTP) | ✅ | ✅ | ❌ | ✅ (Overview) | |
| `phone` | ✅ | Unknown | ✅ | ✅ | ❌ | ✅ (Overview) | |
| `phone_only` (OTP flag) | ✅ | ~% of OTP customers | ✅ | ✅ | ❌ | ❌ | In API, not rendered as a field anywhere |
| `registration_date` | ✅ as `customer_since` + `customer_created_at` | ~NULL for orders-only | ✅ | ✅ | ❌ | ✅ (customer_since) | Two fields; customer_created_at is redundant with customer_since |
| `tenure` | ✅ as `tenure_days` + `tenure_months` | ~NULL for no created_at | ✅ | ✅ | ❌ | ✅ (months only) | Days in API but not rendered |
| `active_months` | ✅ | Y | ✅ | ✅ | ❌ | ✅ | |
| `registered_vs_guest` | ✅ as `is_registered` (bool) | Y | ✅ | ✅ | ❌ | ✅ ("Registered: Yes/No") | Spec implies ratio; matview provides bool only. No "guest" segment. |

### Purchase

| Field | In matview? | Populated? | List API? | Detail API? | Card? | Drawer? | Notes |
|-------|-------------|-----------|-----------|-------------|-------|---------|-------|
| `RFM — r score` | ✅ as `recency_score` | Y (0/10/20/30/40) | ✅ | ✅ | ❌ | ✅ (Commercial) | |
| `RFM — f score` | ✅ as `frequency_score` | Y (0/8/18/28/35) | ✅ | ✅ | ❌ | ✅ (Commercial) | |
| `RFM — m score` | ✅ as `monetary_score` | Y | ✅ | ✅ | ❌ | ✅ (Commercial) | **Bug**: monetary_score = (1–promo_share)×25 — this is promo purity, not spend. Not RFM-standard. |
| `total_orders` | ✅ as `order_count` | Y | ✅ | ✅ | ✅ | ✅ | |
| `AOV_total` | ✅ as `aov` | Y | ✅ | ✅ | ✅ | ✅ | **Bug**: denominator = all order_count; `total_spend` excludes zero-spend but `order_count` does not. Violates `AOV_EXCLUDES_ZERO_SPEND = True`. |
| `AOV_capsules_only` | ✅ as `capsule_aov` | ~NULL; only if capsule purchases exist | ✅ | ✅ | ❌ | ❌ | In API but not rendered anywhere |
| `avg_packs_per_month` | ✅ as `avg_capsule_packs_per_month` | ~NULL; only if capsule purchases exist | ✅ | ✅ | ❌ | ✅ (Machine Journey) | |
| `last_order_date` | ✅ as `last_order_at` | Y | ✅ | ✅ | ✅ | ✅ | |
| `expected_next_order_date` | ✅ | ~NULL if <2 orders | ✅ | ✅ | ✅ | ✅ | |
| `discount_dependency_%` | ✅ as `promo_share` | Y | ✅ | ✅ | ✅ (Promo %) | ✅ (Marketing) | |

### Flavor / Product

| Field | In matview? | Populated? | List API? | Detail API? | Card? | Drawer? | Notes |
|-------|-------------|-----------|-----------|-------------|-------|---------|-------|
| `top_flavors` | ✅ | ~NULL if no capsule orders or no flavor_profile in products table | ✅ | ✅ | ✅ (first one) | ✅ (chip list) | Depends on `products_georgia.flavor_profile` array being populated |
| `format_preference` | ✅ as `format_preferences` | ~NULL if capsule_format/package_type empty | ✅ | ✅ | ❌ | ✅ (chip list) | |
| `favorite_intensity` | ✅ | ~NULL; requires Products Bible `Intensity level` data | ✅ | ✅ | ❌ | ✅ | |
| `flavor_subcategories` | ⚠️ as `bought_capsule_categories` | ~NULL; partial | ✅ | ✅ | ❌ | ✅ (chip list) | Populated from Products Bible `Collection` > `Beverage Type` > capsule_format fallback — not the same as flavor subcategories per se |
| `never_bought_capsules_flag` | ✅ | Y (true = no capsules ever) | ✅ | ✅ | ❌ | ❌ | In API but not rendered as a field. `never_bought_capsule_categories` list IS rendered. |
| `avg_capsule_price_range` | ✅ as `capsule_price_range` | ~NULL if no capsule purchases | ✅ | ✅ | ✅ | ✅ | |

### Machine

| Field | In matview? | Populated? | List API? | Detail API? | Card? | Drawer? | Notes |
|-------|-------------|-----------|-----------|-------------|-------|---------|-------|
| `machine_owned_model` | ✅ as `machine_model` | ~NULL; only from Machine-type order items | ✅ | ✅ | ✅ (composite) | ✅ | Only from purchase history — customers who registered a machine externally but didn't buy via Shopify would show NULL |
| `machine_acquisition_date` | ✅ | ~NULL | ✅ | ✅ | ❌ | ✅ | |
| `recommended_next_machine` | ✅ | ~NULL (only for non-owners; rule-based on capsule signals) | ✅ | ✅ | ❌ | ✅ | Logic is `Versatile / Multi Machine / European Machine` based on LIKE on capsule signal string — coarse |
| `machine_to_capsule_conversion_status` | ✅ | Y (always gets one of 5 values) | ✅ | ✅ | ✅ (composite "Machine" metric) | ✅ | |

### Lifecycle / Geo

| Field | In matview? | Populated? | List API? | Detail API? | Card? | Drawer? | Notes |
|-------|-------------|-----------|-----------|-------------|-------|---------|-------|
| `status` (New/Active/At-risk/Lost) | ✅ | Y | ✅ | ✅ | ✅ | ✅ | |
| `inactive/at-risk thresholds applied?` | ✅ (built-in logic) | Y | ✅ | ✅ | ✅ | ✅ | 45/90-day windows are hardcoded in SQL, matching `business_rules.py` |
| `churn_reason` | ✅ | Y (8-value enum; always returns a value) | ✅ | ✅ | ✅ | ✅ | Rule-based, not ML |
| `return_period` | ✅ as `return_period_label` | ~NULL for 1-order customers | ✅ | ✅ | ❌ | ✅ (Lifecycle) | |
| `region` | ✅ | Y (tbilisi/regions/unknown) | ✅ | ✅ | ✅ | ✅ (Overview) | |
| `delivery_vs_pickup` | ✅ as `delivery_vs_pickup_preference` | Y (always one of 4 values) | ✅ | ✅ | ❌ | ✅ (Behavior) | |
| `capital_vs_regional` | ✅ | Y | ✅ | ✅ | ❌ | ❌ | **In API but not rendered anywhere** |
| `LTV_REGISTERED_ONLY` applied? | ❌ | — | — | — | — | — | Business rule says `LTV_REGISTERED_ONLY = True`. The matview includes ALL customers with retail orders regardless of `is_registered`. The LTV shown IS for all customers, not registered-only. |

### Channel

| Field | In matview? | Populated? | List API? | Detail API? | Card? | Drawer? | Notes |
|-------|-------------|-----------|-----------|-------------|-------|---------|-------|
| `primary_channel` | ✅ as `channel` | Y | ✅ | ✅ | ✅ | ✅ (Behavior) | online/in_store/app/mixed |
| `channel_usage_% — ecommerce` | ✅ as `ecommerce_share` | ~NULL; requires at least 1 order | ✅ | ✅ | ❌ | ✅ (channel split bar) | |
| `channel_usage_% — brand store` | ✅ as `brand_store_share` | ~NULL | ✅ | ✅ | ❌ | ✅ (channel split bar) | |
| `channel_usage_% — app` | ❌ (no `app_share` column) | — | ❌ | ❌ | ❌ | ❌ | `app_orders` count is in the `cust_agg` CTE but NOT selected into the final matview. No app share % exists anywhere. |
| `ecommerce_vs_brand_store_split` | ✅ via `ecommerce_share` + `brand_store_share` | ~NULL | ✅ | ✅ | ❌ | ✅ (ChannelSplit bar) | "Other" in bar = residual (includes app orders silently) |

---

## 5. Critical Issues Summary — LIVE VERIFIED

| # | Issue | Severity | Live evidence |
|---|-------|----------|---------------|
| 1 | **~~Matview not applied~~** *(corrected)* | — | View exists, 42,372 rows. Earlier claim was wrong. |
| 2 | **System accounts pollute all metrics** | **P0** | `meamaguest@gmail.com` (ID 7984494608576): 31,914 orders, 87,420 GEL spend, AOV 2.7. `ds@meama.ge` (ID 7874897281216): 3,135 orders, 20 GEL spend, AOV 0.0. Neither excluded by matview. |
| 3 | **monetary_score is promo purity, NOT spend — CONFIRMED** | **P1** | Live data: avg_M for <500 GEL spenders = **17.0**; avg_M for 2000+ GEL spenders = **10.3**. Score DECREASES as spend increases. Labeled "Monetary" in the drawer but measures discount avoidance, not revenue value. |
| 4 | **AOV bug: zero-spend orders in denominator** | P1 | `total_spend` excludes zero-spend orders but `order_count` (denominator) does not. Evidence: `Teona Tvildiani` — 242 orders, spend 0 GEL, AOV 0.0. Violates `AOV_EXCLUDES_ZERO_SPEND = True`. |
| 5 | **LTV_REGISTERED_ONLY not enforced** | P1 | Matview includes all 42,372 customers regardless of `is_registered`. Business rule says registered-only for LTV metric. |
| 6 | **53% of customers have NULL email** | P1 | 20,185 / 42,372 have email (47%). Half the base is OTP/phone-only — email marketing segments dramatically overstated if using email-based filtering. |
| 7 | **No `app_share` column** | P2 | `app_orders` in CTE but not in final SELECT. ChannelSplit bar shows amber "Other" which silently absorbs 610 app customers' orders. |
| 8 | **`capital_vs_regional` not rendered** | P2 | Column present in matview + both APIs; never displayed on card, drawer, or detail page. |
| 9 | **`capsule_aov` not rendered** | P2 | 33,152 customers (78%) have a capsule_aov value. In both APIs but shown nowhere in the UI. |
| 10 | **`first_order_at` missing from list API** | P3 | Excluded from `_LIST_COLS`; reachable via detail only. |
| 11 | **"Never ordered" and "Recommend" filters are stubs** | P3 | Frontend shows "This view needs a dedicated endpoint" — no backend support. |
| 12 | **Recommended machine logic is coarse** | P4 | String LIKE on capsule signal: only 3 outputs. NULL if signal doesn't match. |

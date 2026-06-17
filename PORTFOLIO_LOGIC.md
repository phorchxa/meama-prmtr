# Portfolio Logic Reference — MEAMA PRMTR

> **Audience:** Product team, analysts, CRM managers. Engineers should read the SQL source directly.
> **Primary source:** `supabase/migrations/0004_portfolio_view.sql`
> **Business constants:** `backend/app/business_rules.py`
> **Last reviewed:** 2026-06-17

---

## 1. Data Scope — What Customers Are Included

### Source Tables

| Table | Role |
|---|---|
| `customers_georgia` | Master customer registry — provides name, email, phone, consent, created_at |
| `meama_georgia_orders` | Every order header — total, date, source channel, city, discount |
| `meama_georgia_order_items` | Line items — SKU, title, quantity, price |
| `products_georgia` | Product catalog — maps SKU → product_type, flavor_profile, preferred_machine |
| `Meama Products Bible` | Coffee Bible — maps Fina Code → intensity, flavor text, beverage type |

The view is built with `customers_georgia INNER JOIN cust_agg` — meaning **a customer appears in the view only if they have at least one qualifying retail order.** Pure registered-but-never-ordered accounts are excluded.

### Order Filters (applied in `retail_orders` CTE)

Three conditions must ALL be true for an order to count:

```sql
financial_status <> 'voided'
AND cancelled_at IS NULL
AND source IN ('web', 'pos', '195189899265')
```

| Filter | What it removes |
|---|---|
| `financial_status <> 'voided'` | Failed / reversed payments |
| `cancelled_at IS NULL` | Customer-cancelled orders |
| `source IN (...)` | Vending machine sales, B2B, collect-point orders, internal sources |

The three valid sources map to channels:
- `web` → online (E-Commerce)
- `pos` → in_store (Brand Stores)
- `195189899265` → app (Meama mobile app)

### What Excludes a Customer Entirely

- Customer has **zero qualifying retail orders** (all orders are voided, cancelled, or non-retail)
- Customer exists only in `customers_georgia` but has never placed an order (`cust_agg` INNER JOIN excludes them)

There is **no guest-order filtering** at the customer level. Guest orders (`customer_id IS NULL`) are excluded from all per-customer aggregations because every CTE filters `WHERE customer_id IS NOT NULL`, but they don't affect who appears in the view.

---

## 2. Every Metric — How It's Calculated

### Identity & Contact

**`shopify_customer_id`** — Shopify's internal integer ID. Primary key of the view.

**`full_name`** — `TRIM(first_name || ' ' || last_name)` from `customers_georgia`. May be blank if no name was captured.

**`email`** — Real email address. If it matches `%@otp.customer.meama.ge` (Meama's OTP placeholder domain), it is set to NULL and `phone_only = true`.

**`phone`** — `COALESCE(c.phone, c.default_address_phone)`. Falls back to the address-level phone if the account phone is missing.

**`phone_only`** — `true` when the email domain is `@otp.customer.meama.ge`. These customers authenticated via SMS OTP only; their "email" is synthetic and should not be used for email campaigns.

**`initials`** — First letter of first name + first letter of last name, uppercased. Falls back to `?` if first name is blank.

**`accept_marketing_email`** / **`sms_marketing`** — Direct flags from `customers_georgia`. `false` if NULL.

**`is_registered`** — `true` if `customers_georgia.created_at IS NOT NULL`. A customer may exist in orders without a Shopify account (guest checkout edge cases).

**`customer_created_at`** — The timestamp Shopify created the account. NULL for unregistered customers.

---

### Geography

**`region`**

```sql
CASE
  WHEN LOWER(city) IN ('tbilisi', 'თბილისი', 'тбилиси') THEN 'tbilisi'
  WHEN city IS NOT NULL AND TRIM(city) <> ''             THEN 'regions'
  ELSE                                                        'unknown'
END
```

City is taken from the most-recent order's `shipping_city`. Falls back to `default_address_city` if the order has no city. Three Georgian/Russian spellings of Tbilisi are normalised to `'tbilisi'`.

**`capital_vs_regional`** — Same logic as `region` but uses labels `capital` / `regional` / `unknown`. Redundant with `region` but retained for filter compatibility.

---

### Order Volume & Spend

**`order_count`** — Total number of qualifying retail orders. `COUNT(*)` over `retail_orders` per customer. Includes orders with ₾0 total.

**`total_spend`** (LTV) — `SUM(total) FILTER (WHERE total > 0)`. Zero-value orders (₾0) are excluded from the spend sum but **not** from `order_count`. This means a customer with 3 orders at ₾50, ₾0, ₾30 has `order_count=3` but `total_spend=80`.

**`aov`** (Average Order Value)

```sql
ROUND(total_spend / order_count, 2)
```

> ⚠️ **Known issue:** The AOV denominator is `order_count` (includes ₾0 orders), not the count of paid orders. A customer with 10 orders where 2 were ₾0 gets their AOV diluted. The business rule `AOV_EXCLUDES_ZERO_SPEND = True` in `business_rules.py` documents the *intended* behaviour, but the SQL does not yet implement a paid-order denominator.

**NULL:** AOV is 0 (not NULL) for customers with no spend.

---

### Dates & Tenure

**`first_order_at`** — `MIN(processed_at)` across all qualifying retail orders.

**`last_order_at`** — `MAX(processed_at)` across all qualifying retail orders.

**`days_since_last_order`** — `EXTRACT(DAY FROM NOW() - last_order_at)::int`. Computed at matview refresh time, so it ages between refreshes. The nightly cron runs at 02:00 Asia/Tbilisi.

**`customer_since`**

```sql
COALESCE(c.created_at, ca.first_order_at)
```

The account creation date if available; otherwise the date of the first retail order. Used as the anchor for tenure calculations.

**`tenure_days`** — `EXTRACT(DAY FROM NOW() - customer_since)::int`. How long this customer has been in the Meama ecosystem.

**`tenure_months`** — `FLOOR(tenure_days / 30)`. Not calendar months — just days ÷ 30. A 31-day-old customer is `1 month`, a 59-day-old customer is still `1 month`.

**`active_months`** — `COUNT(DISTINCT DATE_TRUNC('month', processed_at))`. The number of distinct calendar months in which the customer placed at least one order. A customer who ordered in Jan, Mar, and Apr has `active_months = 3` regardless of Feb gap.

---

### Return Interval & Reorder Window

These require **≥ 2 orders** to compute any gap. Customers with 1 order get NULL for all interval fields.

**`avg_return_interval_days`**

```sql
AVG(gap_days)  -- where gap_days = current_order_date - previous_order_date (days)
```

Computed by taking the lag difference between consecutive orders per customer and averaging them. Negative gaps are excluded (data quality guard: `WHERE gap_days >= 0`).

**`median_return_interval_days`** — `PERCENTILE_CONT(0.5)` of the same gap list. More robust than average for customers with occasional long gaps.

**`return_period_label`** — Categorises the median interval (falling back to average if median is NULL):

| Label | Condition |
|---|---|
| `frequent` | median < 14 days |
| `regular` | 14 ≤ median ≤ 30 days |
| `slow` | 31–60 days |
| `lapsed_pattern` | > 60 days |
| NULL | Only 1 order (no gap to measure) |

**`expected_next_order_date`**

```sql
last_order_at + (last_order_at - first_order_at) / (order_count - 1)
```

This adds the average inter-order interval to the last order date. Equivalent to projecting the historical order cadence one step forward. NULL for customers with < 2 orders.

**`expected_return_window_start`** — `last_order_at + median_interval × 0.75 days`

**`expected_return_window_end`** — `last_order_at + median_interval × 1.25 days`

Together these define a ±25% window around the median interval. The window start is when a reactivation nudge can begin; the end is when the customer transitions to at-risk if no order is placed.

---

### Promo / Discount Metrics

An order is counted as a **promo order** if:
```sql
discount_amount > 0  OR  (discount_code IS NOT NULL AND discount_code <> '')
```

**`promo_orders`** — Count of promo orders.

**`promo_spend`** — `SUM(total)` on promo orders only.

**`full_price_spend`** — `SUM(total)` on orders where `discount_amount = 0` AND no discount code AND `total > 0`.

**`promo_share`** — `promo_orders / order_count`. Proportion of all orders that used any discount. A customer with promo_share = 0.80 used a discount on 80% of their orders.

> **Threshold:** promo_share ≥ 0.60 is considered "discount-led" and triggers a `churn_reason = 'promo_dependent'` flag.

---

### Channel

**`channel`**

```sql
CASE
  WHEN web_orders > 0 AND pos_orders > 0 THEN 'mixed'
  WHEN web_orders > 0                    THEN 'online'
  WHEN pos_orders > 0                    THEN 'in_store'
  WHEN app_orders > 0                    THEN 'app'
  ELSE 'online'
END
```

> ⚠️ **Limitation:** `mixed` is defined as *both web AND POS*. A customer who only uses the app (source `195189899265`) plus web would be `online` (web wins), not `mixed`. App orders do not participate in the mixed logic.

**`ecommerce_share`** — `web_orders / order_count`. Fraction of all orders placed online.

**`brand_store_share`** — `pos_orders / order_count`.

There is no `app_share` column in the DB view. App is tracked via `app_orders` in the intermediate CTE but not exposed as a separate share column.

---

### Machine & Conversion

**`has_machine`** — `true` if at least one item with `product_type IN ('Machine', 'Machine (POS)')` appears in the customer's order history.

**`machine_model`** — Product title of the **most recently purchased** machine. NULL if no machine.

**`machine_acquisition_date`** — Date of the **first** machine purchase. NULL if no machine.

**`machine_to_capsule_conversion_status`**

| Value | Meaning | Trigger |
|---|---|---|
| `no_machine` | No machine purchased, not registered, no capsule orders either | `has_machine=false AND machine_registered=false AND capsule_quantity=0` |
| `capsules_without_machine_purchase` | Buying capsules but no machine purchase on record | `has_machine=false AND machine_registered=false AND capsule_quantity > 0` — likely got machine as a gift or through another channel |
| `machine_only_no_capsules` | Purchased a machine but bought zero capsules | `has_machine=true AND capsule_quantity=0` — **silent churn signal** |
| `machine_then_capsules` | Purchased machine, then bought capsules after | `has_machine=true AND last_capsule_order_at >= machine_acquisition_date` |
| `unknown` | Machine is registered in system but no purchase record, or edge case | `machine_registered=true AND has_machine=false` |

---

### Capsule Metrics

**`capsule_aov`**

```sql
ROUND(capsule_spend / capsule_order_count, 2)
```

Average spend per order that contained at least one capsule item. NULL for customers who never bought capsules. Differs from `aov` because it counts only capsule orders, not all orders.

**`avg_capsule_packs_per_month`**

```sql
ROUND(capsule_quantity / active_months, 2)
```

Total number of capsule units purchased divided by the number of calendar months in which any order was placed. NULL if `active_months = 0`.

> **Why 2.5/month?** Product guidance considers 2.5 packs/month a healthy consumption rate for a machine owner. Customers below 1.5/month (`underConsuming` in the frontend) are flagged as under-consuming. This threshold is a product assumption, not encoded in the SQL.

**`avg_capsule_price`** — `SUM(quantity × price) / SUM(quantity)` across all capsule line items. Weighted average price per capsule unit. NULL if no capsules purchased.

**`capsule_price_range`** — Relative tier: `budget` / `mid_range` / `premium`. Assigned using `NTILE(3)` across all customers' `avg_capsule_price`. Boundaries shift with the customer population, so there are no fixed GEL thresholds.

**`never_bought_capsules_flag`** — `true` if `capsule_quantity = 0`. Simple boolean; primary input for filtering machine-only customers.

---

### Flavor & Intensity (Bible-Based)

These three fields come exclusively from the **Meama Products Bible** table via a 3-tier SKU join. They are independent of the `products_georgia` catalog.

#### Bible SKU Matching (3 tiers)

```
Tier 1 — Exact: order_item.sku = Bible."Fina Code"
Tier 2 — cap37 alias: cap37-XX → cap37-10XX   (e.g. cap37-9 → cap37-109)
Tier 3 — cap51 alias: cap51-XX → cap51-12XX   (e.g. cap51-11 → cap51-1211)
```

Short-format SKUs (`cap37-9`, `cap51-5`) are Vending aliases that map to the standard Fina Code format. Tiers 2 and 3 handle this rewrite automatically.

Items with titles containing `" - Vending"` or `" - Free"` are excluded to avoid polluting flavor/intensity data with non-retail capsule types.

**`favorite_intensity`**

```sql
SUM(quantity × intensity) / SUM(quantity WHERE intensity IS NOT NULL)
```

Quantity-weighted average intensity across all matched capsule purchases. Intensity values come from the Bible's `"Intensity level"` column (numeric, typically 1–12 scale). NULL if no Bible matches were found for this customer.

**`intensity_bucket`**

| Value | Condition |
|---|---|
| `light` | favorite_intensity < 4 |
| `medium` | 4 ≤ favorite_intensity < 7 |
| `strong` | favorite_intensity ≥ 7 |
| NULL | No Bible intensity data |

**`top_flavors`** — Array of up to 3 flavor descriptors, quantity-weighted.

Process:
1. For each matched capsule item, the Bible's `"Flavor Profile"` text field is split on commas: e.g. `"Chocolatey, Roasty, Nutty"` → three tokens.
2. Each token is lowercased and trimmed.
3. All tokens are aggregated across all purchases, weighted by quantity ordered.
4. Top 3 by weight are returned.

Result example: `['roasty', 'coffee', 'smoky']`

NULL if no Bible flavor profile data is available.

**`beverage_type_preference`** — The customer's dominant beverage type by quantity, mapped to an English slug:

| Bible value (Georgian) | Output |
|---|---|
| ესპრესო & ლუნგო | `espresso` |
| ფილტრის ყავა | `filter_coffee` |
| ჩაი & ნაყენი | `tea` |
| მიქსოლოგია | `cold_mix` |
| საკვები დანამატი | `wellness` |
| anything else | `other` |
| no Bible data | NULL |

**`bible_match_rate`** — `COUNT(matched_fina_code) / COUNT(*)` across all non-null, non-empty SKU line items for the customer. A rate of 0.85 means 85% of that customer's capsule SKUs resolved to a Bible entry. Rates below 0.5 indicate the customer's purchase history is dominated by SKUs not yet in the Bible (often older or regional variants).

---

### Product Categories & Top Items

**`top_product_types`** — Array of up to 3 non-machine product types the customer has ordered most frequently. Machine and Machine Part rows are excluded. Types are cleaned by stripping the `" (POS)"` suffix so POS and web variants collapse to the same type.

**`top_item_title`** — The single most-ordered individual item title (by line-item occurrence count), excluding machines.

**`bought_capsule_categories`** — Ordered array of all capsule categories this customer has purchased, by quantity descending. Category is resolved by priority:

```
Bible "Collection" → Bible "Beverage Type" → capsule_format → package_type → product_type
```

**`never_bought_capsule_categories`** — All categories that exist in the DB (across any customer) minus this customer's `bought_capsule_categories`. Computed with SQL `EXCEPT`. Useful for cross-sell targeting: "has never tried Wellness capsules."

---

### Fulfillment Preference

**`delivery_vs_pickup_preference`**

```sql
CASE
  WHEN delivery_orders / total >= 0.70 THEN 'delivery'
  WHEN pickup_or_store_orders / total >= 0.70 THEN 'pickup_or_store'
  WHEN delivery_orders > 0 AND pickup_or_store_orders > 0 THEN 'mixed'
  ELSE 'unknown'
END
```

Delivery = web orders. Pickup/store = POS orders or orders with a non-empty `location` field. A customer needs ≥ 70% of orders via one method to be classified as that type; otherwise they are `mixed` (if both) or `unknown`.

---

### Machine Recommendation

**`recommended_next_machine`** — Only populated for customers who do NOT yet have a machine (`has_machine = false` and `machine_registered = false`). Logic scans the customer's capsule purchase history for keywords:

```
signal LIKE '%versatile%'  → 'Versatile'
signal LIKE '%multi%'      → 'Multi Machine'
signal LIKE '%european%' OR '%espresso%' → 'European Machine'
otherwise                  → NULL
```

The `machine_signal` is assembled from `preferred_machine` (products_georgia), `Compatible with` (Bible), `capsule_format`, and `package_type` fields across all capsule purchases. NULL if no meaningful signal is found or if the customer already has a machine.

---

## 3. RFM — Full Explanation

RFM stands for **Recency, Frequency, Monetary**. It is a classic CRM scoring framework that quantifies how recently a customer bought, how often they buy, and how much value they bring. For a coffee subscription business like Meama, high recency and frequency are the primary signals of a healthy relationship; spend quality indicates whether the relationship is sustainable (full-price) or fragile (promo-dependent).

### Score Breakdown

**Recency (0–40 points)** — Days since the last qualifying order:

| Points | Days since last order |
|---|---|
| 40 | < 20 days |
| 30 | 20–44 days |
| 20 | 45–59 days |
| 10 | 60–89 days |
| 0 | ≥ 90 days |

**Frequency (0–35 points)** — Total order count:

| Points | Order count |
|---|---|
| 35 | ≥ 15 orders |
| 28 | 8–14 orders |
| 18 | 4–7 orders |
| 8 | 2–3 orders |
| 0 | 1 order |

**Monetary / "Spend Quality" (0–25 points)**

> ⚠️ **Known Bug:** This score does NOT measure spend size. It measures **full-price purity**:
> ```sql
> ROUND((1.0 - LEAST(1.0, promo_spend / total_spend)) * 25)
> ```
> A customer who spends ₾2,000 entirely on discounts scores **0 points**. A customer who spends ₾50 entirely at full price scores **25 points**. The name "monetary_score" is misleading. The intent is to penalise promo-dependent customers in their health score. This is documented as a known limitation; the correct metric would use a spend-tier percentile.

### Health Score (0–100)

```
health_score = recency_score + frequency_score + monetary_score
```

Maximum: 40 + 35 + 25 = **100**. Minimum: 0.

### RFM Label

Labels are assigned in priority order (first match wins):

| Label | Condition |
|---|---|
| `New / Low history` | order_count ≤ 1 |
| `Champions` | recency ≥ 30 AND frequency ≥ 28 AND monetary ≥ 20 |
| `Loyal` | recency ≥ 30 AND frequency ≥ 18 (any monetary) |
| `Potential loyalist` | recency ≥ 20 AND frequency ≥ 8 (any monetary) |
| `At risk` | recency ≥ 10 (any frequency/monetary) |
| `Hibernating` | recency = 0 (last order ≥ 90 days ago) |

In plain language:
- **Champions** — bought very recently, very often, and mostly at full price. Protect them; never discount them.
- **Loyal** — recent and frequent but may be promo-dependent.
- **Potential loyalist** — moderately recent and starting to build frequency. Nurture.
- **At risk** — last order was 60–89 days ago. Need a reactivation nudge.
- **Hibernating** — gone 90+ days. Harder to reactivate; last-chance campaigns only.

---

## 4. Lifecycle / Status — Exact Rules

### Status (simplified 4-bucket field)

Calculated purely from recency and order count:

```sql
CASE
  WHEN order_count = 1                   THEN 'new'
  WHEN days_since_last_order < 45        THEN 'active'
  WHEN days_since_last_order < 90        THEN 'at_risk'
  ELSE                                        'lost'
END
```

| Status | Definition |
|---|---|
| `new` | Exactly 1 qualifying retail order ever |
| `active` | ≥ 2 orders AND last order < 45 days ago |
| `at_risk` | Last order 45–89 days ago (regardless of order count) |
| `lost` | Last order ≥ 90 days ago (regardless of order count) |

> **Note:** A customer with 20 orders whose last order was 100 days ago is `lost`. Order history does not soften the recency threshold.

### Segment (richer 5-bucket field)

Layered on top of status, adding machine context and loyalty depth:

```sql
CASE
  WHEN has_machine AND order_count = 1             THEN 'new_machine'
  WHEN order_count >= 8 AND days < 45              THEN 'loyalist'
  WHEN days >= 90                                  THEN 'lapsed'
  WHEN days >= 45                                  THEN 'at_risk'
  ELSE                                                  'active'
END
```

| Segment | What it means |
|---|---|
| `new_machine` | Just bought a machine (1st order ever). Highest priority for capsule conversion outreach. |
| `loyalist` | ≥ 8 orders AND active within 45 days. Best customers. Never discount them. |
| `lapsed` | Last order ≥ 90 days ago. Same as `lost` status but in segment context. |
| `at_risk` | Last order 45–89 days ago. Needs proactive outreach. |
| `active` | Active but not yet loyalist (< 8 orders OR order count not high enough). Growing customers. |

### Status vs Segment

| | Status | Segment |
|---|---|---|
| Priority signal | Recency only | Recency + frequency + machine |
| `new` / `new_machine` | 1st order ever | 1st order + has machine |
| High-value active | `active` | `loyalist` |
| Gone 90d | `lost` | `lapsed` |
| Use for | Basic lifecycle gate | CRM targeting, campaign rules |

---

## 5. Capsule Consumption vs Machine

### The Machine-Capsule Relationship

Meama machines only work with Meama capsules. Every machine purchase should create a recurring capsule buyer. The gap between machine acquisition and first capsule order — and the ongoing capsule purchase rate — are the strongest leading indicators of long-term revenue.

### avg_capsule_packs_per_month

```sql
ROUND(capsule_quantity / active_months, 2)
```

- `capsule_quantity`: total number of capsule units ordered (not orders — units)
- `active_months`: distinct calendar months with any order (not tenure months)

**The ≈2.5/month expectation** is a product guideline, not hardcoded in SQL. Meama's assumption is that an engaged machine owner uses roughly 2.5 packs of capsules per active month. Customers significantly below this (< 1.5) are flagged in the frontend as under-consuming.

NULL if the customer has never had an active month with any order (`active_months = 0`).

### Conversion Status Values

| Value | Meaning | Action |
|---|---|---|
| `no_machine` | No machine, no capsules | Top-of-funnel: sell a machine |
| `capsules_without_machine_purchase` | Buys capsules, no machine purchase found | May have received machine as gift; don't send machine offers |
| `machine_only_no_capsules` | Has machine, never bought capsules | **Silent churn signal** — follow up immediately |
| `machine_then_capsules` | Converted correctly — machine then capsules | Healthy; monitor cadence |
| `unknown` | Machine registered in system but no purchase record | Data gap; treat like capsules_without_machine_purchase |

### Why machine_only_no_capsules Matters

A customer in this state paid for hardware but generates zero recurring revenue. This is Meama's highest-value intervention target. Expected outreach: "Here's a starter pack for your [machine model]" within 7 days of machine purchase.

---

## 6. Filters Available in the API

Defined in `backend/app/routers/portfolios.py`:

| API param | Type | SQL condition | UI label |
|---|---|---|---|
| `status` | string | `status = 'active'` (or `new` / `at_risk` / `lost`) | Lifecycle status |
| `segment` | string | `segment = 'loyalist'` etc. | Segment |
| `region` | string | `region = 'tbilisi'` or `regions` or `unknown` | Region |
| `channel` | string | `channel = 'online'` / `in_store` / `app` / `mixed` | Channel |
| `has_machine` | bool | `has_machine = true` | Has machine |
| `no_machine` | bool | `has_machine = false` | No machine |
| `email_consent` | bool | `accept_marketing_email = true` | Email opt-in |
| `sms_consent` | bool | `sms_marketing = true` | SMS opt-in |
| `any_consent` | bool | `accept_marketing_email = true OR sms_marketing = true` | Any reachable |
| `promo_heavy` | bool | `promo_share >= 0.60` | Discount-led |
| `q` | string | `full_name ILIKE %q% OR email ILIKE %q% OR phone ILIKE %q%` | Search |
| `sort` | string | Column to sort by (see sortable list) | Sort |
| `desc` | bool | Sort direction | — |
| `page` / `page_size` | int | Offset + limit | — |

Sortable columns: `last_order_at`, `total_spend`, `order_count`, `days_since_last_order`, `aov`, `health_score`, `promo_share`.

---

## 7. Churn Reason — All 8 Values

`churn_reason` is evaluated in priority order — the **first matching rule wins**:

```sql
CASE
  WHEN order_count < 2
       THEN 'new_customer'
  WHEN days_since_last_order >= 90
       THEN 'long_recency_gap'
  WHEN promo_orders / order_count >= 0.60
       THEN 'promo_dependent'
  WHEN has_machine AND capsule_quantity = 0
       THEN 'machine_without_capsules'
  WHEN frequency_score <= 8
       THEN 'low_frequency'
  WHEN LENGTH(bought_capsule_categories) = 1
       THEN 'single_category_dependency'
  WHEN days_since_last_order < 45
       THEN 'healthy_active'
  ELSE      'healthy_active'
END
```

| Value | Trigger | Interpretation |
|---|---|---|
| `new_customer` | order_count < 2 | Too little history to assess risk |
| `long_recency_gap` | days ≥ 90 | Already at high risk or lost |
| `promo_dependent` | ≥ 60% of orders used a discount | Margin risk — won't buy without a deal |
| `machine_without_capsules` | Has machine + zero capsule units | Likely to return the machine or permanently churn |
| `low_frequency` | frequency_score ≤ 8 (i.e. < 4 orders) | Hasn't established a repurchase habit yet |
| `single_category_dependency` | Only ever bought from one capsule category | High risk if that category is discontinued or out of stock |
| `healthy_active` | None of the above (or < 45 days since last order) | No identified risk flag |
| `unknown` | (legacy; no longer generated by current SQL) | Old data |

> **Caveat:** Rules 3–6 apply to customers who are NOT already `long_recency_gap`. A promo-dependent customer who is also 95 days inactive gets `long_recency_gap`, not `promo_dependent`.

---

## 8. Known Bugs & Limitations

### Bug 1 — monetary_score Measures Promo Purity, Not Spend

**Impact:** High. The health score's "monetary" component rewards full-price purchasing, not high spending. A high-LTV promo customer is unfairly penalised; a low-LTV full-price customer is unfairly rewarded.

**Fix needed:** Replace with a spend-tier percentile:
```sql
NTILE(5) OVER (ORDER BY total_spend) * 5  AS monetary_score  -- 0/5/10/15/20/25 ranges
```

### Bug 2 — AOV Denominator Includes ₾0 Orders

**Impact:** Medium. AOV is diluted for customers who have orders with ₾0 total (common for full-discount redemptions or data entry errors).

**Fix needed:**
```sql
total_spend / NULLIF(COUNT(*) FILTER (WHERE total > 0), 0)
```

### Bug 3 — Bible Match Rate ≈ 38–50% for Many Customers

**Impact:** Low-medium. `top_flavors`, `favorite_intensity`, and `beverage_type_preference` are NULL or partial for customers whose SKUs don't match the Bible.

**Root cause:** The Bible covers the current active catalog. Historical or regional SKUs, bundle SKUs, and short-format vending aliases (cap37-XX, cap51-XX) are either missing from the Bible or covered only by the 3-tier rewrite rules.

**Mitigation:** Tiers 2 and 3 handle the most common alias patterns. Expanding the Bible to cover historical SKUs would increase the match rate.

### Bug 4 — cap37/cap51 Short SKUs Are Vending Aliases

Short SKUs like `cap37-9` appear in the `meama_georgia_order_items` table for orders that originated as vending sales but were migrated or re-classified. They map to standard Fina Codes via the rewrite rules (Tier 2: `cap37-09 → cap37-109`, Tier 3: `cap51-11 → cap51-1211`). However, if a new short SKU format appears that doesn't match either pattern, it will silently miss the Bible join.

### Bug 5 — channel: App Orders Excluded from 'mixed'

A customer who orders via both `web` and `195189899265` (app) is classified as `online` (web takes precedence), not `mixed`. Mixed only triggers when both `web` and `pos` are present. This may undercount true multi-channel behaviour.

### Bug 6 — NULL Fields for Single-Order Customers

The following fields are always NULL for customers with exactly 1 order:
- `avg_return_interval_days`, `median_return_interval_days` (need ≥ 2 orders for any gap)
- `expected_next_order_date` (needs ≥ 2 orders)
- `expected_return_window_start`, `expected_return_window_end`
- `return_period_label`
- `rfm_label` = `'New / Low history'` (special case, not NULL)

### Bug 7 — tenure_months Uses 30-Day Approximation

`tenure_months = FLOOR(tenure_days / 30)` rather than counting actual calendar months. A customer at 59 days is shown as 1 month, not 2. For display purposes this is acceptable; for cohort analysis requiring exact calendar months, use `active_months` or query `DATE_TRUNC` directly.

### Bug 8 — Matview Is Static Between Refreshes

`portfolio_customers` is a **materialized view** — it is a snapshot, not a live query. It is refreshed nightly at 02:00 Asia/Tbilisi via the GitHub Actions cron (`0 22 * * *` UTC). Between refreshes:
- `days_since_last_order` increases by 1 per day automatically (computed at refresh time)
- New orders placed today are NOT reflected until tomorrow's refresh
- Customers who crossed a status threshold today (e.g. hit 90 days) are still shown under the old status until the next refresh

Manual refresh: `SELECT refresh_portfolio_customers();` in the Supabase SQL Editor.

---

## Quick Reference: Column Index

| Column | Source CTE | NULL if |
|---|---|---|
| `shopify_customer_id` | `customers_georgia` | Never |
| `full_name` | `customers_georgia` | First+last both blank |
| `email` | `customers_georgia` | OTP-email customer |
| `phone` | `customers_georgia` | No phone on file |
| `phone_only` | derived | Never (defaults false) |
| `initials` | derived | Never (defaults "?") |
| `accept_marketing_email` | `customers_georgia` | Never (defaults false) |
| `sms_marketing` | `customers_georgia` | Never (defaults false) |
| `region` | `latest_city` | Never (defaults 'unknown') |
| `order_count` | `cust_agg` | Never |
| `total_spend` | `cust_agg` | Never (defaults 0) |
| `aov` | derived | Never (defaults 0) |
| `first_order_at` | `cust_agg` | Never |
| `last_order_at` | `cust_agg` | Never |
| `days_since_last_order` | derived | Never |
| `customer_since` | derived | Never (falls back to first_order_at) |
| `tenure_days` | derived | Never |
| `tenure_months` | derived | Never |
| `active_months` | `cust_agg` | Never |
| `status` | derived | Never |
| `segment` | derived | Never |
| `health_score` | `rfm_scores` | Never (defaults 0) |
| `recency_score` | `rfm_scores` | If customer missing from rfm_scores |
| `frequency_score` | `rfm_scores` | If customer missing from rfm_scores |
| `monetary_score` | `rfm_scores` | If customer missing from rfm_scores |
| `rfm_label` | derived | Never |
| `has_machine` | `customer_machine` | Never (defaults false) |
| `machine_model` | `customer_machine` | No machine |
| `machine_acquisition_date` | `machine_first` | No machine |
| `machine_to_capsule_conversion_status` | derived | Never |
| `channel` | `cust_agg` | Never |
| `top_product_types` | `top_categories` | No product data |
| `top_item_title` | `top_item` | No product data |
| `capsule_aov` | `capsule_metrics` | No capsule orders |
| `avg_capsule_packs_per_month` | derived | active_months = 0 |
| `expected_next_order_date` | derived | < 2 orders |
| `top_flavors` | `bible_top_flavors_cte` | No Bible match |
| `format_preferences` | `top_formats` | No capsule orders |
| `never_bought_capsules_flag` | derived | Never (defaults true) |
| `favorite_intensity` | `bible_intensity_cte` | No Bible match |
| `intensity_bucket` | derived | No Bible match |
| `avg_capsule_price` | `capsule_metrics` | No capsule orders |
| `capsule_price_range` | `capsule_price_ranked` | No capsule orders |
| `bought_capsule_categories` | `capsule_categories` | No capsule orders |
| `never_bought_capsule_categories` | derived | Never (empty array if all bought) |
| `avg_return_interval_days` | `return_metrics` | < 2 orders |
| `median_return_interval_days` | `return_metrics` | < 2 orders |
| `return_period_label` | derived | < 2 orders |
| `expected_return_window_start` | derived | < 2 orders |
| `expected_return_window_end` | derived | < 2 orders |
| `churn_reason` | derived | Never |
| `recommended_next_machine` | derived | Already has machine |
| `delivery_vs_pickup_preference` | `fulfillment_counts` | Never (defaults 'unknown') |
| `promo_orders` | `cust_agg` | Never |
| `promo_spend` | `cust_agg` | Never |
| `full_price_spend` | `cust_agg` | Never |
| `promo_share` | derived | Never |
| `capital_vs_regional` | derived | Never (defaults 'unknown') |
| `ecommerce_share` | derived | No orders |
| `brand_store_share` | derived | No orders |
| `beverage_type_preference` | `bible_bev_type` | No Bible match |
| `bible_match_rate` | `bible_intensity_cte` | No SKU items |
| `is_registered` | `customers_georgia` | Never |
| `customer_created_at` | `customers_georgia` | Unregistered customers |

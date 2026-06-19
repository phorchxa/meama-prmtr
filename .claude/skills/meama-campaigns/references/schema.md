# Meama Campaigns Schema Reference

## campaigns.promotions

| Column | Type | Description |
|--------|------|-------------|
| id | uuid PK | Auto-generated |
| name | text NOT NULL | Human readable name e.g. "Aroma 30" |
| type | text NOT NULL | `bundle`, `discount`, `gift`, `subscription`, `clearance` |
| discount_type | text | `fixed`, `percentage`, `bogo`, `tiered`, `clearance`, NULL for bundles |
| discount_value | numeric | Amount or % — NULL for tag-only bundles |
| min_order_value | numeric | Fixed bundle price e.g. 99 for "6 boxes 99₾" |
| applicable_skus | text[] | SKU restriction array — not yet populated |
| excluded_segments | text[] | `['capsule_loyalist','flavor_explorer']` for all discounts |
| shopify_code | text UNIQUE | Exact Shopify discount code OR prefix for auto-generated |
| valid_from | timestamptz | Campaign start — NULL for always-on |
| valid_to | timestamptz | Campaign end — NULL for always-on |
| created_at | timestamptz | Auto |
| tag_pattern | text | Shopify tag string for ILIKE match — NULL for code-only promos |

---

## campaigns.campaigns

| Column | Type | Description |
|--------|------|-------------|
| id | uuid PK | Auto-generated |
| promotion_id | uuid FK | → promotions.id |
| name | text NOT NULL | e.g. "Aroma 30 — Win-back Email April 2025" |
| channel | text NOT NULL | `email`, `sms`, `pos`, `ecommerce`, `paid` |
| status | text | `draft`, `pending_approval`, `active`, `completed`, `rejected` |
| origin | text | `ai` (suggestion engine) or `manual` (historical backfill) |
| target_segment | text | ML segment name e.g. `capsule_loyalist` |
| target_lifecycle | text | `new`, `active`, `at_risk`, `lapsed`, `lost` |
| target_filters | jsonb | Additional targeting filters |
| audience_size | integer | How many customers in the send |
| predicted_revenue | numeric | AI pre-launch estimate |
| predicted_roi | numeric | AI pre-launch estimate |
| predicted_margin | numeric | AI pre-launch estimate |
| fatigue_risk | text | `low`, `medium`, `high` |
| predicted_uplift | numeric | Expected lift vs. baseline |
| subject_line | text | Email subject |
| body_copy | text | Email/SMS body |
| cta_text | text | Call to action button text |
| scheduled_at | timestamptz | When to fire |
| launched_at | timestamptz | When it actually fired |
| completed_at | timestamptz | When attribution window closed |
| submitted_for_approval_at | timestamptz | When manager review was requested |
| reviewed_by | text | Manager name |
| reviewed_at | timestamptz | When manager acted |
| rejection_reason | text | If rejected |

---

## campaigns.campaign_orders

| Column | Type | Description |
|--------|------|-------------|
| id | uuid PK | Auto-generated |
| campaign_id | uuid FK | → campaigns.id |
| shopify_order_id | bigint FK | → public.meama_georgia_orders |
| customer_id | bigint | NULL if customer not in customers_georgia |
| attributed_revenue | numeric | = order.total |
| attribution_window | integer | 0 = direct, N = days after campaign send |
| created_at | timestamptz | Order created_at (not insert time) |

**Note**: No unique constraint on shopify_order_id — one order can appear
in multiple campaign_orders if it matched multiple promotions.

---

## campaigns.campaign_audience

| Column | Type | Description |
|--------|------|-------------|
| id | uuid PK | Auto-generated |
| campaign_id | uuid FK | → campaigns.id |
| customer_id | bigint FK | → customers_georgia.shopify_customer_id |
| sent_at | timestamptz | When message was sent (NULL for historical) |
| opened_at | timestamptz | When email was opened |
| clicked_at | timestamptz | When CTA was clicked |
| converted_at | timestamptz | When order was placed |
| unsubscribed | boolean | Whether customer unsubscribed |

**Historical note**: For backfilled campaigns, sent_at/opened_at/clicked_at
are NULL. Only converted_at is populated from order data.

---

## campaigns.campaign_results

| Column | Type | Description |
|--------|------|-------------|
| campaign_id | uuid PK FK | → campaigns.id |
| reached | integer | Audience size (from campaign_audience COUNT) |
| opened | integer | Email opens (NULL for historical) |
| clicked | integer | Email clicks (NULL for historical) |
| converted | integer | Orders placed |
| conversion_rate | numeric | converted / reached * 100 |
| revenue_total | numeric | Sum of attributed_revenue |
| revenue_capsules | numeric | Capsule-only revenue (not yet calculated) |
| avg_order_value | numeric | Average order total |
| discount_given | numeric | Sum of discount_amount from orders |
| gross_margin | numeric | Not yet calculated — needs COGS data |
| roi | numeric | (revenue - discount) / discount * 100 |
| lapsed_reactivated | integer | Not yet calculated |
| new_customers | integer | Not yet calculated |
| revenue_variance | numeric | actual - predicted revenue (for ML feedback) |
| roi_variance | numeric | actual - predicted ROI (for ML feedback) |
| feedback_notes | text | Manual notes |
| ml_feedback_sent | boolean | Whether feedback was sent to model |
| measured_at | timestamptz | Last time metrics were calculated |

---

## campaigns.campaign_ai_log

| Column | Type | Description |
|--------|------|-------------|
| id | uuid PK | Auto-generated |
| campaign_id | uuid FK | → campaigns.id (nullable — pre-campaign logs) |
| step | text NOT NULL | LangGraph node name e.g. `segment_node`, `predict_node` |
| model_version | text | Claude model used e.g. `claude-sonnet-4-6` |
| input_features | jsonb | What was fed to the model |
| output | jsonb | What the model returned |
| created_at | timestamptz | Auto |

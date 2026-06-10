-- ============================================================
-- MEAMA PRMTR — 0003 dev seed (tiny synthetic data for local dev)
-- Synthetic only — no real PII. Safe to re-run (ON CONFLICT DO NOTHING).
-- Insert order respects FKs: products -> customers -> orders -> order_items.
-- ============================================================

-- ---- products ----
insert into products (sku, name, category, subcategory, intensity, format, price, cogs, compatible_machine_models) values
    ('MCH-001', 'Meama Machine One',        'machine',   null,        null,    null,  299.00, 150.00, array['M1']),
    ('CAP-CLS-01', 'Classic Espresso 51mm', 'capsule',   'classic',   'medium','51mm',  29.00,  10.00, array['M1']),
    ('CAP-FLV-01', 'Vanilla Flavoured 51mm','capsule',   'flavoured', 'light', '51mm',  31.00,  11.00, array['M1']),
    ('CAP-ORG-01', 'Ethiopia Origin 37mm',  'capsule',   'origin',    'strong','37mm',  34.00,  12.00, array['M1']),
    ('ACC-CUP-01', 'Ceramic Cup Set',       'accessory', null,        null,    null,    49.00,  18.00, null)
on conflict (sku) do nothing;

-- ---- inventory ----
insert into inventory (sku, units_on_hand) values
    ('MCH-001', 40),
    ('CAP-CLS-01', 320),
    ('CAP-FLV-01', 12),     -- low stock candidate
    ('CAP-ORG-01', 200),
    ('ACC-CUP-01', 75)
on conflict (sku) do nothing;

-- ---- customers (deterministic UUIDs so re-runs are stable) ----
insert into customers (id, shopify_customer_id, email, first_name, last_name, phone, region, is_registered, registration_date) values
    ('11111111-1111-1111-1111-111111111111', 'shop_c_001', 'nino@example.test',  'Nino',  'Beridze',   '+995555000001', 'tbilisi', true,  '2024-01-15'),
    ('22222222-2222-2222-2222-222222222222', 'shop_c_002', 'giorgi@example.test','Giorgi','Kapanadze',  '+995555000002', 'regions', true,  '2024-03-02'),
    ('33333333-3333-3333-3333-333333333333', 'shop_c_003', 'mariam@example.test','Mariam','Tsiklauri',  '+995555000003', 'tbilisi', false, null)
on conflict (shopify_customer_id) do nothing;

-- ---- orders (mix of retail + one non-retail to exercise channel filtering) ----
insert into orders (id, shopify_order_id, customer_id, channel, status, total_price, discount_amount, promo_code, delivery_type, region, ordered_at) values
    ('aaaaaaa1-0000-0000-0000-000000000001', 'shop_o_001', '11111111-1111-1111-1111-111111111111', 'ecom',        'fulfilled', 87.00,  0.00,  null,      'delivery', 'tbilisi', now() - interval '5 days'),
    ('aaaaaaa1-0000-0000-0000-000000000002', 'shop_o_002', '22222222-2222-2222-2222-222222222222', 'brand_store', 'fulfilled', 299.00, 0.00,  null,      'pickup',   'regions', now() - interval '60 days'),
    ('aaaaaaa1-0000-0000-0000-000000000003', 'shop_o_003', '11111111-1111-1111-1111-111111111111', 'ecom',        'fulfilled', 62.00,  6.00,  'WELCOME', 'delivery', 'tbilisi', now() - interval '2 days'),
    ('aaaaaaa1-0000-0000-0000-000000000004', 'shop_o_004', null,                                   'vending',     'fulfilled', 5.00,   0.00,  null,      null,       'tbilisi', now() - interval '1 day')
on conflict (shopify_order_id) do nothing;

-- ---- order_items ----
insert into order_items (order_id, sku, quantity, unit_price, discount) values
    ('aaaaaaa1-0000-0000-0000-000000000001', 'CAP-CLS-01', 3, 29.00, 0.00),
    ('aaaaaaa1-0000-0000-0000-000000000002', 'MCH-001',    1, 299.00, 0.00),
    ('aaaaaaa1-0000-0000-0000-000000000003', 'CAP-FLV-01', 2, 31.00, 6.00),
    ('aaaaaaa1-0000-0000-0000-000000000004', 'CAP-CLS-01', 1, 5.00,  0.00);

-- ---- customer_metrics (rule-based + Claude-output fields populated for demo) ----
insert into customer_metrics
    (customer_id, recency_score, frequency_score, monetary_score, rfm_segment, cluster_tag,
     churn_score, upsell_tag, status, ltv, aov_total, aov_capsules, discount_dependency_pct,
     has_machine, machine_model, last_order_date, expected_next_order) values
    ('11111111-1111-1111-1111-111111111111', 5, 4, 3, 'champion',         'capsule_loyalist', 0.120, true,  'active',  149.00, 74.50, 74.50, 7.50,  false, null, current_date - 2, current_date + 12),
    ('22222222-2222-2222-2222-222222222222', 2, 1, 5, 'big_spender',      'machine_owner',    0.680, true,  'at_risk', 299.00, 299.00, null, 0.00,  true,  'M1', current_date - 60, current_date + 5),
    ('33333333-3333-3333-3333-333333333333', 1, 1, 1, 'new',              'browser',          0.300, false, 'new',     0.00,   0.00,  null, 0.00,  false, null, null, null)
on conflict (customer_id) do nothing;

-- ---- campaigns + meta_insights ----
insert into campaigns (id, name, type, target_segment, channel, discount_pct, status, predicted_reach, predicted_revenue, approval_status) values
    ('cccccccc-0000-0000-0000-000000000001', 'Spring Capsule Refill', 'reorder', 'capsule_loyalist', 'telegram', 0.1000, 'draft', 500, 12000.00, 'pending')
on conflict do nothing;

insert into meta_insights (campaign_id, date, spend_usd, impressions, clicks, roas) values
    ('cccccccc-0000-0000-0000-000000000001', current_date - 1, 120.00, 45000, 900, 1.80)  -- roas < 2.0 -> alert candidate
on conflict (campaign_id, date) do nothing;

-- ---- alerts + actions ----
insert into alerts (type, severity, entity_id, message, status) values
    ('low_roas', 'high', 'cccccccc-0000-0000-0000-000000000001', 'ROAS 1.80 below threshold 2.0', 'open'),
    ('low_stock','high', 'CAP-FLV-01', 'Vanilla Flavoured 51mm below low-stock threshold', 'open');

insert into actions (priority, action_type, customer_or_segment, trigger_signal, suggested_offer, estimated_revenue_impact, status) values
    (1, 'winback', '22222222-2222-2222-2222-222222222222', 'at_risk + churn_score 0.68', 'early access to new origin capsule', 250.00, 'pending'),
    (3, 'reorder_nudge', 'capsule_loyalist', 'expected_next_order approaching', 'reminder via telegram', 800.00, 'pending');

-- ---- sync_log ----
insert into sync_log (source, status, records_in) values
    ('seed', 'success', 0);

-- Insert 5 active promotions confirmed from Shopify discounts CSV export
-- All use auto-generated per-customer codes → prefix match via ILIKE (p.shopify_code || '-%')

INSERT INTO campaigns.promotions (name, type, discount_type, shopify_code, valid_from, status, source_app)
VALUES
  ('Buy 3 Any Boxes Get 4th Free',     'gift',   'fixed', '3PLUS1',                   '2022-07-04 00:00:00+04', 'active', 'shopify_discount'),
  ('Buy 2kg Bean Coffee Get 1kg Free', 'gift',   'fixed', 'beansbund-18062026',        '2026-06-18 00:00:00+04', 'active', 'shopify_discount'),
  ('New Customer Multi Bundle',        'bundle', 'fixed', 'newcust-multibundle-18062026', '2026-06-18 00:00:00+04', 'active', 'shopify_discount'),
  ('New Customer Versatile Bundle',    'bundle', 'fixed', 'newcust-versbun-18062026',  '2026-06-18 00:00:00+04', 'active', 'shopify_discount'),
  ('5 Capsules + 1 Cup Bundle',        'bundle', 'fixed', '5cap1cupp',                '2022-07-04 00:00:00+04', 'active', 'shopify_discount')
ON CONFLICT (shopify_code) DO NOTHING;

-- Create a campaign row for each new promotion (status = active, origin = manual)
INSERT INTO campaigns.campaigns (promotion_id, name, channel, status, origin, launched_at)
SELECT
  p.id,
  p.name || ' — Ecommerce',
  'ecommerce',
  'active',
  'manual',
  NOW()
FROM campaigns.promotions p
WHERE p.shopify_code IN (
  '3PLUS1', 'beansbund-18062026', 'newcust-multibundle-18062026',
  'newcust-versbun-18062026', '5cap1cupp'
)
AND NOT EXISTS (
  SELECT 1 FROM campaigns.campaigns c WHERE c.promotion_id = p.id
);

-- Backfill promotion_id on shopify_discounts for the new promotions
UPDATE campaigns.shopify_discounts sd
SET promotion_id = p.id
FROM campaigns.promotions p
WHERE p.shopify_code IN (
  '3PLUS1', 'beansbund-18062026', 'newcust-multibundle-18062026',
  'newcust-versbun-18062026', '5cap1cupp'
)
AND sd.promotion_id IS NULL
AND sd.code ILIKE (p.shopify_code || '-%');

-- Fix expired valid_to on two Versatile promos that are actually still running
UPDATE campaigns.promotions
SET valid_to = NULL, status = 'active'
WHERE name IN ('Versatile + 5 Boxes 799₾', 'Vers Boxes 799₾ Code');

-- Mark their campaign rows active too
UPDATE campaigns.campaigns c
SET status = 'active', launched_at = COALESCE(launched_at, NOW())
FROM campaigns.promotions p
WHERE c.promotion_id = p.id
  AND p.name IN ('Versatile + 5 Boxes 799₾', 'Vers Boxes 799₾ Code');

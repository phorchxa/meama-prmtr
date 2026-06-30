-- 0032 — Catalogue promotions discovered from the custom.promotion_name metafield.
-- These values appeared on paid orders but had no matching campaigns.promotions row,
-- leaving ~45% of promo-tagged orders unattributed. Adding them takes coverage to ~100%.
-- discount_value for the % codes (NEXT37/LAST23/CAPS30) is inferred from the code name —
-- verify against Shopify if exact figures matter for ROI.

-- Code-style values (matched via shopify_code, incl. auto-generated "<code>-XXXX" prefixes).
INSERT INTO campaigns.promotions (name, type, discount_type, discount_value, shopify_code, excluded_segments)
VALUES
  ('Mix 1 (code)',  'bundle', NULL, NULL, 'mix1',  NULL),
  ('Mix 4 (code)',  'bundle', NULL, NULL, 'mix4',  NULL),
  ('Mix 6 (code)',  'bundle', NULL, NULL, 'mix6',  NULL),
  ('Mix 8 (code)',  'bundle', NULL, NULL, 'mix8',  NULL),
  ('Mix 40 (code)', 'bundle', NULL, NULL, 'mix40', NULL),
  ('Versatile + 5 Capsule 450₾ (code)', 'bundle', NULL, NULL, 'vers2cap450', NULL),
  ('Caps 30%',      'discount', 'percentage', 30, 'CAPS30', ARRAY['capsule_loyalist','flavor_explorer']),
  ('Next 37%',      'discount', 'percentage', 37, 'NEXT37', ARRAY['capsule_loyalist','flavor_explorer']),
  ('Last 23%',      'discount', 'percentage', 23, 'LAST23', ARRAY['capsule_loyalist','flavor_explorer']),
  ('Meama Corner',  'discount', NULL, NULL, 'MEAMACORNER', ARRAY['capsule_loyalist','flavor_explorer'])
ON CONFLICT (shopify_code) DO NOTHING;

-- Descriptive values (matched via exact tag_pattern). Case variants collapse here
-- because attribution lowercases both sides.
INSERT INTO campaigns.promotions (name, type, min_order_value, tag_pattern)
VALUES
  ('Buy 3 Get 1 (3+1)',                 'gift',   NULL, '3+1'),
  ('1kg Coffee 2+1',                    'gift',   NULL, '1kg 2+1'),
  ('Beans 2+1',                         'gift',   NULL, 'beans 2+1'),
  ('7 European Capsules 70₾',           'bundle', 70,   '7 European Capsules for 70 Gel'),
  ('6 Multi Capsules 72₾',              'bundle', 72,   '6 Multi Capsules for 72 Gel'),
  ('6 Multi Capsule + 1 Cup 84₾',       'bundle', 84,   '6 Multi Capsule + 1 Cup For 84Gel'),
  ('7 European Capsules + 1 Cup 84₾',   'bundle', 84,   '7 European Capsules + 1 Cup For 84 Gel'),
  ('6 Metal Cups 119₾',                 'bundle', 119,  '6 metal Cups for 119Gel'),
  ('5 Multi Capsule + 2 Metal Cup 99₾', 'bundle', 99,   '5 Multi Capsule + 2 metal cup 99gel'),
  ('Starter Kit Versatile',             'bundle', NULL, 'starter kit versatile'),
  ('Multicapsule Starter Kit',          'bundle', NULL, 'Multicapsule starter kit'),
  ('Versatile + EU Box + Multi Box',    'bundle', NULL, 'Versatile & European variety box & Multicapsule Variety box'),
  ('Versatile + 2 Capsule',             'bundle', NULL, 'versatile + 2 capsule'),
  ('Versatile + 2 Box 349₾',            'bundle', 349,  'Versatile + 2 Box - 349GEL'),
  ('Versatile + 2 Box + Cup + Holder',  'bundle', NULL, 'Versatile + 2 box (12 capsules) + cup + holder'),
  ('Capuchinator + Metal Cup 85₾ (KA)', 'bundle', 85,   'კაპუჩინატორი + მეტალის ჭიქა 85 ლარი'),
  ('Versatile + Capuchinator 399₾',     'bundle', 399,  'ვერსეტაილი + კაპუჩინატორი = 399₾');

-- Give every promotion without a campaign an execution row (idempotent).
-- Status 'completed' (not 'active'): these are catalogue/attribution records
-- discovered from order data, matching the convention used for all other
-- historical promotions. 'active' is reserved for the hand-curated running set.
INSERT INTO campaigns.campaigns (promotion_id, name, channel, status, origin)
SELECT p.id, p.name || ' — Campaign', 'ecommerce', 'completed', 'manual'
FROM campaigns.promotions p
LEFT JOIN campaigns.campaigns c ON c.promotion_id = p.id
WHERE c.id IS NULL;

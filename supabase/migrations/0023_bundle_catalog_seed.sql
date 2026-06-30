-- Make shopify_product_id optional for manually-entered bundles
ALTER TABLE campaigns.bundle_catalog
  ALTER COLUMN shopify_product_id DROP NOT NULL;

-- Clear any false positives from the API sync attempt
DELETE FROM campaigns.bundle_catalog;

-- ── Simple Bundles & Kits (56 total, 5 active) ───────────────────────────────
INSERT INTO campaigns.bundle_catalog (title, bundle_app, status, price) VALUES
  -- ACTIVE (live on store right now)
  ('5 capsule + 1 cup',         'simple_bundles', 'active',  75),
  ('beans 2+1',                  'simple_bundles', 'active', 120),
  ('multicapsule starter kit',   'simple_bundles', 'active', 199),
  ('starter kit versatile',      'simple_bundles', 'active', 399),
  ('veratile + 5 capsule =450gel','simple_bundles','active', 450),

  -- DRAFT (not live)
  ('14packet - 79gel',                                         'simple_bundles', 'draft',  79),
  ('250 ml coffee can and 2 mini cups for 39 gel',             'simple_bundles', 'draft',  39),
  ('3+1',                                                      'simple_bundles', 'draft',  45),
  ('3+1 ტყის თხილი',                                           'simple_bundles', 'draft',  48),
  ('3 american Capsules & Holder For 59 gel',                  'simple_bundles', 'draft',  59),
  ('3beans - 89gel',                                           'simple_bundles', 'draft',  89),
  ('3 European Capsules & Holder For 49 gel',                  'simple_bundles', 'draft',  49),
  ('3 sachets and 1 Metal Cup for 39 Gel',                     'simple_bundles', 'draft',  39),
  ('4 european Capsules & 5 american capsule For 99 gel',      'simple_bundles', 'draft',  99),
  ('5 Bags and 1 metal Cup for 35 Gel',                        'simple_bundles', 'draft',  35),
  ('5 Bags and 1 metal Cup for 39 Gel',                        'simple_bundles', 'draft',  39),
  ('5 Bags and 2 mini cups for 49 gel',                        'simple_bundles', 'draft',  49),
  ('5 Capsules & 2 Candles For 67 gel',                        'simple_bundles', 'draft',  67),
  ('5 Capsules & Holder For 67 gel',                           'simple_bundles', 'draft',  67),
  ('5 European Capsules + 2 metal Cup For 89 Gel',             'simple_bundles', 'draft',  89),
  ('5 Multi Capsule + 2 metal cup 99gel',                      'simple_bundles', 'draft',  99),
  ('5 sachets and 2 mini cups for 49 gel',                     'simple_bundles', 'draft',  49),
  ('6 metal Cups for 119Gel',                                  'simple_bundles', 'draft', 119),
  ('6 metal Cups for 99 Gel',                                  'simple_bundles', 'draft',  99),
  ('6 Multi Capsule + 1 Cup For 115 Gel',                      'simple_bundles', 'draft',  99),
  ('6 Multi Capsule + 1 Cup For 84Gel',                        'simple_bundles', 'draft',  84),
  ('6 Multi Capsules for 72 Gel',                              'simple_bundles', 'draft',  72),
  ('6 Multi Capsules for 99 GEL',                              'simple_bundles', 'draft',  99),
  ('6 Tea Boxes + Metal Cup - 89 Gel',                         'simple_bundles', 'draft',  89),
  ('7 European Capsules + 1 Cup For 84 Gel',                   'simple_bundles', 'draft',  84),
  ('7 European Capsules for 70 Gel',                           'simple_bundles', 'draft',  70),
  ('7 European Capsules for 99GEL',                            'simple_bundles', 'draft',  99),
  ('all-versatile+5scapsule-202606',                           'simple_bundles', 'draft', 400),
  ('American Machine & Cup and 1 US capsule',                  'simple_bundles', 'draft', 179),
  ('American Machine & Holder and 1 US capsule',               'simple_bundles', 'draft', 179),
  ('Cappucinator + 2 Mini Cup',                                'simple_bundles', 'draft',  79),
  ('European Machine & Cup and 1 Eu capsule',                  'simple_bundles', 'draft', 279),
  ('European Machine & Holder and 1 Eu capsule',               'simple_bundles', 'draft', 279),
  ('Machine Eu + 100 Capsule + Holder',                        'simple_bundles', 'draft', 159),
  ('Multi Machine + 5 Box - for 399 GEL',                      'simple_bundles', 'draft', 399),
  ('versatile + 2 capsule',                                    'simple_bundles', 'draft', 399),
  ('Versatile + 5 Box - 349GEL',                               'simple_bundles', 'draft', 450),
  ('Versatile + 5 Box - 799GEL (A)',                           'simple_bundles', 'draft', 799),
  ('Versatile + 5 Box - 799GEL (B)',                           'simple_bundles', 'draft', 799),
  ('Versatile + 5 Box - 799GEL.',                              'simple_bundles', 'draft', 799),
  ('Versatile & Cup and 1 capsule',                            'simple_bundles', 'draft', 379),
  ('Versatile & Cup and 2 capsule & Holder',                   'simple_bundles', 'draft', 349),
  ('Versatile & European variety box & Multicapsule Variety box','simple_bundles','draft',349),
  ('Versatile & Holder and 1 capsule',                         'simple_bundles', 'draft', 379),
  ('ესპრესო აპარატის ნაკრები',                                 'simple_bundles', 'draft', 400),
  ('ვერსეტაილი + კაპუჩინატორი = 399₾',                        'simple_bundles', 'draft', 399),
  ('ვერსეტაილის ნაკრები',                                      'simple_bundles', 'draft', 800),
  ('თანამშრომლის აპარატი + 4 კოლოფი მულტი კაფსულა',          'simple_bundles', 'draft', 250),
  ('თანამშრომლის ევროპული აპარატი + 4 კოლოფი',               'simple_bundles', 'draft', 250),
  ('კაპუჩინატორი + მეტალის ჭიქა 85 ლარი',                     'simple_bundles', 'draft',  85),
  ('მულტიკაფსულების აპარატის ნაკრები',                        'simple_bundles', 'draft', 400);

-- ── Easy Bundle Builder (from app screenshot 2026-06-22) ─────────────────────
INSERT INTO campaigns.bundle_catalog (title, bundle_app, status) VALUES
  ('ინყიდე მეტი - დაზოგე მეტი',              'easy_bundle', 'active'),
  ('MEAMA Outlet',                              'easy_bundle', 'active'),
  ('Multicapsule Machine + 5 Boxes - 399 Gel', 'easy_bundle', 'active'),
  ('Versatile + 5 Boxes 799₾',                 'easy_bundle', 'active'),
  ('Versatile + 2 box (12 capsules) + cup + holder', 'easy_bundle', 'active'),
  ('3+ Boxes + Cup',                            'easy_bundle', 'inactive'),
  ('3+ Boxes + Holder',                         'easy_bundle', 'inactive'),
  ('6 Multicapsule Boxes - 99Gel',              'easy_bundle', 'inactive'),
  ('7 Espresso Boxes - 99Gel',                  'easy_bundle', 'inactive'),
  ('Milk Frother + 5 Multicapsule Boxes - 149 Gel', 'easy_bundle', 'inactive'),
  ('Milk Frother + 2 Espresso Boxes',           'easy_bundle', 'inactive'),
  ('Healthy Line & Metal Cup - 1',              'easy_bundle', 'inactive');

-- ── Wiz: Checkout Upsell ─────────────────────────────────────────────────────
-- Add Wiz Mix & Match and Pre-curated Bundles here once list is available

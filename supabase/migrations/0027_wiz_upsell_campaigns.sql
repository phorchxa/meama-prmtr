-- Add missing "capuchinator" Wiz entry to bundle_catalog
-- and create promotion+campaign rows for the Wiz checkout upsell.
-- Source: Wiz app screenshot 2026-06-24 (ID: vol2=81405)

-- 1. Add capuchinator (was missing from migration 0024)
INSERT INTO campaigns.bundle_catalog (title, bundle_app, status)
SELECT 'capuchinator', 'wiz', 'inactive'
WHERE NOT EXISTS (
  SELECT 1 FROM campaigns.bundle_catalog WHERE title = 'capuchinator' AND bundle_app = 'wiz'
);

-- 2. Ensure ჭიქები vol2 is active (was already seeded; this is idempotent)
UPDATE campaigns.bundle_catalog
SET status = 'active'
WHERE title = 'ჭიქები - ჩექაუთი vol2' AND bundle_app = 'wiz';

-- 3. Add promotion rows for Wiz upsells; only vol2 is currently enabled.
INSERT INTO campaigns.promotions (name, type, discount_type, tag_pattern, valid_from, status, source_app)
SELECT name, type, discount_type, tag_pattern, valid_from, status, source_app
FROM (VALUES
  ('Capuchinator Checkout Upsell', 'bundle', 'fixed', 'capuchinator', '2024-01-01 00:00:00+04', 'inactive', 'wiz'),
  ('Checkout Cups Upsell vol2',    'bundle', 'fixed', NULL,           '2024-01-01 00:00:00+04', 'active', 'wiz')
) AS v(name, type, discount_type, tag_pattern, valid_from, status, source_app)
WHERE NOT EXISTS (
  SELECT 1 FROM campaigns.promotions p WHERE p.name = v.name
);

-- 4. Add campaign row for the enabled promotion.
INSERT INTO campaigns.campaigns (promotion_id, name, channel, status, origin, launched_at)
SELECT
  p.id,
  p.name || ' — Ecommerce',
  'ecommerce',
  'active',
  'manual',
  NOW()
FROM campaigns.promotions p
WHERE p.name IN ('Checkout Cups Upsell vol2')
AND NOT EXISTS (
  SELECT 1 FROM campaigns.campaigns c WHERE c.promotion_id = p.id
);

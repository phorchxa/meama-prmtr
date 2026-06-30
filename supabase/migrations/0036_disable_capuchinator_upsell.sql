-- 0036 — Keep only checkout upsell vol2 active.
--
-- Current Wiz state:
--   Success / Enabled / Checkout page / Upsell / 81405 = ჭიქები - ჩექაუთი vol2
-- Capuchinator checkout upsell is no longer enabled and should not appear as an
-- active campaign.

UPDATE campaigns.bundle_catalog
SET status = 'inactive'
WHERE bundle_app = 'wiz'
  AND title = 'capuchinator';

UPDATE campaigns.bundle_catalog
SET status = 'active'
WHERE bundle_app = 'wiz'
  AND title = 'ჭიქები - ჩექაუთი vol2';

UPDATE campaigns.promotions
SET status = 'inactive'
WHERE source_app = 'wiz'
  AND name = 'Capuchinator Checkout Upsell';

UPDATE campaigns.promotions
SET status = 'active'
WHERE source_app = 'wiz'
  AND name = 'Checkout Cups Upsell vol2';

UPDATE campaigns.promotions
SET tag_pattern = NULL
WHERE source_app = 'wiz'
  AND name = 'Checkout Cups Upsell vol2';

UPDATE campaigns.campaigns c
SET status = 'completed'
FROM campaigns.promotions p
WHERE c.promotion_id = p.id
  AND p.source_app = 'wiz'
  AND p.name = 'Capuchinator Checkout Upsell';

UPDATE campaigns.campaigns c
SET status = 'active'
FROM campaigns.promotions p
WHERE c.promotion_id = p.id
  AND p.source_app = 'wiz'
  AND p.name = 'Checkout Cups Upsell vol2';

SELECT cron.unschedule('attribute-capuchinator-upsell')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'attribute-capuchinator-upsell'
);

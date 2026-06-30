-- Add status + source_app to promotions
ALTER TABLE campaigns.promotions
  ADD COLUMN IF NOT EXISTS status     text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS source_app text;

-- status values: 'active' | 'inactive' | 'archived'
-- source_app values: 'shopify_discount' | 'simple_bundles' | 'easy_bundle' | 'manual'

-- Link shopify_discounts → promotions
ALTER TABLE campaigns.shopify_discounts
  ADD COLUMN IF NOT EXISTS promotion_id uuid REFERENCES campaigns.promotions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS data_source  text NOT NULL DEFAULT 'webhook';

-- data_source values: 'webhook' | 'csv_backfill'

CREATE INDEX IF NOT EXISTS shopify_discounts_promotion_id_idx
  ON campaigns.shopify_discounts (promotion_id);

-- Backfill promotion_id: exact match first, then prefix match
UPDATE campaigns.shopify_discounts sd
SET promotion_id = p.id
FROM campaigns.promotions p
WHERE p.shopify_code IS NOT NULL
  AND sd.code = p.shopify_code;

UPDATE campaigns.shopify_discounts sd
SET promotion_id = p.id
FROM campaigns.promotions p
WHERE p.shopify_code IS NOT NULL
  AND sd.promotion_id IS NULL
  AND sd.code ILIKE (p.shopify_code || '-%');

-- Mark CSV-backfill rows (synthetic shopify_id has bit 62 set: > 4611686018427387904)
UPDATE campaigns.shopify_discounts
SET data_source = 'csv_backfill'
WHERE shopify_id > 4611686018427387904;

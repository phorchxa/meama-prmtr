-- Add promotion + campaign row for "6 ნალექიანი + Metal Cup" bundle.
-- This Easy Bundle Builder product is live on the Meama website (6th active offer)
-- but had no promotions/campaigns row — only a bundle_catalog entry.
-- Attribution path: tag-based (Easy Bundle tags orders with the bundle title).

INSERT INTO campaigns.promotions (
  name, type, discount_type, tag_pattern, valid_from, status, source_app
)
SELECT
  '6 ნალექიანი + Metal Cup Bundle',
  'bundle',
  'fixed',
  'ნალექიანი',
  '2024-01-01 00:00:00+04',
  'active',
  'easy_bundle'
WHERE NOT EXISTS (
  SELECT 1 FROM campaigns.promotions WHERE name = '6 ნალექიანი + Metal Cup Bundle'
);

INSERT INTO campaigns.campaigns (promotion_id, name, channel, status, origin, launched_at)
SELECT
  p.id,
  '6 ნალექიანი + Metal Cup — Ecommerce',
  'ecommerce',
  'active',
  'manual',
  NOW()
FROM campaigns.promotions p
WHERE p.name = '6 ნალექიანი + Metal Cup Bundle'
AND NOT EXISTS (
  SELECT 1 FROM campaigns.campaigns c WHERE c.promotion_id = p.id
);

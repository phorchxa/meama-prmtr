-- Historical Easy Bundle campaigns were imported with status = 'active' because that was their
-- bundle status at ETL time, not because they are confirmed currently running.
-- Set all "— Historical" campaigns to 'completed' so they don't pollute the ACTIVE count.

UPDATE campaigns.campaigns
SET status = 'completed'
WHERE name LIKE '%— Historical%'
  AND status = 'active';

-- Re-activate the 5 confirmed currently-running Shopify discount campaigns (from migration 0021).
UPDATE campaigns.campaigns c
SET status = 'active'
FROM campaigns.promotions p
WHERE c.promotion_id = p.id
  AND p.shopify_code IN (
    '3PLUS1',
    'beansbund-18062026',
    'newcust-multibundle-18062026',
    'newcust-versbun-18062026',
    '5cap1cupp'
  );

-- Re-activate the 2 Versatile bundles that were confirmed live (valid_to cleared in migration 0021).
UPDATE campaigns.campaigns c
SET status = 'active'
FROM campaigns.promotions p
WHERE c.promotion_id = p.id
  AND p.name IN ('Versatile + 5 Boxes 799₾', 'Vers Boxes 799₾ Code');

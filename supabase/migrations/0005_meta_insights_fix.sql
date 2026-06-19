-- 0005_meta_insights_fix.sql
-- Allow meta_insights rows without a Meama campaign link (Meta campaigns
-- don't always map 1:1 to Meama promotions). Store Meta's own campaign ID
-- and name so we can link later via UTM/pixel attribution.

ALTER TABLE campaigns.meta_insights
  ALTER COLUMN campaign_id DROP NOT NULL;

ALTER TABLE campaigns.meta_insights
  ADD COLUMN IF NOT EXISTS meta_campaign_id   TEXT,
  ADD COLUMN IF NOT EXISTS meta_campaign_name TEXT,
  ADD COLUMN IF NOT EXISTS meta_account_id    TEXT;

-- Replace the (campaign_id, date) unique key with (meta_campaign_id, date)
-- so rows are deduped by the actual Meta campaign, not by our FK.
ALTER TABLE campaigns.meta_insights
  DROP CONSTRAINT IF EXISTS meta_insights_campaign_id_date_key;

ALTER TABLE campaigns.meta_insights
  ADD CONSTRAINT meta_insights_meta_campaign_date_key
  UNIQUE (meta_campaign_id, date);

CREATE INDEX IF NOT EXISTS idx_meta_insights_meta_campaign
  ON campaigns.meta_insights (meta_campaign_id);

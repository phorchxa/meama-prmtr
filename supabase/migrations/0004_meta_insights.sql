-- 0004_meta_insights.sql
-- Daily Meta ad spend per campaign. All amounts in USD (never GEL).
-- ROAS is Meta-reported (Meta pixel attribution, dimensionless ratio).

CREATE TABLE IF NOT EXISTS campaigns.meta_insights (
  id            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id   uuid          NOT NULL REFERENCES campaigns.campaigns(id) ON DELETE CASCADE,
  date          date          NOT NULL,
  spend_usd     numeric(14,2) NOT NULL DEFAULT 0,
  impressions   bigint        NOT NULL DEFAULT 0,
  clicks        bigint        NOT NULL DEFAULT 0,
  roas          numeric(10,4),           -- Meta-reported, NULL until Meta API is live
  synced_at     timestamptz   NOT NULL DEFAULT now(),
  UNIQUE(campaign_id, date)
);

CREATE INDEX IF NOT EXISTS idx_meta_insights_campaign ON campaigns.meta_insights (campaign_id);
CREATE INDEX IF NOT EXISTS idx_meta_insights_date     ON campaigns.meta_insights (date);

-- RLS: read for authenticated, write for service role only
ALTER TABLE campaigns.meta_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "meta_insights_read"
  ON campaigns.meta_insights FOR SELECT
  USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');

CREATE POLICY "meta_insights_write"
  ON campaigns.meta_insights FOR ALL
  USING (auth.role() = 'service_role');

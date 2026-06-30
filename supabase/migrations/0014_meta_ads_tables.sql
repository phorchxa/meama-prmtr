-- ============================================================
-- 0014 · Meta Ads tables
-- meta_ad_accounts, meta_campaigns, meta_ad_sets, meta_ads,
-- meta_insights, meta_sync_log
-- All amounts in USD (Meta billing currency).
-- ============================================================

CREATE TABLE IF NOT EXISTS meta_ad_accounts (
    account_id   TEXT PRIMARY KEY,
    account_name TEXT,
    currency     TEXT DEFAULT 'USD',
    timezone     TEXT DEFAULT 'Asia/Tbilisi',
    status       TEXT,
    updated_at   TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS meta_campaigns (
    campaign_id      TEXT PRIMARY KEY,
    account_id       TEXT REFERENCES meta_ad_accounts(account_id),
    name             TEXT,
    objective        TEXT,
    status           TEXT,
    buying_type      TEXT,
    daily_budget     NUMERIC,
    lifetime_budget  NUMERIC,
    start_time       TIMESTAMPTZ,
    stop_time        TIMESTAMPTZ,
    created_time     TIMESTAMPTZ,
    updated_time     TIMESTAMPTZ,
    updated_at       TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS meta_ad_sets (
    ad_set_id          TEXT PRIMARY KEY,
    campaign_id        TEXT REFERENCES meta_campaigns(campaign_id),
    account_id         TEXT REFERENCES meta_ad_accounts(account_id),
    name               TEXT,
    status             TEXT,
    optimization_goal  TEXT,
    billing_event      TEXT,
    bid_amount         NUMERIC,
    daily_budget       NUMERIC,
    lifetime_budget    NUMERIC,
    targeting_summary  JSONB,
    start_time         TIMESTAMPTZ,
    end_time           TIMESTAMPTZ,
    created_time       TIMESTAMPTZ,
    updated_time       TIMESTAMPTZ,
    updated_at         TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS meta_ads (
    ad_id          TEXT PRIMARY KEY,
    ad_set_id      TEXT REFERENCES meta_ad_sets(ad_set_id),
    campaign_id    TEXT REFERENCES meta_campaigns(campaign_id),
    account_id     TEXT REFERENCES meta_ad_accounts(account_id),
    name           TEXT,
    status         TEXT,
    creative_id    TEXT,
    creative_name  TEXT,
    creative_type  TEXT,
    preview_url    TEXT,
    created_time   TIMESTAMPTZ,
    updated_time   TIMESTAMPTZ,
    updated_at     TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS meta_insights (
    id                    BIGSERIAL PRIMARY KEY,
    object_type           TEXT NOT NULL,  -- 'campaign' | 'ad_set' | 'ad'
    object_id             TEXT NOT NULL,
    account_id            TEXT,
    date_start            DATE NOT NULL,
    date_stop             DATE NOT NULL,
    spend                 NUMERIC DEFAULT 0,
    impressions           BIGINT  DEFAULT 0,
    reach                 BIGINT  DEFAULT 0,
    frequency             NUMERIC,
    clicks                BIGINT  DEFAULT 0,
    unique_clicks         BIGINT  DEFAULT 0,
    ctr                   NUMERIC,
    cpc                   NUMERIC,
    cpm                   NUMERIC,
    purchases             INT     DEFAULT 0,
    purchase_value        NUMERIC DEFAULT 0,
    roas                  NUMERIC,
    age_gender_breakdown  JSONB,
    region_breakdown      JSONB,
    synced_at             TIMESTAMPTZ DEFAULT now(),
    UNIQUE (object_type, object_id, date_start)
);

CREATE TABLE IF NOT EXISTS meta_sync_log (
    id               BIGSERIAL PRIMARY KEY,
    account_id       TEXT,
    sync_type        TEXT,
    status           TEXT,
    records_fetched  INT DEFAULT 0,
    error_message    TEXT,
    started_at       TIMESTAMPTZ,
    finished_at      TIMESTAMPTZ DEFAULT now()
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_meta_insights_date      ON meta_insights(date_start);
CREATE INDEX IF NOT EXISTS idx_meta_insights_object    ON meta_insights(object_type, object_id);
CREATE INDEX IF NOT EXISTS idx_meta_campaigns_account  ON meta_campaigns(account_id);
CREATE INDEX IF NOT EXISTS idx_meta_ad_sets_campaign   ON meta_ad_sets(campaign_id);
CREATE INDEX IF NOT EXISTS idx_meta_ads_ad_set         ON meta_ads(ad_set_id);

-- RLS
ALTER TABLE meta_ad_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE meta_campaigns    ENABLE ROW LEVEL SECURITY;
ALTER TABLE meta_ad_sets      ENABLE ROW LEVEL SECURITY;
ALTER TABLE meta_ads          ENABLE ROW LEVEL SECURITY;
ALTER TABLE meta_insights     ENABLE ROW LEVEL SECURITY;
ALTER TABLE meta_sync_log     ENABLE ROW LEVEL SECURITY;

-- Read access: admin + analyst + marketing
CREATE POLICY "meta_read" ON meta_ad_accounts FOR SELECT TO authenticated USING (true);
CREATE POLICY "meta_read" ON meta_campaigns    FOR SELECT TO authenticated USING (true);
CREATE POLICY "meta_read" ON meta_ad_sets      FOR SELECT TO authenticated USING (true);
CREATE POLICY "meta_read" ON meta_ads          FOR SELECT TO authenticated USING (true);
CREATE POLICY "meta_read" ON meta_insights     FOR SELECT TO authenticated USING (true);
CREATE POLICY "meta_read" ON meta_sync_log     FOR SELECT TO authenticated USING (true);

-- Write access: service role only (sync script uses service role key)
CREATE POLICY "meta_write" ON meta_ad_accounts FOR ALL TO service_role USING (true);
CREATE POLICY "meta_write" ON meta_campaigns    FOR ALL TO service_role USING (true);
CREATE POLICY "meta_write" ON meta_ad_sets      FOR ALL TO service_role USING (true);
CREATE POLICY "meta_write" ON meta_ads          FOR ALL TO service_role USING (true);
CREATE POLICY "meta_write" ON meta_insights     FOR ALL TO service_role USING (true);
CREATE POLICY "meta_write" ON meta_sync_log     FOR ALL TO service_role USING (true);

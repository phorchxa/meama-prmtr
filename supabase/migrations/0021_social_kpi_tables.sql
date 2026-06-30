-- ============================================================
-- 0021 · Social media KPI tables (organic, not paid ads)
-- TikTok: tiktok_profile_stats, tiktok_follower_growth, tiktok_video_stats
-- Instagram: meta_ig_insights, meta_ig_posts
-- Facebook: meta_page_insights (page token pending — stays empty)
-- Feeds the /marketing/kpis dashboard. Paid-ads tables live in 0014.
-- ============================================================

-- ── TikTok ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tiktok_profile_stats (
    account_id       TEXT NOT NULL,
    date             DATE NOT NULL,
    display_name     TEXT,
    followers_count  INTEGER DEFAULT 0,
    following_count  INTEGER DEFAULT 0,
    video_count      INTEGER DEFAULT 0,
    total_likes      BIGINT  DEFAULT 0,
    synced_at        TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (account_id, date)
);

CREATE TABLE IF NOT EXISTS tiktok_follower_growth (
    account_id       TEXT NOT NULL,
    date             DATE NOT NULL,
    followers_count  INTEGER DEFAULT 0,
    followers_delta  INTEGER DEFAULT 0,
    new_followers    INTEGER DEFAULT 0,
    lost_followers   INTEGER DEFAULT 0,
    net_change       INTEGER DEFAULT 0,
    synced_at        TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (account_id, date)
);

CREATE TABLE IF NOT EXISTS tiktok_video_stats (
    video_id         TEXT PRIMARY KEY,
    account_id       TEXT,
    date             DATE,
    title            TEXT,
    description      TEXT,
    cover_image_url  TEXT,
    video_url        TEXT,
    duration         INTEGER,
    published_at     TIMESTAMPTZ,
    view_count       BIGINT  DEFAULT 0,
    like_count       BIGINT  DEFAULT 0,
    comment_count    BIGINT  DEFAULT 0,
    share_count      BIGINT  DEFAULT 0,
    download_count   BIGINT  DEFAULT 0,
    reach            BIGINT  DEFAULT 0,
    engagement_rate  NUMERIC,
    synced_at        TIMESTAMPTZ DEFAULT now()
);

-- ── Instagram ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS meta_ig_insights (
    ig_account_id    TEXT NOT NULL,
    date             DATE NOT NULL,
    ig_username      TEXT,
    page_id          TEXT,
    total_followers  INTEGER DEFAULT 0,
    reach            BIGINT  DEFAULT 0,
    synced_at        TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (ig_account_id, date)
);

CREATE TABLE IF NOT EXISTS meta_ig_posts (
    media_id         TEXT PRIMARY KEY,
    ig_account_id    TEXT,
    media_type       TEXT,  -- IMAGE | VIDEO | CAROUSEL_ALBUM | REELS
    permalink        TEXT,
    thumbnail_url    TEXT,
    caption          TEXT,
    timestamp        TIMESTAMPTZ,
    likes            BIGINT  DEFAULT 0,
    comments         BIGINT  DEFAULT 0,
    saves            BIGINT  DEFAULT 0,
    shares           BIGINT  DEFAULT 0,
    reach            BIGINT  DEFAULT 0,
    impressions      BIGINT  DEFAULT 0,
    plays            BIGINT  DEFAULT 0,
    engagement_rate  NUMERIC,
    synced_at        TIMESTAMPTZ DEFAULT now()
);

-- ── Facebook (token pending — table created, left empty) ─────
CREATE TABLE IF NOT EXISTS meta_page_insights (
    page_id          TEXT NOT NULL,
    date             DATE NOT NULL,
    page_name        TEXT,
    fan_count        INTEGER DEFAULT 0,
    reach            BIGINT  DEFAULT 0,
    impressions      BIGINT  DEFAULT 0,
    engagements      BIGINT  DEFAULT 0,
    synced_at        TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (page_id, date)
);

-- Indexes for common query patterns (date-ranged scans)
CREATE INDEX IF NOT EXISTS idx_tt_video_published ON tiktok_video_stats(published_at);
CREATE INDEX IF NOT EXISTS idx_tt_growth_date     ON tiktok_follower_growth(date);
CREATE INDEX IF NOT EXISTS idx_ig_insights_date   ON meta_ig_insights(date);
CREATE INDEX IF NOT EXISTS idx_ig_posts_ts        ON meta_ig_posts(timestamp);

-- ── RLS (mirror the 0014 meta-ads pattern) ───────────────────
ALTER TABLE tiktok_profile_stats   ENABLE ROW LEVEL SECURITY;
ALTER TABLE tiktok_follower_growth ENABLE ROW LEVEL SECURITY;
ALTER TABLE tiktok_video_stats     ENABLE ROW LEVEL SECURITY;
ALTER TABLE meta_ig_insights       ENABLE ROW LEVEL SECURITY;
ALTER TABLE meta_ig_posts          ENABLE ROW LEVEL SECURITY;
ALTER TABLE meta_page_insights     ENABLE ROW LEVEL SECURITY;

-- Read: any authenticated user (social metrics are not financial)
CREATE POLICY "social_read" ON tiktok_profile_stats   FOR SELECT TO authenticated USING (true);
CREATE POLICY "social_read" ON tiktok_follower_growth FOR SELECT TO authenticated USING (true);
CREATE POLICY "social_read" ON tiktok_video_stats     FOR SELECT TO authenticated USING (true);
CREATE POLICY "social_read" ON meta_ig_insights       FOR SELECT TO authenticated USING (true);
CREATE POLICY "social_read" ON meta_ig_posts          FOR SELECT TO authenticated USING (true);
CREATE POLICY "social_read" ON meta_page_insights     FOR SELECT TO authenticated USING (true);

-- Write: service role only (sync scripts use the service-role key)
CREATE POLICY "social_write" ON tiktok_profile_stats   FOR ALL TO service_role USING (true);
CREATE POLICY "social_write" ON tiktok_follower_growth FOR ALL TO service_role USING (true);
CREATE POLICY "social_write" ON tiktok_video_stats     FOR ALL TO service_role USING (true);
CREATE POLICY "social_write" ON meta_ig_insights       FOR ALL TO service_role USING (true);
CREATE POLICY "social_write" ON meta_ig_posts          FOR ALL TO service_role USING (true);
CREATE POLICY "social_write" ON meta_page_insights     FOR ALL TO service_role USING (true);

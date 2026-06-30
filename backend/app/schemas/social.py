"""Pydantic v2 schemas for the /social content-browser endpoints.

Covers: TikTok video grid + analytics, Meta IG post grid + account trends,
Meta Ads structure browser (performance data intentionally absent — meta_insights
table is empty as of 2026-06-30).
"""
from __future__ import annotations

from pydantic import BaseModel, ConfigDict


# ── shared ────────────────────────────────────────────────────────────────────

class AiReport(BaseModel):
    report: str
    generated_at: str
    cached: bool


# ── TikTok ────────────────────────────────────────────────────────────────────

class TikTokVideoSnap(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    video_id: str
    title: str | None = None
    description: str | None = None
    cover_image_url: str | None = None
    video_url: str | None = None
    duration: int | None = None
    published_at: str | None = None
    view_count: int = 0
    like_count: int = 0
    comment_count: int = 0
    share_count: int = 0
    download_count: int = 0
    # reach is always 0 from Sandbox API — not returned, shown as "–"
    engagement_rate: float | None = None
    snapshot_date: str | None = None
    hashtags: list[str] = []
    snapshot_count: int = 1  # how many snapshots exist for the sparkline note


class TikTokSnapshotPoint(BaseModel):
    date: str
    view_count: int
    like_count: int


class TikTokVideoHistory(BaseModel):
    video_id: str
    snapshots: list[TikTokSnapshotPoint]


class FollowerGrowthPoint(BaseModel):
    date: str
    followers_count: int


class HashtagCount(BaseModel):
    hashtag: str
    count: int


class TikTokOverview(BaseModel):
    total_videos: int = 0
    total_views: int = 0
    total_likes: int = 0
    total_comments: int = 0
    total_shares: int = 0
    avg_engagement_rate: float | None = None
    followers_count: int | None = None
    follower_growth_trend: list[FollowerGrowthPoint] = []
    top_5_by_views: list[TikTokVideoSnap] = []
    top_5_by_engagement: list[TikTokVideoSnap] = []
    top_hashtags: list[HashtagCount] = []


class TikTokVideosResponse(BaseModel):
    videos: list[TikTokVideoSnap]
    total: int


# ── Meta Instagram ────────────────────────────────────────────────────────────

class MetaIgPost(BaseModel):
    media_id: str
    media_type: str
    permalink: str | None = None
    thumbnail_url: str | None = None  # VIDEO posts only; IMAGE/CAROUSEL have none
    caption: str | None = None
    timestamp: str | None = None
    likes: int = 0
    comments: int = 0
    # reach, impressions, plays, video_views, engagement_rate intentionally absent.
    # TODO: wire these into the response once the sync backfills them — columns exist
    # in meta_ig_posts but are 0/null for all 820 rows as of 2026-06-30.


class MetaIgInsightPoint(BaseModel):
    date: str
    total_followers: int | None = None
    reach: int | None = None
    accounts_engaged: int | None = None
    total_interactions: int | None = None


class MetaTypeStat(BaseModel):
    media_type: str
    post_count: int
    avg_likes: float
    avg_comments: float


class MetaOverview(BaseModel):
    total_posts: int = 0
    total_likes: int = 0
    total_comments: int = 0
    by_media_type: list[MetaTypeStat] = []
    top_5_by_likes: list[MetaIgPost] = []
    current_followers: int | None = None
    followers_delta: int | None = None
    insights_trend: list[MetaIgInsightPoint] = []


class MetaPostsResponse(BaseModel):
    posts: list[MetaIgPost]
    total: int


# ── Meta Ads (structure only — meta_insights is empty) ───────────────────────

class MetaCampaignBrief(BaseModel):
    campaign_id: str
    name: str | None = None
    objective: str | None = None
    status: str | None = None
    daily_budget: float | None = None
    lifetime_budget: float | None = None
    has_performance_data: bool = False
    ad_sets_count: int = 0


class MetaAdSetBrief(BaseModel):
    ad_set_id: str
    campaign_id: str
    name: str | None = None
    status: str | None = None
    daily_budget: float | None = None
    optimization_goal: str | None = None
    has_performance_data: bool = False
    ads_count: int = 0


class MetaCampaignsResponse(BaseModel):
    campaigns: list[MetaCampaignBrief]
    total_campaigns: int = 0
    total_ad_sets: int = 0
    total_ads: int = 0
    performance_data_available: bool = False

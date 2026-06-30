"""Pydantic v2 schemas for the Social KPI overview endpoint."""
from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, ConfigDict


class MetricStatus(str, Enum):
    ok                   = "ok"
    insufficient_history = "insufficient_history"
    not_available        = "not_available"   # API / scope limitation (field always null/zero)
    not_connected        = "not_connected"   # no sync pipeline exists
    no_data              = "no_data"         # table/period returned no rows


class Metric(BaseModel):
    model_config = ConfigDict(use_enum_values=True)

    value: float | None = None
    status: MetricStatus = MetricStatus.ok
    note: str | None = None


# ── TikTok ────────────────────────────────────────────────────────────────────

class TikTokKpis(BaseModel):
    model_config = ConfigDict(use_enum_values=True)

    available: bool
    # primary
    follower_growth_rate: Metric   # insufficient_history until ≥14 days accumulate
    # secondary
    followers_total: Metric
    engagement_rate: Metric        # AVG(engagement_rate) from tiktok_video_stats
    reach: Metric                  # not_available — always 0 in Sandbox API
    share_rate: Metric             # AVG(share_count / view_count) × 100 (%)
    fyp_rate: Metric               # not_available — no field in TikTok API response
    cadence_weekly: list[int]      # video count per 7d bucket, last 6 weeks
    cadence_per_week: float | None


# ── Instagram ─────────────────────────────────────────────────────────────────

class InstagramKpis(BaseModel):
    model_config = ConfigDict(use_enum_values=True)

    available: bool
    # primary
    follower_growth_rate: Metric   # (latest-earliest)/earliest from meta_ig_insights
    # secondary
    followers_total: Metric        # meta_ig_insights.total_followers latest
    engagement_rate: Metric        # AVG((likes+comments+saves+shares)/reach) from meta_ig_posts
    reach_30d: Metric              # SUM(reach) from meta_ig_posts for period
    impressions_30d: Metric        # SUM(impressions) from meta_ig_posts for period
    saves_per_post: Metric         # AVG(saves) from meta_ig_posts
    reels_plays: Metric            # SUM(plays) from meta_ig_posts WHERE media_type = VIDEO/REEL
    cadence_weekly: list[int]
    cadence_per_week: float | None


# ── Facebook (not connected — table has 0 rows) ───────────────────────────────

class FacebookKpis(BaseModel):
    model_config = ConfigDict(use_enum_values=True)

    available: bool = False
    status: MetricStatus = MetricStatus.not_connected
    # TODO: build a Facebook Page Insights sync Edge Function (mirror tiktok-sync pattern)
    # to populate meta_page_insights — table exists but has zero rows.
    note: str = (
        "meta_page_insights has zero rows — Facebook Page Insights sync pipeline "
        "not yet implemented. A Meta Page Insights Edge Function needs to be built "
        "(mirror the tiktok-sync pattern) before this card can show real data."
    )


# ── Placeholder platforms (no data source in schema at all) ──────────────────

class PlaceholderPlatform(BaseModel):
    model_config = ConfigDict(use_enum_values=True)

    available: bool = False
    status: MetricStatus = MetricStatus.not_connected
    note: str = ""


# ── Root response ─────────────────────────────────────────────────────────────

class SocialKpisResponse(BaseModel):
    model_config = ConfigDict(use_enum_values=True)

    tiktok: TikTokKpis
    instagram: InstagramKpis
    facebook: FacebookKpis
    meama_corner: PlaceholderPlatform
    x_twitter: PlaceholderPlatform
    period_days: int
    generated_at: str

"""Social content browser — TikTok video grid + Meta IG posts + Meta Ads structure.

All endpoints under /api/v1/social.
Visible to: admin, analyst, marketing (no financial data).

Caching strategy: in-memory dict, TTL 5 min for list data, 24 h for AI reports
(same pattern as social_kpis router). AI reports are keyed by platform + lang.
"""
from __future__ import annotations

import time
from typing import Any

from fastapi import APIRouter, Depends, Query, Response

from ..config import get_settings
from ..deps import get_supabase
from ..schemas.social import (
    AiReport,
    MetaCampaignsResponse,
    MetaOverview,
    MetaPostsResponse,
    TikTokOverview,
    TikTokVideoHistory,
    TikTokVideosResponse,
)
from ..services.social import (
    get_meta_ai_report,
    get_meta_campaigns,
    get_meta_overview,
    get_meta_posts,
    get_tiktok_ai_report,
    get_tiktok_overview,
    get_tiktok_video_history,
    get_tiktok_videos,
)

router = APIRouter(prefix="/social", tags=["social"])

_CACHE_TTL = 300  # 5 min for list data

# Separate cache dicts to avoid cross-endpoint collisions
_tt_videos_cache: dict[str, Any] = {}
_tt_overview_cache: dict[str, Any] = {}
_meta_overview_cache: dict[str, Any] = {}
_meta_posts_cache: dict[str, Any] = {}
_meta_campaigns_cache: dict[str, Any] = {}

# AI report caches — keyed by "tiktok_en", "tiktok_ka", "meta_en", "meta_ka"
# Stored in services via passed-in dict (24h TTL handled there)
_ai_cache: dict[str, Any] = {}


def _cached(cache: dict, key: str, ttl: float, builder):
    entry = cache.get(key)
    if entry and (time.time() - entry["ts"]) < ttl:
        return entry["data"], True
    data = builder()
    cache[key] = {"ts": time.time(), "data": data}
    return data, False


def _set_cache_header(response: Response | None) -> None:
    if response:
        response.headers["Cache-Control"] = "s-maxage=300, stale-while-revalidate=60"


# ── TikTok ────────────────────────────────────────────────────────────────────

@router.get("/tiktok/overview", response_model=TikTokOverview)
async def tiktok_overview(sb=Depends(get_supabase), response: Response = None):
    """Aggregated TikTok analytics: totals, top videos, top hashtags, follower trend."""
    data, _ = _cached(_tt_overview_cache, "default", _CACHE_TTL,
                      lambda: get_tiktok_overview(sb))
    _set_cache_header(response)
    return data


@router.get("/tiktok/videos", response_model=TikTokVideosResponse)
async def tiktok_videos(sb=Depends(get_supabase), response: Response = None):
    """One card per distinct video_id using its latest snapshot, sorted by views desc."""
    data, _ = _cached(_tt_videos_cache, "default", _CACHE_TTL,
                      lambda: get_tiktok_videos(sb))
    _set_cache_header(response)
    return data


@router.get("/tiktok/video/{video_id}/history", response_model=TikTokVideoHistory)
async def tiktok_video_history(video_id: str, sb=Depends(get_supabase)):
    """All snapshots for one video (used for sparkline), oldest → newest."""
    return get_tiktok_video_history(sb, video_id)


@router.get("/tiktok/ai-report", response_model=AiReport)
async def tiktok_ai_report(
    lang: str = Query(default="en", regex="^(en|ka)$"),
    refresh: bool = Query(default=False),
    sb=Depends(get_supabase),
):
    """Cached Claude analysis of TikTok organic performance. Regenerates once daily or on ?refresh=true."""
    settings = get_settings()
    if refresh:
        key = f"tiktok_{lang}"
        _ai_cache.pop(key, None)
    return get_tiktok_ai_report(sb, lang, _ai_cache, settings)


# ── Meta Instagram ────────────────────────────────────────────────────────────

@router.get("/meta/overview", response_model=MetaOverview)
async def meta_overview(sb=Depends(get_supabase), response: Response = None):
    """IG account-level overview: follower trend (meta_ig_insights) + post aggregates."""
    data, _ = _cached(_meta_overview_cache, "default", _CACHE_TTL,
                      lambda: get_meta_overview(sb))
    _set_cache_header(response)
    return data


@router.get("/meta/posts", response_model=MetaPostsResponse)
async def meta_posts(
    limit: int = Query(default=60, ge=10, le=200),
    sb=Depends(get_supabase),
    response: Response = None,
):
    """IG posts grid, most recent first. Shows: media_type, likes, comments.
    Does NOT return reach/impressions/plays/video_views — 0/820 rows populated."""
    data, _ = _cached(_meta_posts_cache, str(limit), _CACHE_TTL,
                      lambda: get_meta_posts(sb, limit))
    _set_cache_header(response)
    return data


@router.get("/meta/campaigns", response_model=MetaCampaignsResponse)
async def meta_campaigns(sb=Depends(get_supabase), response: Response = None):
    """Campaign/ad-set/ad structure browser.
    performance_data_available is always False — meta_insights table is empty (0 rows)."""
    data, _ = _cached(_meta_campaigns_cache, "default", _CACHE_TTL,
                      lambda: get_meta_campaigns(sb))
    _set_cache_header(response)
    return data


@router.get("/meta/ai-report", response_model=AiReport)
async def meta_ai_report(
    lang: str = Query(default="en", regex="^(en|ka)$"),
    refresh: bool = Query(default=False),
    sb=Depends(get_supabase),
):
    """Cached Claude analysis of Instagram organic performance. Regenerates once daily or on ?refresh=true."""
    settings = get_settings()
    if refresh:
        key = f"meta_{lang}"
        _ai_cache.pop(key, None)
    return get_meta_ai_report(sb, lang, _ai_cache, settings)

"""Marketing · Social media KPIs — organic TikTok / Instagram / Facebook.

All metrics are computed server-side from the social tables (migration 0021) and
returned as a single JSON payload for the /marketing/kpis dashboard. Paid-ads
metrics live in the campaigns/ads routers — this router is organic-only.

Time math is done in Asia/Tbilisi (GMT+4) per platform conventions. Every metric
degrades gracefully: missing tables/rows yield `None` (rendered as "–"), never an
error. Counts/sums default to 0 so an empty table reads as "0", not a crash.
"""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Response

from ..deps import get_supabase
from ..services.cache import SWRCache

router = APIRouter(prefix="/marketing", tags=["marketing"])

TBILISI = ZoneInfo("Asia/Tbilisi")
WINDOW_DAYS = 30
CADENCE_WEEKS = 6

_CACHE_TTL = 300  # "fresh" cutoff — social stats sync at most daily; stale
# entries are served instantly and refreshed in the background (SWRCache)
_cache: SWRCache[dict] = SWRCache(ttl=_CACHE_TTL)


# ── small coercion / math helpers ───────────────────────────────────────────
def _f(v) -> float:
    try:
        return float(v) if v is not None else 0.0
    except (TypeError, ValueError):
        return 0.0


def _i(v) -> int:
    try:
        return int(v) if v is not None else 0
    except (TypeError, ValueError):
        return 0


def _parse_dt(s) -> datetime | None:
    """Parse an ISO timestamp (Supabase style) into a tz-aware Tbilisi datetime."""
    if not s:
        return None
    try:
        dt = datetime.fromisoformat(str(s).replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=TBILISI)
        return dt.astimezone(TBILISI)
    except (TypeError, ValueError):
        return None


def _growth_pct(latest: float, oldest: float) -> float | None:
    """Percent change oldest → latest; None when no baseline to compare against."""
    if oldest <= 0:
        return None
    return round((latest - oldest) / oldest * 100, 2)


def _weekly_buckets(stamps: list[datetime], now: datetime, weeks: int = CADENCE_WEEKS) -> list[int]:
    """Count timestamps into `weeks` rolling 7-day buckets ending at `now`.

    Returned oldest → newest so it plots left-to-right as a bar chart.
    """
    buckets = [0] * weeks
    for ts in stamps:
        days_ago = (now - ts).total_seconds() / 86400.0
        idx = int(days_ago // 7)
        if 0 <= idx < weeks:
            buckets[weeks - 1 - idx] += 1
    return buckets


def _select(sb, table: str, columns: str, order: str | None = None, desc: bool = False) -> list[dict]:
    """Fetch a table's rows, swallowing missing-table / connection errors → []."""
    try:
        q = sb.table(table).select(columns)
        if order:
            q = q.order(order, desc=desc)
        return q.execute().data or []
    except Exception:
        return []


# ── platform builders ────────────────────────────────────────────────────────
def _tiktok(sb, now: datetime) -> dict[str, Any]:
    cutoff = now - timedelta(days=WINDOW_DAYS)

    profile = _select(sb, "tiktok_profile_stats", "date, display_name, followers_count, "
                      "following_count, video_count, total_likes", order="date", desc=True)
    growth = _select(sb, "tiktok_follower_growth", "date, followers_count", order="date")
    videos = _select(sb, "tiktok_video_stats",
                     "published_at, view_count, share_count, engagement_rate")

    snap = profile[0] if profile else {}
    followers_total = _i(snap.get("followers_count")) if profile else None

    # Follower Growth Rate ★ — oldest vs latest in the growth series
    growth_pct = None
    if len(growth) >= 2:
        growth_pct = _growth_pct(_f(growth[-1].get("followers_count")),
                                 _f(growth[0].get("followers_count")))

    # Engagement Rate — mean of per-video engagement_rate
    ers = [_f(v.get("engagement_rate")) for v in videos if v.get("engagement_rate") is not None]
    engagement_rate = round(sum(ers) / len(ers), 2) if ers else None

    # Reach / Impressions — sum of views on videos published in the last 30d
    reach_30d = sum(
        _i(v.get("view_count"))
        for v in videos
        if (pub := _parse_dt(v.get("published_at"))) and pub >= cutoff
    ) if videos else None

    # Share Rate — mean of share/view across videos with views
    share_ratios = [
        _f(v.get("share_count")) / _f(v.get("view_count")) * 100
        for v in videos
        if _f(v.get("view_count")) > 0
    ]
    share_rate = round(sum(share_ratios) / len(share_ratios), 2) if share_ratios else None

    # Content Cadence — videos per week over the last 6 weeks
    pub_stamps = [d for v in videos if (d := _parse_dt(v.get("published_at")))]
    cadence = _weekly_buckets(pub_stamps, now)
    cadence_per_week = round(sum(cadence) / CADENCE_WEEKS, 1) if videos else None

    return {
        "available": bool(profile or growth or videos),
        "followers_total": followers_total,
        "follower_growth_pct": growth_pct,
        "engagement_rate": engagement_rate,
        "reach_30d": reach_30d,
        "share_rate": share_rate,
        "completion_rate": None,  # not in DB
        "fyp_rate": None,         # not in DB
        "cadence_weekly": cadence,
        "cadence_per_week": cadence_per_week,
    }


def _instagram(sb, now: datetime) -> dict[str, Any]:
    cutoff = now - timedelta(days=WINDOW_DAYS)

    insights = _select(sb, "meta_ig_insights", "date, total_followers, reach", order="date")
    posts = _select(sb, "meta_ig_posts", "media_type, timestamp, likes, saves")

    followers_total = _i(insights[-1].get("total_followers")) if insights else None

    # Follower Growth Rate ★
    growth_pct = None
    if len(insights) >= 2:
        growth_pct = _growth_pct(_f(insights[-1].get("total_followers")),
                                 _f(insights[0].get("total_followers")))

    # Reach / Impressions — sum of daily reach + daily sparkline
    reach_30d = sum(_i(r.get("reach")) for r in insights) if insights else None
    reach_trend = [_i(r.get("reach")) for r in insights]

    # Engagement Rate — mean of likes / (followers/100) over posts in the window
    recent = [p for p in posts if (ts := _parse_dt(p.get("timestamp"))) and ts >= cutoff]
    engagement_rate = None
    if recent and followers_total and followers_total > 0:
        per = followers_total / 100.0
        engagement_rate = round(sum(_f(p.get("likes")) / per for p in recent) / len(recent), 2)

    # Reels Plays — plays unavailable, so count video posts in the window instead
    reels_count = sum(1 for p in recent if (p.get("media_type") or "").upper() in ("VIDEO", "REELS"))

    # Saves per Post — saves are 0 in the API; None signals "N/A" on the card
    saves_vals = [_i(p.get("saves")) for p in recent]
    saves_per_post = round(sum(saves_vals) / len(saves_vals), 1) if sum(saves_vals) > 0 else None

    # Content Cadence — posts per week over the last 6 weeks
    post_stamps = [d for p in posts if (d := _parse_dt(p.get("timestamp")))]
    cadence = _weekly_buckets(post_stamps, now)
    cadence_per_week = round(sum(cadence) / CADENCE_WEEKS, 1) if posts else None

    return {
        "available": bool(insights or posts),
        "followers_total": followers_total,
        "follower_growth_pct": growth_pct,
        "engagement_rate": engagement_rate,
        "reach_30d": reach_30d,
        "reach_trend": reach_trend,
        "saves_per_post": saves_per_post,
        "reels_count_30d": reels_count if recent else None,
        "cadence_weekly": cadence,
        "cadence_per_week": cadence_per_week,
        "story_completion": None,  # not in DB
    }


def _facebook(sb, now: datetime) -> dict[str, Any]:
    rows = _select(sb, "meta_page_insights",
                   "date, fan_count, reach, impressions, engagements",
                   order="date")
    _fb_null: dict[str, Any] = {
        "available": False,
        "followers_total": None, "follower_growth_pct": None,
        "organic_reach_30d": None, "impressions_30d": None,
        "engagement_rate": None, "reach_trend": [],
        "video_views_3s": None, "post_count_30d": None,
    }
    if not rows:
        return _fb_null

    followers_total = _i(rows[-1].get("fan_count")) if rows else None

    # Follower Growth Rate ★ — oldest vs latest fan_count
    growth_pct = None
    if len(rows) >= 2:
        growth_pct = _growth_pct(_f(rows[-1].get("fan_count")),
                                 _f(rows[0].get("fan_count")))

    # 30-day window metrics
    cutoff = now - timedelta(days=30)
    window = [r for r in rows if (d := _parse_dt(str(r.get("date")))) and d >= cutoff]

    organic_reach_30d = sum(_i(r.get("reach")) for r in window) if window else None
    impressions_30d = sum(_i(r.get("impressions")) for r in window) if window else None

    total_reach = sum(_i(r.get("reach")) for r in window)
    total_eng = sum(_i(r.get("engagements")) for r in window)
    engagement_rate = round(total_eng / total_reach * 100, 2) if total_reach > 0 else None

    reach_trend = [_i(r.get("reach")) for r in rows[-30:]]

    return {
        "available": True,
        "followers_total": followers_total,
        "follower_growth_pct": growth_pct,
        "organic_reach_30d": organic_reach_30d,
        "impressions_30d": impressions_30d,
        "engagement_rate": engagement_rate,
        "reach_trend": reach_trend,
        # fields in spec not yet in schema — null is rendered as "–" on the card
        "video_views_3s": None,
        "post_count_30d": None,
    }


async def _build_social_kpis(sb) -> dict:
    now = datetime.now(TBILISI)
    return {
        "tiktok": _tiktok(sb, now),
        "instagram": _instagram(sb, now),
        "facebook": _facebook(sb, now),
        "generated_at": now.isoformat(),
    }


@router.get("/social-kpis")
async def get_social_kpis(sb=Depends(get_supabase), response: Response = None):
    """All organic social KPIs (TikTok + Instagram + Facebook) in one payload."""
    data = await _cache.get("default", lambda: _build_social_kpis(sb))
    if response:
        response.headers["Cache-Control"] = "s-maxage=300, stale-while-revalidate=60"
    return data

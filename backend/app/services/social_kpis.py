"""Social KPI computation service.

Queries Supabase for organic TikTok + Instagram metrics and assembles
the SocialKpisResponse payload. Computation logic lives here; the router
only handles caching and HTTP concerns.

Data reality notes (verified June 2026):
- tiktok_follower_growth has only 2 rows (June 25 & 29) — not enough for monthly rate.
- tiktok_video_stats.reach / download_count are 0 for all 219 rows (Sandbox API tier).
- meta_ig_insights only has total_followers + reach populated (other 8 cols are NULL).
- meta_ig_posts is the authoritative source for engagement/saves/reels metrics.
- meta_page_insights has zero rows — Facebook placeholder only.
"""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from ..schemas.social_kpis import (
    FacebookKpis,
    InstagramKpis,
    Metric,
    MetricStatus,
    PlaceholderPlatform,
    SocialKpisResponse,
    TikTokKpis,
)

TBILISI = ZoneInfo("Asia/Tbilisi")
CADENCE_WEEKS = 6
# Need ≥14 days of follower_growth snapshots for a meaningful monthly rate estimate
MIN_GROWTH_ROWS = 14


# ── low-level helpers ─────────────────────────────────────────────────────────

def _f(v: Any) -> float:
    try:
        return float(v) if v is not None else 0.0
    except (TypeError, ValueError):
        return 0.0


def _i(v: Any) -> int:
    try:
        return int(v) if v is not None else 0
    except (TypeError, ValueError):
        return 0


def _parse_dt(s: Any) -> datetime | None:
    if not s:
        return None
    try:
        dt = datetime.fromisoformat(str(s).replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=TBILISI)
        return dt.astimezone(TBILISI)
    except (TypeError, ValueError):
        return None


def _select(
    sb: Any,
    table: str,
    columns: str,
    *,
    order: str | None = None,
    desc: bool = False,
    gte: dict[str, str] | None = None,
) -> list[dict]:
    """Fetch rows, swallowing missing-table / connection errors → []."""
    try:
        q = sb.table(table).select(columns)
        if gte:
            for col, val in gte.items():
                q = q.gte(col, val)
        if order:
            q = q.order(order, desc=desc)
        return q.execute().data or []
    except Exception:
        return []


def _weekly_buckets(stamps: list[datetime], now: datetime, weeks: int = CADENCE_WEEKS) -> list[int]:
    """Count timestamps into `weeks` rolling 7-day buckets ending at `now` (oldest → newest)."""
    buckets = [0] * weeks
    for ts in stamps:
        days_ago = (now - ts).total_seconds() / 86400.0
        idx = int(days_ago // 7)
        if 0 <= idx < weeks:
            buckets[weeks - 1 - idx] += 1
    return buckets


# ── TikTok ────────────────────────────────────────────────────────────────────

def _build_tiktok(sb: Any, now: datetime, period_days: int) -> TikTokKpis:
    cutoff = now - timedelta(days=period_days)
    cutoff_6w = now - timedelta(weeks=CADENCE_WEEKS)

    # Latest profile snapshot
    profile = _select(
        sb, "tiktok_profile_stats",
        "date, followers_count, following_count, video_count, total_likes",
        order="date", desc=True,
    )
    snap = profile[0] if profile else {}
    followers_total = Metric(
        value=float(_i(snap.get("followers_count"))) if snap else None,
        status=MetricStatus.ok if snap else MetricStatus.no_data,
    )

    # Follower growth history — all rows, ordered oldest→newest
    growth = _select(sb, "tiktok_follower_growth",
                     "date, followers_count, followers_delta, net_change",
                     order="date")
    if not growth:
        follower_growth_rate = Metric(value=None, status=MetricStatus.no_data)
    elif len(growth) < MIN_GROWTH_ROWS:
        follower_growth_rate = Metric(
            value=None,
            status=MetricStatus.insufficient_history,
            note=(
                f"{len(growth)} data point(s) available — need ≥{MIN_GROWTH_ROWS} days "
                f"for a reliable monthly rate. Gap likely from an expired token "
                f"(June 26–28); will resolve as history accumulates."
            ),
        )
    else:
        oldest = _f(growth[0].get("followers_count"))
        latest = _f(growth[-1].get("followers_count"))
        d0 = _parse_dt(growth[0].get("date"))
        d1 = _parse_dt(growth[-1].get("date"))
        span_days = max(1.0, (d1 - d0).total_seconds() / 86400.0) if (d0 and d1) else 30.0
        monthly = (latest - oldest) / oldest * 100 * (30.0 / span_days) if oldest > 0 else None
        follower_growth_rate = Metric(
            value=round(monthly, 2) if monthly is not None else None,
            status=MetricStatus.ok if monthly is not None else MetricStatus.no_data,
        )

    # Video stats — last 6 weeks for cadence; filter to period for KPI metrics
    videos_6w = _select(
        sb, "tiktok_video_stats",
        "published_at, view_count, like_count, comment_count, share_count, engagement_rate",
        gte={"published_at": cutoff_6w.isoformat()},
        order="published_at",
    )
    period_videos = [
        v for v in videos_6w
        if (p := _parse_dt(v.get("published_at"))) and p >= cutoff
    ]

    # Engagement rate: AVG(engagement_rate stored column) — generated column in DB
    ers = [_f(v.get("engagement_rate")) for v in period_videos if v.get("engagement_rate") is not None]
    engagement_rate = Metric(
        value=round(sum(ers) / len(ers), 2) if ers else None,
        status=MetricStatus.ok if ers else MetricStatus.no_data,
    )

    # Reach: always 0 from Sandbox API — not_available
    reach = Metric(
        value=None,
        status=MetricStatus.not_available,
        note=(
            "reach and download_count are 0 for all rows in tiktok_video_stats — "
            "TikTok Sandbox API does not return these fields. "
            "Re-check after Production app review approval."
        ),
    )

    # Share rate: AVG(share_count / view_count) × 100
    share_ratios = [
        _f(v.get("share_count")) / _f(v.get("view_count")) * 100
        for v in period_videos
        if _f(v.get("view_count")) > 0
    ]
    share_rate = Metric(
        value=round(sum(share_ratios) / len(share_ratios), 2) if share_ratios else None,
        status=MetricStatus.ok if share_ratios else MetricStatus.no_data,
    )

    # FYP rate: no such field in TikTok API response
    fyp_rate = Metric(
        value=None,
        status=MetricStatus.not_available,
        note="No FYP-specific field exists in the TikTok API response.",
    )

    # Cadence
    pub_stamps = [d for v in videos_6w if (d := _parse_dt(v.get("published_at")))]
    cadence = _weekly_buckets(pub_stamps, now)
    cadence_per_week = round(sum(cadence) / CADENCE_WEEKS, 1) if videos_6w else None

    return TikTokKpis(
        available=bool(profile or videos_6w),
        follower_growth_rate=follower_growth_rate,
        followers_total=followers_total,
        engagement_rate=engagement_rate,
        reach=reach,
        share_rate=share_rate,
        fyp_rate=fyp_rate,
        cadence_weekly=cadence,
        cadence_per_week=cadence_per_week,
    )


# ── Instagram ─────────────────────────────────────────────────────────────────

def _build_instagram(sb: Any, now: datetime, period_days: int) -> InstagramKpis:
    cutoff = now - timedelta(days=period_days)
    cutoff_6w = now - timedelta(weeks=CADENCE_WEEKS)

    # meta_ig_insights: only total_followers + reach are populated
    insights = _select(
        sb, "meta_ig_insights",
        "date, total_followers, reach",
        order="date",
    )
    latest_fc = _i(insights[-1].get("total_followers")) if insights else None
    followers_total = Metric(
        value=float(latest_fc) if latest_fc is not None else None,
        status=MetricStatus.ok if latest_fc is not None else MetricStatus.no_data,
    )

    # Follower growth: delta across the insights window, normalized to 30 days
    if len(insights) >= 2:
        fc0 = _f(insights[0].get("total_followers"))
        fc1 = _f(insights[-1].get("total_followers"))
        d0 = _parse_dt(insights[0].get("date"))
        d1 = _parse_dt(insights[-1].get("date"))
        span = max(1.0, (d1 - d0).total_seconds() / 86400.0) if (d0 and d1) else 30.0
        if fc0 > 0:
            rate = (fc1 - fc0) / fc0 * 100 * (30.0 / span)
            follower_growth_rate = Metric(value=round(rate, 2), status=MetricStatus.ok)
        else:
            follower_growth_rate = Metric(value=None, status=MetricStatus.no_data)
    elif insights:
        follower_growth_rate = Metric(
            value=None,
            status=MetricStatus.insufficient_history,
            note="Only 1 row in meta_ig_insights — need ≥2 data points to compute growth.",
        )
    else:
        follower_growth_rate = Metric(value=None, status=MetricStatus.no_data)

    # meta_ig_posts: fully populated — use for all engagement/reach/saves/reels
    # Fetch last 6 weeks; filter in Python for the period window
    posts_6w = _select(
        sb, "meta_ig_posts",
        "timestamp, media_type, likes, comments, saves, shares, reach, impressions, plays, video_views",
        gte={"timestamp": cutoff_6w.isoformat()},
        order="timestamp",
    )
    period_posts = [
        p for p in posts_6w
        if (ts := _parse_dt(p.get("timestamp"))) and ts >= cutoff
    ]

    # Engagement rate: AVG((likes+comments+saves+shares)/reach) per post where reach > 0
    eng_vals = []
    for p in period_posts:
        r = _f(p.get("reach"))
        if r > 0:
            eng_vals.append(
                (_f(p.get("likes")) + _f(p.get("comments")) +
                 _f(p.get("saves")) + _f(p.get("shares"))) / r
            )
    engagement_rate = Metric(
        value=round(sum(eng_vals) / len(eng_vals) * 100, 2) if eng_vals else None,
        status=MetricStatus.ok if eng_vals else MetricStatus.no_data,
    )

    # Reach + impressions: SUM from period posts
    total_reach = sum(_i(p.get("reach")) for p in period_posts)
    total_impr  = sum(_i(p.get("impressions")) for p in period_posts)
    reach_30d = Metric(
        value=float(total_reach) if period_posts else None,
        status=MetricStatus.ok if period_posts else MetricStatus.no_data,
    )
    impressions_30d = Metric(
        value=float(total_impr) if period_posts else None,
        status=MetricStatus.ok if period_posts else MetricStatus.no_data,
    )

    # Saves per post: AVG(saves)
    saves_vals = [_f(p.get("saves")) for p in period_posts]
    saves_per_post = Metric(
        value=round(sum(saves_vals) / len(saves_vals), 1) if saves_vals else None,
        status=MetricStatus.ok if saves_vals else MetricStatus.no_data,
    )

    # Reels plays: SUM plays (or video_views fallback) for VIDEO/REEL posts
    reels = [
        p for p in period_posts
        if (p.get("media_type") or "").upper() in ("VIDEO", "REEL", "REELS")
    ]
    total_plays = sum(_i(p.get("plays")) or _i(p.get("video_views")) for p in reels)
    reels_plays = Metric(
        value=float(total_plays) if reels else None,
        status=MetricStatus.ok if reels else MetricStatus.no_data,
        note=None if reels else "No VIDEO/REEL posts found in period",
    )

    # Cadence: posts per week over last 6 weeks
    post_stamps_6w = [d for p in posts_6w if (d := _parse_dt(p.get("timestamp")))]
    cadence = _weekly_buckets(post_stamps_6w, now)
    cadence_per_week = round(sum(cadence) / CADENCE_WEEKS, 1) if posts_6w else None

    return InstagramKpis(
        available=bool(insights or posts_6w),
        follower_growth_rate=follower_growth_rate,
        followers_total=followers_total,
        engagement_rate=engagement_rate,
        reach_30d=reach_30d,
        impressions_30d=impressions_30d,
        saves_per_post=saves_per_post,
        reels_plays=reels_plays,
        cadence_weekly=cadence,
        cadence_per_week=cadence_per_week,
    )


# ── Facebook (placeholder — sync not yet implemented) ─────────────────────────

def _build_facebook() -> FacebookKpis:
    # TODO: meta_page_insights has zero rows. A Facebook Page Insights sync Edge
    # Function needs to be built (mirror tiktok-sync pattern) before this can return
    # real data. Until then, the frontend card renders a "Not connected" placeholder.
    return FacebookKpis()


# ── Main entry ────────────────────────────────────────────────────────────────

def get_social_kpis(sb: Any, now: datetime, period_days: int = 30) -> SocialKpisResponse:
    return SocialKpisResponse(
        tiktok=_build_tiktok(sb, now, period_days),
        instagram=_build_instagram(sb, now, period_days),
        facebook=_build_facebook(),
        meama_corner=PlaceholderPlatform(
            note="No data source in schema — Facebook Community/Group metrics not integrated.",
        ),
        x_twitter=PlaceholderPlatform(
            note="No data source in schema — X (Twitter) API not integrated.",
        ),
        period_days=period_days,
        generated_at=now.isoformat(),
    )

"""Social content-browser service.

Queries: tiktok_video_stats (snapshot table, multiple rows per video),
tiktok_video_hashtags, tiktok_profile_stats, tiktok_follower_growth,
meta_ig_posts, meta_ig_insights, meta_campaigns, meta_ad_sets, meta_ads,
meta_insights (currently empty — performance_data_available always False).

Data-quality contracts (confirmed 2026-06-30):
- tiktok_video_stats.reach is always 0 (Sandbox API) — not returned.
- meta_ig_posts.reach has data for 9/820 rows only — not shown per-post.
- meta_ig_posts.impressions/plays/video_views/engagement_rate: 0/820 — not returned.
- meta_insights: 0 rows — ads browser shows explicit empty state.
"""
from __future__ import annotations

import json
from collections import defaultdict
from datetime import datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from ..schemas.social import (
    AiReport,
    FollowerGrowthPoint,
    HashtagCount,
    MetaCampaignBrief,
    MetaCampaignsResponse,
    MetaIgInsightPoint,
    MetaIgPost,
    MetaOverview,
    MetaPostsResponse,
    MetaTypeStat,
    TikTokOverview,
    TikTokSnapshotPoint,
    TikTokVideoHistory,
    TikTokVideoSnap,
    TikTokVideosResponse,
)

TBILISI = ZoneInfo("Asia/Tbilisi")


# ── helpers ───────────────────────────────────────────────────────────────────

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
    eq: dict[str, str] | None = None,
    limit: int | None = None,
) -> list[dict]:
    """Fetch rows, swallowing missing-table / connection errors → []."""
    try:
        q = sb.table(table).select(columns)
        if gte:
            for col, val in gte.items():
                q = q.gte(col, val)
        if eq:
            for col, val in eq.items():
                q = q.eq(col, val)
        if order:
            q = q.order(order, desc=desc)
        if limit:
            q = q.limit(limit)
        return q.execute().data or []
    except Exception:
        return []


def _row_to_snap(row: dict, hashtags: list[str], snapshot_count: int) -> TikTokVideoSnap:
    return TikTokVideoSnap(
        video_id=str(row.get("video_id", "")),
        title=row.get("title"),
        description=row.get("description"),
        cover_image_url=row.get("cover_image_url"),
        video_url=row.get("video_url"),
        duration=_i(row.get("duration")) or None,
        published_at=str(row.get("published_at")) if row.get("published_at") else None,
        view_count=_i(row.get("view_count")),
        like_count=_i(row.get("like_count")),
        comment_count=_i(row.get("comment_count")),
        share_count=_i(row.get("share_count")),
        download_count=_i(row.get("download_count")),
        engagement_rate=_f(row.get("engagement_rate")) or None,
        snapshot_date=str(row.get("date") or row.get("synced_at") or ""),
        hashtags=hashtags,
        snapshot_count=snapshot_count,
    )


# ── TikTok ────────────────────────────────────────────────────────────────────

def get_tiktok_videos(sb: Any) -> TikTokVideosResponse:
    """Latest snapshot per distinct video_id + hashtags."""
    # tiktok_video_stats may be a snapshot table (multiple rows per video_id)
    # or PK on video_id (one row). We group in Python to handle both.
    rows = _select(
        sb, "tiktok_video_stats",
        "video_id,account_id,date,title,description,cover_image_url,video_url,"
        "duration,published_at,view_count,like_count,comment_count,share_count,"
        "download_count,engagement_rate,synced_at",
        order="synced_at", desc=True,
    )

    # Group → keep latest (first occurrence since sorted desc)
    seen: set[str] = set()
    counts: dict[str, int] = defaultdict(int)
    latest_by_video: dict[str, dict] = {}
    for row in rows:
        vid = str(row.get("video_id", ""))
        counts[vid] += 1
        if vid not in seen:
            seen.add(vid)
            latest_by_video[vid] = row

    # Hashtags
    htags_rows = _select(
        sb, "tiktok_video_hashtags",
        "video_id,hashtag",
    )
    htags_by_video: dict[str, list[str]] = defaultdict(list)
    for hr in htags_rows:
        vid = str(hr.get("video_id", ""))
        h = hr.get("hashtag", "")
        if h:
            htags_by_video[vid].append(str(h))

    videos = [
        _row_to_snap(row, htags_by_video.get(vid, []), counts[vid])
        for vid, row in latest_by_video.items()
    ]
    # Sort: most-viewed first
    videos.sort(key=lambda v: v.view_count, reverse=True)

    return TikTokVideosResponse(videos=videos, total=len(videos))


def get_tiktok_video_history(sb: Any, video_id: str) -> TikTokVideoHistory:
    """All snapshots for one video (for sparkline), oldest → newest."""
    rows = _select(
        sb, "tiktok_video_stats",
        "date,synced_at,view_count,like_count",
        eq={"video_id": video_id},
        order="date",
    )
    snaps = []
    for row in rows:
        d = row.get("date") or str(row.get("synced_at", ""))[:10]
        snaps.append(TikTokSnapshotPoint(
            date=str(d),
            view_count=_i(row.get("view_count")),
            like_count=_i(row.get("like_count")),
        ))
    return TikTokVideoHistory(video_id=video_id, snapshots=snaps)


def get_tiktok_overview(sb: Any) -> TikTokOverview:
    """Aggregated TikTok stats from all latest snapshots + profile + growth."""
    # All rows, grouped to latest per video
    rows = _select(
        sb, "tiktok_video_stats",
        "video_id,date,title,description,cover_image_url,video_url,duration,"
        "published_at,view_count,like_count,comment_count,share_count,download_count,"
        "engagement_rate,synced_at",
        order="synced_at", desc=True,
    )
    seen: set[str] = set()
    counts: dict[str, int] = defaultdict(int)
    latest: list[dict] = []
    for row in rows:
        vid = str(row.get("video_id", ""))
        counts[vid] += 1
        if vid not in seen:
            seen.add(vid)
            latest.append(row)

    htags_rows = _select(sb, "tiktok_video_hashtags", "video_id,hashtag")
    htags_by_video: dict[str, list[str]] = defaultdict(list)
    all_hashtags: list[str] = []
    for hr in htags_rows:
        vid = str(hr.get("video_id", ""))
        h = hr.get("hashtag", "")
        if h:
            htags_by_video[vid].append(str(h))
            all_hashtags.append(str(h))

    # Aggregates from latest snapshots
    total_views = sum(_i(r.get("view_count")) for r in latest)
    total_likes = sum(_i(r.get("like_count")) for r in latest)
    total_comments = sum(_i(r.get("comment_count")) for r in latest)
    total_shares = sum(_i(r.get("share_count")) for r in latest)

    ers = [_f(r.get("engagement_rate")) for r in latest if r.get("engagement_rate") is not None]
    avg_er = round(sum(ers) / len(ers), 2) if ers else None

    snaps = [
        _row_to_snap(r, htags_by_video.get(str(r.get("video_id", "")), []), counts[str(r.get("video_id", ""))])
        for r in latest
    ]
    top_views = sorted(snaps, key=lambda v: v.view_count, reverse=True)[:5]
    top_eng = sorted(
        [v for v in snaps if v.engagement_rate is not None],
        key=lambda v: v.engagement_rate or 0,
        reverse=True,
    )[:5]

    # Follower count from profile
    profile = _select(sb, "tiktok_profile_stats", "date,followers_count", order="date", desc=True)
    followers = _i(profile[0].get("followers_count")) if profile else None

    # Follower growth trend (oldest → newest)
    growth = _select(sb, "tiktok_follower_growth", "date,followers_count", order="date")
    growth_trend = [
        FollowerGrowthPoint(date=str(r.get("date", "")), followers_count=_i(r.get("followers_count")))
        for r in growth if r.get("date")
    ]

    # Top hashtags by frequency
    htag_counts: dict[str, int] = defaultdict(int)
    for h in all_hashtags:
        htag_counts[h] += 1
    top_htags = [
        HashtagCount(hashtag=h, count=c)
        for h, c in sorted(htag_counts.items(), key=lambda x: x[1], reverse=True)[:20]
    ]

    return TikTokOverview(
        total_videos=len(latest),
        total_views=total_views,
        total_likes=total_likes,
        total_comments=total_comments,
        total_shares=total_shares,
        avg_engagement_rate=avg_er,
        followers_count=followers,
        follower_growth_trend=growth_trend,
        top_5_by_views=top_views,
        top_5_by_engagement=top_eng,
        top_hashtags=top_htags,
    )


def _build_tiktok_ai_payload(sb: Any) -> dict:
    """Compact JSON summary for the AI analysis prompt — no raw PII."""
    overview = get_tiktok_overview(sb)
    return {
        "platform": "TikTok @meamabackstage",
        "total_videos": overview.total_videos,
        "total_views": overview.total_views,
        "total_likes": overview.total_likes,
        "total_comments": overview.total_comments,
        "total_shares": overview.total_shares,
        "avg_engagement_rate_pct": overview.avg_engagement_rate,
        "followers": overview.followers_count,
        "top_hashtags": [{"tag": h.hashtag, "count": h.count} for h in overview.top_hashtags[:10]],
        "top_5_by_views": [
            {
                "title": v.title or "—",
                "views": v.view_count,
                "likes": v.like_count,
                "engagement_pct": v.engagement_rate,
                "duration_s": v.duration,
                "hashtags": v.hashtags[:5],
            }
            for v in overview.top_5_by_views
        ],
        "top_5_by_engagement": [
            {
                "title": v.title or "—",
                "engagement_pct": v.engagement_rate,
                "views": v.view_count,
                "hashtags": v.hashtags[:5],
            }
            for v in overview.top_5_by_engagement
        ],
    }


def get_tiktok_ai_report(sb: Any, lang: str, cache: dict, settings: Any) -> AiReport:
    """Generate or return cached Claude analysis of TikTok performance."""
    key = f"tiktok_{lang}"
    cached = cache.get(key)
    now = datetime.now(TBILISI)
    if cached and (now - cached["ts"]).total_seconds() < 86400:
        return AiReport(report=cached["report"], generated_at=cached["generated_at"], cached=True)

    payload = _build_tiktok_ai_payload(sb)
    lang_instruction = (
        "Respond in Georgian (ქართული)." if lang == "ka"
        else "Respond in English."
    )
    prompt = (
        f"{lang_instruction}\n\n"
        "You are analyzing organic TikTok performance data for Meama, a premium Georgian coffee brand. "
        "Based on the following aggregated stats (no personal data), write a short analysis (3-4 paragraphs) covering:\n"
        "1. What content is performing best and why\n"
        "2. Which hashtags or content patterns correlate with higher engagement\n"
        "3. Two or three concrete, actionable recommendations\n\n"
        "Keep it concise and practical. Do not mention follower counts if they seem low — focus on engagement quality.\n\n"
        f"DATA:\n{json.dumps(payload, ensure_ascii=False, indent=2)}"
    )

    try:
        from anthropic import Anthropic
        client = Anthropic(api_key=settings.anthropic_api_key)
        msg = client.messages.create(
            model=settings.anthropic_model,
            max_tokens=800,
            messages=[{"role": "user", "content": prompt}],
        )
        report_text = msg.content[0].text.strip()
    except Exception as e:
        report_text = f"Analysis unavailable: {e}"

    ts_str = now.isoformat()
    cache[key] = {"report": report_text, "generated_at": ts_str, "ts": now}
    return AiReport(report=report_text, generated_at=ts_str, cached=False)


# ── Meta Instagram ────────────────────────────────────────────────────────────

def _row_to_ig_post(row: dict) -> MetaIgPost:
    media_type = (row.get("media_type") or "IMAGE").upper()
    return MetaIgPost(
        media_id=str(row.get("media_id", "")),
        media_type=media_type,
        permalink=row.get("permalink"),
        thumbnail_url=row.get("thumbnail_url") if media_type == "VIDEO" else None,
        caption=row.get("caption"),
        timestamp=str(row.get("timestamp")) if row.get("timestamp") else None,
        likes=_i(row.get("likes")),
        comments=_i(row.get("comments")),
    )


def get_meta_posts(sb: Any, limit: int = 60) -> MetaPostsResponse:
    """IG posts, most recent first, capped at `limit`."""
    rows = _select(
        sb, "meta_ig_posts",
        "media_id,ig_account_id,media_type,permalink,thumbnail_url,caption,timestamp,likes,comments",
        order="timestamp", desc=True, limit=limit,
    )
    # Total count (approximate from fetched)
    count_rows = _select(sb, "meta_ig_posts", "media_id")
    posts = [_row_to_ig_post(r) for r in rows]
    return MetaPostsResponse(posts=posts, total=len(count_rows))


def get_meta_overview(sb: Any) -> MetaOverview:
    """Account-level IG overview: follower trend + post aggregates."""
    # Insights trend (oldest → newest)
    insights = _select(
        sb, "meta_ig_insights",
        "date,total_followers,follower_count_delta,reach,accounts_engaged,total_interactions",
        order="date",
    )
    trend = []
    current_followers: int | None = None
    followers_delta: int | None = None

    for row in insights:
        d = str(row.get("date", ""))
        if not d:
            continue
        trend.append(MetaIgInsightPoint(
            date=d,
            total_followers=_i(row.get("total_followers")) or None,
            reach=_i(row.get("reach")) or None,
            accounts_engaged=_i(row.get("accounts_engaged")) or None,
            total_interactions=_i(row.get("total_interactions")) or None,
        ))

    if insights:
        current_followers = _i(insights[-1].get("total_followers")) or None
        # follower_count_delta may not exist in older schema rows
        followers_delta = _i(insights[-1].get("follower_count_delta")) or None

    # Post aggregates (all posts, not windowed)
    posts = _select(
        sb, "meta_ig_posts",
        "media_id,media_type,permalink,thumbnail_url,caption,timestamp,likes,comments",
        order="likes", desc=True,
    )

    total_likes = sum(_i(r.get("likes")) for r in posts)
    total_comments = sum(_i(r.get("comments")) for r in posts)

    # By media type
    by_type: dict[str, dict] = defaultdict(lambda: {"count": 0, "likes": 0, "comments": 0})
    for r in posts:
        mt = (r.get("media_type") or "IMAGE").upper()
        by_type[mt]["count"] += 1
        by_type[mt]["likes"] += _i(r.get("likes"))
        by_type[mt]["comments"] += _i(r.get("comments"))

    media_stats = [
        MetaTypeStat(
            media_type=mt,
            post_count=v["count"],
            avg_likes=round(v["likes"] / v["count"], 1) if v["count"] else 0,
            avg_comments=round(v["comments"] / v["count"], 1) if v["count"] else 0,
        )
        for mt, v in by_type.items()
    ]

    top_5 = [_row_to_ig_post(r) for r in posts[:5]]

    return MetaOverview(
        total_posts=len(posts),
        total_likes=total_likes,
        total_comments=total_comments,
        by_media_type=media_stats,
        top_5_by_likes=top_5,
        current_followers=current_followers,
        followers_delta=followers_delta,
        insights_trend=trend,
    )


# ── Meta Ads ──────────────────────────────────────────────────────────────────

def get_meta_campaigns(sb: Any) -> MetaCampaignsResponse:
    """Campaign/ad-set/ad structure. Performance data: always empty (meta_insights 0 rows)."""
    campaigns = _select(
        sb, "meta_campaigns",
        "campaign_id,name,objective,status,daily_budget,lifetime_budget",
        order="name",
    )
    ad_sets = _select(
        sb, "meta_ad_sets",
        "ad_set_id,campaign_id,name,status,daily_budget,optimization_goal",
        order="name",
    )
    ads = _select(sb, "meta_ads", "ad_id,ad_set_id,campaign_id")

    # Count ad-sets per campaign
    sets_per_campaign: dict[str, int] = defaultdict(int)
    for s in ad_sets:
        sets_per_campaign[str(s.get("campaign_id", ""))] += 1

    campaign_list = [
        MetaCampaignBrief(
            campaign_id=str(c.get("campaign_id", "")),
            name=c.get("name"),
            objective=c.get("objective"),
            status=c.get("status"),
            daily_budget=_f(c.get("daily_budget")) or None,
            lifetime_budget=_f(c.get("lifetime_budget")) or None,
            has_performance_data=False,
            ad_sets_count=sets_per_campaign.get(str(c.get("campaign_id", "")), 0),
        )
        for c in campaigns
    ]

    return MetaCampaignsResponse(
        campaigns=campaign_list,
        total_campaigns=len(campaigns),
        total_ad_sets=len(ad_sets),
        total_ads=len(ads),
        performance_data_available=False,
    )


def _build_meta_ai_payload(sb: Any) -> dict:
    overview = get_meta_overview(sb)
    return {
        "platform": "Instagram @meama",
        "total_posts": overview.total_posts,
        "total_likes": overview.total_likes,
        "total_comments": overview.total_comments,
        "current_followers": overview.current_followers,
        "follower_delta_latest": overview.followers_delta,
        "by_media_type": [
            {"type": s.media_type, "posts": s.post_count, "avg_likes": s.avg_likes, "avg_comments": s.avg_comments}
            for s in overview.by_media_type
        ],
        "top_5_by_likes": [
            {
                "media_type": p.media_type,
                "likes": p.likes,
                "comments": p.comments,
                "caption_excerpt": (p.caption or "")[:120],
                "timestamp": p.timestamp,
            }
            for p in overview.top_5_by_likes
        ],
        "insights_trend_last_7": [
            {"date": pt.date, "followers": pt.total_followers, "reach": pt.reach,
             "engaged": pt.accounts_engaged, "interactions": pt.total_interactions}
            for pt in overview.insights_trend[-7:]
        ],
    }


def get_meta_ai_report(sb: Any, lang: str, cache: dict, settings: Any) -> AiReport:
    """Generate or return cached Claude analysis of Instagram organic performance."""
    key = f"meta_{lang}"
    cached = cache.get(key)
    now = datetime.now(TBILISI)
    if cached and (now - cached["ts"]).total_seconds() < 86400:
        return AiReport(report=cached["report"], generated_at=cached["generated_at"], cached=True)

    payload = _build_meta_ai_payload(sb)
    lang_instruction = (
        "Respond in Georgian (ქართული)." if lang == "ka"
        else "Respond in English."
    )
    prompt = (
        f"{lang_instruction}\n\n"
        "You are analyzing organic Instagram performance data for Meama, a premium Georgian coffee brand. "
        "Based on the following aggregated stats (no personal data), write a concise analysis (3-4 paragraphs) covering:\n"
        "1. Which content types (VIDEO, IMAGE, CAROUSEL) are performing best\n"
        "2. Engagement patterns and what they tell us about the audience\n"
        "3. Two or three concrete recommendations to improve reach and engagement\n\n"
        "Note: reach and impressions data are not yet backfilled — focus on likes, comments, and follower trends.\n\n"
        f"DATA:\n{json.dumps(payload, ensure_ascii=False, indent=2)}"
    )

    try:
        from anthropic import Anthropic
        client = Anthropic(api_key=settings.anthropic_api_key)
        msg = client.messages.create(
            model=settings.anthropic_model,
            max_tokens=800,
            messages=[{"role": "user", "content": prompt}],
        )
        report_text = msg.content[0].text.strip()
    except Exception as e:
        report_text = f"Analysis unavailable: {e}"

    ts_str = now.isoformat()
    cache[key] = {"report": report_text, "generated_at": ts_str, "ts": now}
    return AiReport(report=report_text, generated_at=ts_str, cached=False)

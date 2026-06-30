"""Sessions & Behavior — overview + abandonment endpoints."""
from __future__ import annotations

from collections import Counter
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Query

from ..deps import get_supabase
from ..schemas.sessions import (
    AbandonmentByStage,
    AbandonmentKpis,
    AbandonmentResponse,
    ChannelRow,
    DeviceRow,
    FunnelRow,
    GeoRow,
    RecoverableCart,
    SessionsKpis,
    SessionsOverviewResponse,
    SourceSplit,
    TopProduct,
    WhoIsBrowsing,
)

router = APIRouter(prefix="/sessions", tags=["sessions"])

_TZ_TBS = ZoneInfo("Asia/Tbilisi")

_FUNNEL_LABELS = [
    "Sessions",
    "Product view",
    "Add to cart",
    "Checkout started",
    "Payment info",
    "Purchase",
]

_STAGE_LABEL = {
    3: "Cart (no checkout)",
    4: "Checkout started",
    5: "Contact / address",
    6: "Payment info",
    7: "Purchase",
}


def _cutoff(range_param: str) -> datetime:
    today = datetime.now(_TZ_TBS).replace(hour=0, minute=0, second=0, microsecond=0)
    if range_param == "today":
        return today
    if range_param == "7d":
        return today - timedelta(days=6)
    return today - timedelta(days=29)


@router.get("/overview", response_model=SessionsOverviewResponse)
async def sessions_overview(
    range: str = Query("30d", pattern="^(today|7d|30d)$"),
    sb=Depends(get_supabase),
) -> SessionsOverviewResponse:
    cutoff_iso = _cutoff(range).isoformat()

    result = (
        sb.table("shopify_sessions")
        .select(
            "session_id,client_id,customer_id,started_at,duration_seconds,"
            "funnel_stage,converted,engaged,channel,device_type,"
            "geo_city,geo_region,geo_country,"
            "products_viewed_sku,products_carted_sku,"
            "events_count,page_views,session_num"
        )
        .gte("started_at", cutoff_iso)
        .execute()
    )
    sessions = result.data or []

    if not sessions:
        return _empty_overview(range)

    total = len(sessions)
    unique_visitors = len({s["client_id"] for s in sessions if s.get("client_id")})
    registered = sum(1 for s in sessions if s.get("customer_id"))
    converted = sum(1 for s in sessions if s.get("converted"))
    engaged = sum(1 for s in sessions if s.get("engaged"))
    durations = [s["duration_seconds"] for s in sessions if s.get("duration_seconds")]
    avg_dur = int(sum(durations) / len(durations)) if durations else 0

    # Bounce: funnel_stage == 1 AND (events_count <= 1 OR page_views <= 1)
    bounced = sum(
        1 for s in sessions
        if (s.get("funnel_stage") or 0) == 1
        and ((s.get("events_count") or 0) <= 1 or (s.get("page_views") or 0) <= 1)
    )
    bounce_rate_pct = round(bounced / total * 100, 1) if total else 0.0

    # New = client first appeared in this window (session_num == 1 among their sessions here)
    # Returning = client had sessions before this window (all their sessions here have session_num > 1)
    client_min_snum: dict[str, int] = {}
    for s in sessions:
        cid = s.get("client_id")
        snum = int(s.get("session_num") or 0)
        if cid:
            if cid not in client_min_snum or snum < client_min_snum[cid]:
                client_min_snum[cid] = snum
    new_visitors = sum(1 for v in client_min_snum.values() if v <= 1)
    returning_visitors = sum(1 for v in client_min_snum.values() if v > 1)

    f_counts = [
        total,
        sum(1 for s in sessions if (s.get("funnel_stage") or 0) >= 2),
        sum(1 for s in sessions if (s.get("funnel_stage") or 0) >= 3),
        sum(1 for s in sessions if (s.get("funnel_stage") or 0) >= 4),
        sum(1 for s in sessions if (s.get("funnel_stage") or 0) >= 5),
        sum(1 for s in sessions if s.get("converted")),
    ]
    funnel = [
        FunnelRow(label=lbl, count=c, pct=round(c / total, 4) if total else 0)
        for lbl, c in zip(_FUNNEL_LABELS, f_counts)
    ]

    warm = sum(
        1 for s in sessions
        if s.get("customer_id")
        and (s.get("funnel_stage") or 0) >= 2
        and not s.get("converted")
    )
    who = WhoIsBrowsing(registered=registered, anonymous=total - registered, warm=warm)

    # Aggregate SKU views / carts
    sku_view: Counter = Counter()
    sku_cart: Counter = Counter()
    for s in sessions:
        for sku in (s.get("products_viewed_sku") or []):
            sku_view[sku] += 1
        for sku in (s.get("products_carted_sku") or []):
            sku_cart[sku] += 1

    # Resolve SKU → name / category
    top_skus = [sku for sku, _ in sku_view.most_common(20)]
    product_map: dict = {}
    if top_skus:
        pm = (
            sb.table("products_georgia")
            .select("variant_sku,title,product_type")
            .in_("variant_sku", top_skus)
            .execute()
        )
        product_map = {
            r["variant_sku"]: {"sku": r["variant_sku"], "name": r.get("title"), "category": r.get("product_type")}
            for r in (pm.data or [])
        }

    def _prod(sku: str, count: int) -> TopProduct:
        info = product_map.get(sku, {})
        return TopProduct(sku=sku, name=info.get("name") or sku, category=info.get("category"), count=count)

    top_products = [_prod(sku, cnt) for sku, cnt in sku_view.most_common(5)]

    cat_cnt: Counter = Counter()
    for sku, cnt in sku_view.items():
        cat = (product_map.get(sku) or {}).get("category")
        if cat:
            cat_cnt[cat] += cnt
    top_categories = [
        TopProduct(sku="", name=cat, category=cat, count=cnt)
        for cat, cnt in cat_cnt.most_common(5)
    ]

    viewed_not_bought = [
        _prod(sku, cnt)
        for sku, cnt in sku_view.most_common(10)
        if sku not in sku_cart
    ][:5]

    ch_cnt: Counter = Counter()
    for s in sessions:
        ch_cnt[s.get("channel") or "unknown"] += 1
    channels = [
        ChannelRow(channel=ch, count=cnt, pct=round(cnt / total, 4))
        for ch, cnt in ch_cnt.most_common()
    ]

    dev_cnt: Counter = Counter()
    for s in sessions:
        dev_cnt[s.get("device_type") or "unknown"] += 1
    devices = [
        DeviceRow(device_type=dt, count=cnt, pct=round(cnt / total, 4))
        for dt, cnt in dev_cnt.most_common()
    ]

    geo_cnt: Counter = Counter()
    for s in sessions:
        loc = s.get("geo_city") or s.get("geo_region") or s.get("geo_country") or "Unknown"
        geo_cnt[loc] += 1
    geo = [
        GeoRow(location=loc, count=cnt, pct=round(cnt / total, 4))
        for loc, cnt in geo_cnt.most_common(6)
    ]

    return SessionsOverviewResponse(
        range=range,
        kpis=SessionsKpis(
            sessions=total,
            unique_visitors=unique_visitors,
            registered_share=round(registered / total, 4) if total else 0,
            conversion_rate=round(converted / total, 4) if total else 0,
            avg_duration_seconds=avg_dur,
            engaged_pct=round(engaged / total, 4) if total else 0,
            bounce_rate_pct=bounce_rate_pct,
            new_visitors=new_visitors,
            returning_visitors=returning_visitors,
        ),
        funnel=funnel,
        who=who,
        top_products=top_products,
        top_categories=top_categories,
        viewed_not_bought=viewed_not_bought,
        channels=channels,
        devices=devices,
        geo=geo,
    )


@router.get("/abandonment", response_model=AbandonmentResponse)
async def sessions_abandonment(
    range: str = Query("30d", pattern="^(today|7d|30d)$"),
    sb=Depends(get_supabase),
) -> AbandonmentResponse:
    cutoff_iso = _cutoff(range).isoformat()

    sess_res = (
        sb.table("shopify_sessions")
        .select(
            "session_id,client_id,customer_id,started_at,ended_at,"
            "funnel_stage,converted,cart_value_peak,products_carted_sku,abandoned_stage"
        )
        .gte("started_at", cutoff_iso)
        .gte("funnel_stage", 3)
        .execute()
    )
    cart_sessions = sess_res.data or []

    total_cart = len(cart_sessions)
    total_checkout = sum(1 for s in cart_sessions if (s.get("funnel_stage") or 0) >= 4)
    aband_cart = sum(1 for s in cart_sessions if not s.get("converted"))
    aband_checkout = sum(1 for s in cart_sessions if (s.get("funnel_stage") or 0) >= 4 and not s.get("converted"))

    cart_rate = round(aband_cart / total_cart, 4) if total_cart else 0
    checkout_rate = round(aband_checkout / total_checkout, 4) if total_checkout else 0

    live_recoverable = [s for s in cart_sessions if not s.get("converted") and s.get("cart_value_peak")]

    # Fetch recovery outcomes for live sessions
    live_session_ids = [s["session_id"] for s in live_recoverable if s.get("session_id")]
    cro_by_session: dict[str, str] = {}
    if live_session_ids:
        cro_res = (
            sb.table("cart_recovery_outcomes")
            .select("session_id,recovery_outcome")
            .in_("session_id", live_session_ids)
            .execute()
        )
        cro_by_session = {r["session_id"]: r["recovery_outcome"] for r in (cro_res.data or [])}

    # Resolve carted SKUs → product names for live sessions
    all_live_skus: set[str] = set()
    for s in live_recoverable:
        for sku in (s.get("products_carted_sku") or []):
            if sku:
                all_live_skus.add(sku)
    live_sku_name: dict[str, str] = {}
    if all_live_skus:
        pg = (
            sb.table("products_georgia")
            .select("variant_sku,title")
            .in_("variant_sku", list(all_live_skus))
            .execute()
        )
        for row in pg.data or []:
            sku = row.get("variant_sku")
            title = row.get("title")
            if (
                sku and title
                and "Tier Point" not in title
                and "POS" not in title
                and sku not in live_sku_name
            ):
                live_sku_name[sku] = title

    try:
        shopify_res = (
            sb.table("georgia_abandoned_carts")
            .select("token,email,phone,total_price,created_at")
            .gte("created_at", cutoff_iso)
            .execute()
        )
        shopify_carts = shopify_res.data or []
    except Exception:
        shopify_carts = []

    live_value = sum(float(s.get("cart_value_peak") or 0) for s in live_recoverable)
    shopify_value = sum(float(c.get("total_price") or 0) for c in shopify_carts)
    total_recoverable = len(live_recoverable) + len(shopify_carts)
    total_value = live_value + shopify_value

    stage_cnt: Counter = Counter()
    stage_num_map: dict[str, int] = {}
    for s in cart_sessions:
        if not s.get("converted"):
            stage_n = int(s.get("abandoned_stage") or s.get("funnel_stage") or 3)
            label = _STAGE_LABEL.get(stage_n, f"Stage {stage_n}")
            stage_cnt[label] += 1
            stage_num_map[label] = max(stage_num_map.get(label, 0), stage_n)
    by_stage = [
        AbandonmentByStage(stage=st, stage_num=stage_num_map.get(st, 3), count=cnt)
        for st, cnt in stage_cnt.most_common()
    ]

    # Enrich live sessions with portfolio data
    live_cids = list({s["customer_id"] for s in live_recoverable if s.get("customer_id")})
    portfolio_map: dict = {}
    if live_cids:
        pc = (
            sb.table("portfolio_customers")
            .select("shopify_customer_id,full_name,email,segment")
            .in_("shopify_customer_id", [str(c) for c in live_cids])
            .execute()
        )
        portfolio_map = {str(r["shopify_customer_id"]): r for r in (pc.data or [])}

    top_shopify = sorted(shopify_carts, key=lambda x: float(x.get("total_price") or 0), reverse=True)[:8]
    shopify_emails = list({c["email"] for c in top_shopify if c.get("email")})
    email_map: dict = {}
    if shopify_emails:
        pe = (
            sb.table("portfolio_customers")
            .select("shopify_customer_id,full_name,email,segment")
            .in_("email", shopify_emails)
            .execute()
        )
        email_map = {r["email"]: r for r in (pe.data or []) if r.get("email")}

    sl = {3: "Cart", 4: "Checkout started", 5: "Contact / address", 6: "Payment info"}
    recoverable: list[RecoverableCart] = []

    for s in sorted(live_recoverable, key=lambda x: float(x.get("cart_value_peak") or 0), reverse=True)[:8]:
        pf = portfolio_map.get(str(s.get("customer_id"))) if s.get("customer_id") else None
        sn = s.get("funnel_stage") or 3
        recoverable.append(RecoverableCart(
            customer_id=str(s["customer_id"]) if s.get("customer_id") else None,
            full_name=pf.get("full_name") if pf else None,
            email=pf.get("email") if pf else None,
            segment=pf.get("segment") if pf else None,
            stage=sl.get(sn, f"Stage {sn}"),
            stage_num=sn,
            cart_value=float(s.get("cart_value_peak") or 0),
            last_seen=s.get("ended_at") or s.get("started_at") or "",
            products=[
                live_sku_name.get(sku, sku)
                for sku in (s.get("products_carted_sku") or [])
                if sku
            ],
            recovery_outcome=cro_by_session.get(s.get("session_id") or ""),
        ))

    for c in top_shopify:
        pf = email_map.get(c.get("email") or "")
        recoverable.append(RecoverableCart(
            customer_id=str(pf["shopify_customer_id"]) if pf else None,
            full_name=pf.get("full_name") if pf else None,
            email=c.get("email"),
            segment=pf.get("segment") if pf else None,
            stage="Checkout started",
            stage_num=4,
            cart_value=float(c.get("total_price") or 0),
            last_seen=c.get("created_at") or "",
            products=[],
        ))

    recoverable.sort(key=lambda x: x.cart_value, reverse=True)
    recoverable = recoverable[:10]

    return AbandonmentResponse(
        range=range,
        kpis=AbandonmentKpis(
            cart_abandonment_rate=cart_rate,
            checkout_abandonment_rate=checkout_rate,
            recoverable_carts=total_recoverable,
            recoverable_value=total_value,
        ),
        by_stage=by_stage,
        source=SourceSplit(shopify_abandoned=len(shopify_carts), live_pixel=len(live_recoverable)),
        recoverable=recoverable,
    )


def _empty_overview(range_param: str) -> SessionsOverviewResponse:
    return SessionsOverviewResponse(
        range=range_param,
        kpis=SessionsKpis(sessions=0, unique_visitors=0, registered_share=0,
                          conversion_rate=0, avg_duration_seconds=0, engaged_pct=0,
                          bounce_rate_pct=0.0, new_visitors=0, returning_visitors=0),
        funnel=[FunnelRow(label=lbl, count=0, pct=0) for lbl in _FUNNEL_LABELS],
        who=WhoIsBrowsing(registered=0, anonymous=0, warm=0),
        top_products=[], top_categories=[], viewed_not_bought=[],
        channels=[], devices=[], geo=[],
    )

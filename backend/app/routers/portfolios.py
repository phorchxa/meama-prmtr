"""09 Portfolios — customer list + 360 detail.

Reads the `portfolio_customers` materialized view (see 0004_portfolio_view.sql).
All filtering, sorting, and pagination happen server-side via PostgREST.
"""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query

from datetime import UTC, datetime, timedelta
from typing import TypeVar
from zoneinfo import ZoneInfo

from ..business_rules import RETAIL_ORDER_SOURCES
from ..deps import get_supabase
from ..schemas.common import Page
from ..schemas.portfolios import OrderRow, PageJourneyEntry, PageJourneyResponse, PortfolioDetail, PortfolioSummary
from ..services.catalog import clean_category, dedupe_geo

T = TypeVar("T", bound=PortfolioSummary)
_TZ_TBS = ZoneInfo("Asia/Tbilisi")

_FUNNEL_LABEL = {
    1: "Browsing", 2: "Product view", 3: "Added to cart",
    4: "Checkout started", 5: "Payment info", 6: "Purchase", 7: "Purchase",
}


def _unique_skus(values: list[str] | None) -> list[str]:
    seen: set[str] = set()
    skus: list[str] = []
    for value in values or []:
        sku = str(value).strip()
        if sku and sku not in seen:
            seen.add(sku)
            skus.append(sku)
    return skus


def _session_products(skus: list[str] | None, product_map: dict[str, str]) -> list[dict[str, str]]:
    return [
        {"sku": sku, "title": product_map[sku]}
        for sku in _unique_skus(skus)
        if product_map.get(sku)
    ]


def _parse_dt(value: object) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        dt = value
    else:
        try:
            dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        except ValueError:
            return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=UTC)
    return dt.astimezone(UTC)


def _has_cart_activity(session: dict) -> bool:
    return bool(_unique_skus(session.get("products_carted_sku"))) or (session.get("add_to_carts") or 0) > 0


def _cart_status(session: dict | None, recovered_order: dict | None) -> dict[str, object]:
    if not session:
        return {
            "cart_status": "no_cart_activity",
            "recovered_order_id": None,
            "recovered_order_at": None,
            "days_to_recovery": None,
        }

    session_started_at = _parse_dt(session.get("started_at"))
    status = "no_cart_activity"
    if session.get("converted") is True:
        status = "converted"
    elif _has_cart_activity(session) and not session.get("converted"):
        status = "recovered_after_abandonment" if recovered_order else "active_abandoner"
    elif (
        session.get("funnel_stage")
        or _unique_skus(session.get("products_viewed_sku"))
        or session.get("types_viewed")
    ):
        status = "browsing_only"

    include_recovery = status == "recovered_after_abandonment"
    recovered_order_at = _parse_dt(recovered_order.get("processed_at")) if include_recovery and recovered_order else None
    days_to_recovery = None
    if session_started_at and recovered_order_at:
        days_to_recovery = max(0, (recovered_order_at.date() - session_started_at.date()).days)

    return {
        "cart_status": status,
        "recovered_order_id": recovered_order.get("shopify_order_id") if include_recovery and recovered_order else None,
        "recovered_order_at": recovered_order.get("processed_at") if include_recovery and recovered_order else None,
        "days_to_recovery": days_to_recovery,
    }


def _merge_behavior(sb, items: list[T]) -> list[T]:
    """Batch-fetch shopify_customer_behavior and latest session; merge into items."""
    cids = [str(it.shopify_customer_id) for it in items]
    if not cids:
        return items

    beh_res = (
        sb.table("shopify_customer_behavior")
        .select(
            "customer_id,sessions_30d,last_session_at,days_since_last_session,"
            "checkout_abandons,top_skus_viewed"
        )
        .in_("customer_id", cids)
        .execute()
    )
    beh_map = {r["customer_id"]: r for r in (beh_res.data or [])}

    # customer_viewed_products view not yet created — fields default to None
    viewed_map: dict = {}

    # Fetch latest session for any customer who has session data (not just warm)
    session_cids = [
        cid for cid in cids
        if (beh_map.get(cid, {}).get("sessions_30d") or 0) > 0
    ]
    last_session_map: dict = {}
    if session_cids:
        sess_res = (
            sb.table("shopify_sessions")
            .select(
                "session_id,customer_id,started_at,funnel_stage,"
                "converted,add_to_carts,cart_value_peak,"
                "products_viewed_sku,products_carted_sku,"
                "types_viewed,channel,device_type,geo_city"
            )
            .in_("customer_id", session_cids)
            .order("started_at", desc=True)
            .limit(max(len(session_cids) * 3, 20))
            .execute()
        )
        for s in (sess_res.data or []):
            cid = s["customer_id"]
            if cid not in last_session_map:
                last_session_map[cid] = s

    recovered_order_map: dict[str, dict] = {}
    session_times = [
        dt
        for dt in (_parse_dt(s.get("started_at")) for s in last_session_map.values())
        if dt is not None
    ]
    if last_session_map and session_times:
        min_session_at = min(session_times).isoformat()
        order_res = (
            sb.table("meama_georgia_orders")
            .select("customer_id,shopify_order_id,processed_at")
            .in_("customer_id", [int(cid) for cid in last_session_map.keys()])
            .neq("financial_status", "voided")
            .is_("cancelled_at", "null")
            .in_("source", list(RETAIL_ORDER_SOURCES))
            .gte("processed_at", min_session_at)
            .order("processed_at", desc=False)
            .limit(1000)
            .execute()
        )
        for order in order_res.data or []:
            cid = str(order.get("customer_id"))
            session = last_session_map.get(cid)
            if cid in recovered_order_map or not session:
                continue
            session_started_at = _parse_dt(session.get("started_at"))
            order_processed_at = _parse_dt(order.get("processed_at"))
            if session_started_at and order_processed_at and order_processed_at > session_started_at:
                recovered_order_map[cid] = order

    # Batch fetch most-recent cart recovery outcome per customer.
    # NOTE: do NOT chain .not_.is_() here — it causes a silent empty-result failure
    # in supabase-py. Null-guard is applied in Python below instead.
    cro_res = (
        sb.table("cart_recovery_outcomes")
        .select("customer_id,session_ended_at,carted_skus,recovery_outcome")
        .in_("customer_id", cids)
        .execute()
    )
    cro_map: dict[str, dict] = {}
    for row in (cro_res.data or []):
        if not row.get("recovery_outcome"):  # Python-side null guard
            continue
        cid_r = row["customer_id"]
        ts = row.get("session_ended_at") or ""
        if cid_r not in cro_map or ts > (cro_map[cid_r].get("session_ended_at") or ""):
            cro_map[cid_r] = row

    session_skus: set[str] = set()
    for s in last_session_map.values():
        session_skus.update(_unique_skus(s.get("products_viewed_sku")))
        session_skus.update(_unique_skus(s.get("products_carted_sku")))
    # Include CRO carted SKUs so they resolve in the same products_georgia batch
    for row in cro_map.values():
        session_skus.update(_unique_skus(row.get("carted_skus")))
    session_product_map: dict[str, str] = {}
    if session_skus:
        pg = (
            sb.table("products_georgia")
            .select("variant_sku,title")
            .in_("variant_sku", list(session_skus))
            .execute()
        )
        for row in pg.data or []:
            sku = row.get("variant_sku")
            title = row.get("title")
            if (
                sku and title
                and "Tier Point" not in title
                and "POS" not in title
                and sku not in session_product_map
            ):
                session_product_map[sku] = title

    # Resolve top browsed SKU → category
    sku_set: set[str] = set()
    for cid in cids:
        b = beh_map.get(cid, {})
        skus = b.get("top_skus_viewed") or []
        if skus:
            sku_set.add(skus[0])
    sku_cat_map: dict = {}
    if sku_set:
        pg = (
            sb.table("products_georgia")
            .select("variant_sku,product_type,status,variant_price,title")
            .in_("variant_sku", list(sku_set))
            .execute()
        )
        sku_cat_map = {
            sku: clean_category(r.get("product_type"))
            for sku, r in dedupe_geo(pg.data or []).items()
        }

    enriched: list[T] = []
    now = datetime.now(UTC)
    for it in items:
        cid = str(it.shopify_customer_id)
        b = beh_map.get(cid, {})
        v = viewed_map.get(cid, {})
        s = last_session_map.get(cid, {})

        top_skus = b.get("top_skus_viewed") or []
        top_cat = sku_cat_map.get(top_skus[0]) if top_skus else None

        days_since = b.get("days_since_last_session")
        days_order = it.days_since_last_order
        warm = (
            days_since is not None
            and days_since <= 3
            and (days_order is None or (days_order or 0) > 7 or it.never_ordered)
        )

        data = it.model_dump()
        viewed_products = _session_products(s.get("products_viewed_sku"), session_product_map) if s else None
        cart_products = _session_products(s.get("products_carted_sku"), session_product_map) if s else None
        cart_state = _cart_status(s if s else None, recovered_order_map.get(cid))
        latest_session = None
        if s:
            latest_session = {
                "session_id": s.get("session_id"),
                "started_at": s.get("started_at"),
                "products_viewed_sku": s.get("products_viewed_sku"),
                "products_carted_sku": s.get("products_carted_sku"),
                "types_viewed": s.get("types_viewed"),
                "viewed_products": viewed_products,
                "cart_products": cart_products,
                "add_to_carts": s.get("add_to_carts"),
                "converted": s.get("converted"),
                **cart_state,
            }
        data.update(
            sessions_30d=b.get("sessions_30d"),
            last_session_at=b.get("last_session_at"),
            days_since_last_session=days_since,
            checkout_abandons=b.get("checkout_abandons"),
            top_browsed_category=top_cat,
            session_warm=warm,
            last_funnel_stage=s.get("funnel_stage") if s else None,
            last_cart_value=float(s["cart_value_peak"]) if s and s.get("cart_value_peak") else None,
            last_viewed_sku=(s.get("products_carted_sku") or s.get("products_viewed_sku") or [None])[0] if s else None,
            add_to_carts=s.get("add_to_carts") if s else None,
            converted=s.get("converted") if s else None,
            viewed_products=viewed_products,
            cart_products=cart_products,
            latest_session=latest_session,
            **cart_state,
            last_viewed_products=v.get("last_viewed_products"),
            last_viewed_category=v.get("last_viewed_category"),
            top_viewed_products=v.get("top_viewed_products"),
            last_session_channel=s.get("channel") if s else None,
            last_session_device=s.get("device_type") if s else None,
            last_session_city=s.get("geo_city") if s else None,
        )
        cro = cro_map.get(cid, {})
        raw_carted = _unique_skus(cro.get("carted_skus"))
        last_carted_products = [session_product_map.get(sku, sku) for sku in raw_carted] if raw_carted else None
        data.update(
            last_cart_recovery_outcome=cro.get("recovery_outcome") if cro else None,
            last_carted_products=last_carted_products,
        )
        enriched.append(type(it)(**data))  # type: ignore[arg-type]
    return enriched

router = APIRouter(prefix="/portfolios", tags=["portfolios"])

_SORTABLE = frozenset(
    {
        "last_order_at",
        "total_spend",
        "order_count",
        "days_since_last_order",
        "aov",
        "health_score",
        "promo_share",
    }
)

_LIST_COLS = (
    "shopify_customer_id,full_name,email,phone,phone_only,initials,"
    "accept_marketing_email,sms_marketing,"
    "region,order_count,total_spend,aov,last_order_at,"
    "days_since_last_order,customer_since,tenure_days,tenure_months,"
    "active_months,status,segment,health_score,"
    "recency_score,frequency_score,monetary_score,rfm_label,"
    "has_machine,machine_model,machine_acquisition_date,"
    "machine_to_capsule_conversion_status,channel,"
    "top_product_types,top_item_title,capsule_aov,"
    "avg_capsule_packs_per_month,expected_next_order_date,"
    "top_flavors,format_preferences,never_bought_capsules_flag,"
    "favorite_intensity,intensity_bucket,avg_capsule_price,capsule_price_range,"
    "bought_capsule_categories,never_bought_capsule_categories,"
    "avg_return_interval_days,median_return_interval_days,"
    "return_period_label,expected_return_window_start,"
    "expected_return_window_end,churn_reason,recommended_next_machine,"
    "delivery_vs_pickup_preference,"
    "promo_orders,promo_spend,full_price_spend,promo_share,"
    "capital_vs_regional,ecommerce_share,brand_store_share,"
    "beverage_type_preference,bible_match_rate,"
    "never_ordered,is_registered,customer_created_at"
)


@router.get("", response_model=Page[PortfolioSummary])
async def list_portfolios(
    q: str | None = None,
    status: str | None = None,
    segment: str | None = None,
    region: str | None = None,
    channel: str | None = None,
    has_machine: bool | None = None,
    no_machine: bool | None = None,
    machine_no_capsules: bool | None = None,
    email_consent: bool | None = None,
    sms_consent: bool | None = None,
    any_consent: bool | None = None,
    promo_heavy: bool | None = None,
    never_ordered: bool | None = None,
    intensity_bucket: str | None = None,
    session_recency: str | None = None,   # "today"|"7d"|"30d"|"never"
    session_action: str | None = None,    # "carted_never_bought"|"cart_abandoner"|"checkout_abandoner"|"converted"
    warm: bool | None = None,
    sort: str = "last_order_at",
    desc: bool = True,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=200)] = 50,
    sb=Depends(get_supabase),
) -> Page[PortfolioSummary]:
    _VALID_RECENCY = {"today", "7d", "30d", "never"}
    recency = session_recency if session_recency in _VALID_RECENCY else None
    use_session_sort = (sort == "last_session")
    sort_col = sort if sort in _SORTABLE else "last_order_at"
    offset = (page - 1) * page_size

    query = sb.table("portfolio_customers").select(_LIST_COLS, count="exact")

    if not never_ordered:
        query = query.eq("never_ordered", False)

    if status:
        query = query.eq("status", status)
    if segment:
        query = query.eq("segment", segment)
    if region:
        query = query.eq("region", region)
    if channel:
        query = query.eq("channel", channel)
    if has_machine is not None:
        query = query.eq("has_machine", has_machine)
    if no_machine is True:
        query = query.eq("has_machine", False)
    if machine_no_capsules is True:
        query = query.eq("has_machine", True).eq("machine_to_capsule_conversion_status", "machine_only_no_capsules")
    if email_consent is not None:
        query = query.eq("accept_marketing_email", email_consent)
    if sms_consent is not None:
        query = query.eq("sms_marketing", sms_consent)
    if any_consent is True:
        query = query.or_("accept_marketing_email.eq.true,sms_marketing.eq.true")
    if promo_heavy is True:
        query = query.gte("promo_share", 0.6)
    if never_ordered is True:
        query = query.eq("never_ordered", True)
    if intensity_bucket:
        query = query.eq("intensity_bucket", intensity_bucket)
    if q and q.strip():
        # Strip SQL wildcards to prevent injection through ilike patterns
        safe = q.strip().replace("%", "").replace("_", "")
        query = query.or_(
            f"full_name.ilike.%{safe}%,email.ilike.%{safe}%,phone.ilike.%{safe}%"
        )

    # ── Session recency / warm pre-filter (two-pass via shopify_customer_behavior) ──
    # The behavior table has ~60-70 rows so these pre-fetches are always fast.
    if recency == "never":
        # Return only customers with no session record at all.
        all_beh = (
            sb.table("shopify_customer_behavior")
            .select("customer_id")
            .execute()
        )
        has_session_cids = [int(r["customer_id"]) for r in (all_beh.data or [])]
        if has_session_cids:
            query = query.not_.in_("shopify_customer_id", has_session_cids)
    elif recency or warm:
        beh_q = sb.table("shopify_customer_behavior").select(
            "customer_id,sessions_7d,sessions_30d,last_session_at,days_since_last_session"
        )
        if recency == "today":
            today_str = (
                datetime.now(_TZ_TBS)
                .replace(hour=0, minute=0, second=0, microsecond=0)
                .isoformat()
            )
            beh_q = beh_q.gte("last_session_at", today_str)
        elif recency == "7d":
            beh_q = beh_q.gt("sessions_7d", 0)
        elif recency == "30d":
            beh_q = beh_q.gt("sessions_30d", 0)
        if warm:
            beh_q = (
                beh_q
                .not_.is_("days_since_last_session", "null")
                .lte("days_since_last_session", 3)
            )
        beh_res = beh_q.execute()
        include_cids = [int(r["customer_id"]) for r in (beh_res.data or [])]
        if not include_cids:
            return Page[PortfolioSummary](items=[], total=0, page=page, page_size=page_size)
        query = query.in_("shopify_customer_id", include_cids)
        if warm:
            # Apply the order-recency half of warm on the portfolio side (mirrors _merge_behavior).
            query = query.or_(
                "days_since_last_order.is.null,"
                "days_since_last_order.gt.7,"
                "never_ordered.eq.true"
            )

    # ── Session action filter (two-pass via shopify_customer_behavior) ──
    _VALID_SESSION_ACTION = {"carted_never_bought", "cart_abandoner", "checkout_abandoner", "converted"}
    if session_action and session_action in _VALID_SESSION_ACTION:
        sa_q = sb.table("shopify_customer_behavior").select("customer_id")
        if session_action == "carted_never_bought":
            sa_q = sa_q.gt("sessions_with_cart", 0).eq("ever_paid_session", False)
        elif session_action == "cart_abandoner":
            sa_q = sa_q.gt("cart_or_checkout_abandons", 0)
        elif session_action == "checkout_abandoner":
            sa_q = sa_q.gt("checkout_abandons", 0)
        elif session_action == "converted":
            sa_q = sa_q.eq("ever_paid_session", True)
        sa_res = sa_q.execute()
        sa_cids = [int(r["customer_id"]) for r in (sa_res.data or [])]
        if not sa_cids:
            return Page[PortfolioSummary](items=[], total=0, page=page, page_size=page_size)
        query = query.in_("shopify_customer_id", sa_cids)

    # ── Execute ────────────────────────────────────────────────────────
    if use_session_sort:
        # last_session_at lives in shopify_customer_behavior, not the matview, so we
        # sort in Python after loading all matching rows (dataset is small enough).
        beh_order_res = (
            sb.table("shopify_customer_behavior")
            .select("customer_id,last_session_at")
            .execute()
        )
        beh_ts = {
            int(r["customer_id"]): r["last_session_at"]
            for r in (beh_order_res.data or [])
        }
        all_result = query.range(0, 9999).execute()
        all_rows = all_result.data or []

        def _sess_key(r: dict) -> tuple:
            ts = beh_ts.get(r["shopify_customer_id"])
            return (ts or "", bool(ts))

        all_rows.sort(key=_sess_key, reverse=True)
        page_rows = all_rows[offset : offset + page_size]
        items = [PortfolioSummary(**row) for row in page_rows]
        total = all_result.count or len(all_rows)
    else:
        result = (
            query
            .order(sort_col, desc=desc, nullsfirst=False)
            .range(offset, offset + page_size - 1)
            .execute()
        )
        items = [PortfolioSummary(**row) for row in (result.data or [])]
        total = result.count or 0

    if items:
        items = _merge_behavior(sb, items)

    return Page[PortfolioSummary](
        items=items,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/{customer_id}", response_model=PortfolioDetail)
async def get_portfolio(
    customer_id: int,
    sb=Depends(get_supabase),
) -> PortfolioDetail:
    summary_res = (
        sb.table("portfolio_customers")
        .select("*")
        .eq("shopify_customer_id", customer_id)
        .limit(1)
        .execute()
    )
    if not summary_res.data:
        raise HTTPException(status_code=404, detail="Customer not found.")
    row = summary_res.data[0]

    orders_res = (
        sb.table("meama_georgia_orders")
        .select(
            "shopify_order_id,processed_at,total,source,"
            "discount_code,discount_amount"
        )
        .eq("customer_id", customer_id)
        .neq("financial_status", "voided")
        .is_("cancelled_at", "null")
        .in_("source", ["web", "online_store", "Online Store", "195189899265", "shopify_draft_order", "pos"])
        .order("processed_at", desc=True)
        .limit(20)
        .execute()
    )

    recent_orders = [OrderRow(**o) for o in (orders_res.data or [])]
    detail = PortfolioDetail(**row, recent_orders=recent_orders)
    enriched = _merge_behavior(sb, [detail])
    return enriched[0]


@router.get("/{customer_id}/page-journey", response_model=PageJourneyResponse)
async def get_page_journey(
    customer_id: int,
    sb=Depends(get_supabase),
) -> PageJourneyResponse:
    from collections import Counter

    cutoff = (datetime.now(UTC) - timedelta(days=30)).isoformat()
    res = (
        sb.table("customer_page_journey")
        .select("path,page_label,page_category,time_on_page_sec,engagement_level,occurred_at")
        .eq("customer_id", str(customer_id))
        .gte("occurred_at", cutoff)
        .order("occurred_at", desc=True)
        .limit(50)
        .execute()
    )
    rows = res.data or []

    if not rows:
        return PageJourneyResponse(
            pages=[],
            total_pages_visited=0,
            avg_time_on_page_sec=0.0,
            most_visited_category="",
            exit_page=None,
        )

    total = len(rows)
    timed = [float(r["time_on_page_sec"]) for r in rows if r.get("time_on_page_sec") is not None]
    avg_time = sum(timed) / len(timed) if timed else 0.0

    cat_counts: Counter[str] = Counter(r["page_category"] for r in rows if r.get("page_category"))
    most_visited_cat = cat_counts.most_common(1)[0][0] if cat_counts else ""

    exit_rows = [r for r in rows if r.get("engagement_level") == "exit"]
    exit_page = exit_rows[0]["path"] if exit_rows else None
    exit_page_label = exit_rows[0].get("page_label") or None if exit_rows else None

    pages = [PageJourneyEntry(**r) for r in rows]

    return PageJourneyResponse(
        pages=pages,
        total_pages_visited=total,
        avg_time_on_page_sec=round(avg_time, 1),
        most_visited_category=most_visited_cat,
        exit_page=exit_page,
        exit_page_label=exit_page_label,
    )

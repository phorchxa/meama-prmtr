"""09 Portfolios — customer list + 360 detail.

Reads the `portfolio_customers` materialized view (see 0004_portfolio_view.sql).
All filtering, sorting, and pagination happen server-side via PostgREST.
"""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query

from ..deps import get_supabase
from ..schemas.common import Page
from ..schemas.portfolios import OrderRow, PortfolioDetail, PortfolioSummary

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
    "favorite_intensity,avg_capsule_price,capsule_price_range,"
    "bought_capsule_categories,never_bought_capsule_categories,"
    "avg_return_interval_days,median_return_interval_days,"
    "return_period_label,expected_return_window_start,"
    "expected_return_window_end,churn_reason,recommended_next_machine,"
    "delivery_vs_pickup_preference,"
    "promo_orders,promo_spend,full_price_spend,promo_share,"
    "capital_vs_regional,ecommerce_share,brand_store_share,"
    "is_registered,customer_created_at"
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
    email_consent: bool | None = None,
    sms_consent: bool | None = None,
    any_consent: bool | None = None,
    promo_heavy: bool | None = None,
    sort: str = "last_order_at",
    desc: bool = True,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=200)] = 50,
    sb=Depends(get_supabase),
) -> Page[PortfolioSummary]:
    sort_col = sort if sort in _SORTABLE else "last_order_at"
    offset = (page - 1) * page_size

    query = sb.table("portfolio_customers").select(_LIST_COLS, count="exact")

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
    if email_consent is not None:
        query = query.eq("accept_marketing_email", email_consent)
    if sms_consent is not None:
        query = query.eq("sms_marketing", sms_consent)
    if any_consent is True:
        query = query.or_("accept_marketing_email.eq.true,sms_marketing.eq.true")
    if promo_heavy is True:
        query = query.gte("promo_share", 0.6)
    if q and q.strip():
        # Strip SQL wildcards to prevent injection through ilike patterns
        safe = q.strip().replace("%", "").replace("_", "")
        query = query.or_(
            f"full_name.ilike.%{safe}%,email.ilike.%{safe}%,phone.ilike.%{safe}%"
        )

    query = query.order(sort_col, desc=desc).range(offset, offset + page_size - 1)
    result = query.execute()

    items = [PortfolioSummary(**row) for row in (result.data or [])]
    return Page[PortfolioSummary](
        items=items,
        total=result.count or 0,
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
        .in_("source", ["web", "pos", "195189899265"])
        .order("processed_at", desc=True)
        .limit(20)
        .execute()
    )

    recent_orders = [OrderRow(**o) for o in (orders_res.data or [])]
    return PortfolioDetail(**row, recent_orders=recent_orders)

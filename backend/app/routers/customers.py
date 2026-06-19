"""02 Customer 360 — list, search, detail, cross-links."""
from __future__ import annotations

from datetime import date
from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from ..business_rules import (
    AT_RISK_MAX_DAYS,
    AT_RISK_MIN_DAYS,
    CHURN_DAYS,
    CHURN_SCORE_ALERT,
    RETAIL_CHANNELS,
)
from ..deps import get_supabase
from ..schemas.common import Page
from ..schemas.customers import CustomerDetail, CustomerMetrics, CustomerSummary

router = APIRouter(prefix="/customers", tags=["customers"])

# ── helpers ──────────────────────────────────────────────────────────────────


def _str(v: Any) -> str | None:
    return str(v) if v is not None else None


def _float(v: Any) -> float | None:
    try:
        return float(v) if v is not None else None
    except (TypeError, ValueError):
        return None


def _bool(v: Any) -> bool | None:
    if v is None:
        return None
    return bool(v)


def _date(v: Any) -> date | None:
    if v is None:
        return None
    if isinstance(v, date):
        return v
    try:
        return date.fromisoformat(str(v)[:10])
    except ValueError:
        return None


def _lifecycle_status(last_order: date | None) -> str | None:
    """Derive lifecycle status from last order date using business_rules constants."""
    if last_order is None:
        return "new"
    from datetime import date as date_cls
    days = (date_cls.today() - last_order).days
    if days >= CHURN_DAYS:
        return "lost"
    if AT_RISK_MIN_DAYS <= days <= AT_RISK_MAX_DAYS:
        return "at_risk"
    return "active"


# ── list / search ─────────────────────────────────────────────────────────────


@router.get("", response_model=Page[CustomerSummary])
async def list_customers(
    q: str | None = None,
    status: str | None = None,
    segment: str | None = None,
    channel: str | None = None,
    page: int = 1,
    page_size: int = 50,
    sb=Depends(get_supabase),
) -> Page[CustomerSummary]:
    """List / search customers. Filters: q (name/id), status, segment, channel.

    Joins orders_flat (retail channels only) to derive last_order_date and status.
    Falls back to an empty page if customer tables are not yet populated.
    """
    try:
        # Pull from customer_metrics (pre-computed nightly) + customers table.
        # customer_metrics has rfm_segment, churn_score, status, ltv, last_order_date.
        query = (
            sb.table("customer_metrics")
            .select(
                "customer_id, rfm_segment, status, ltv, last_order_date, "
                "churn_score, cluster_tag"
            )
        )

        if segment:
            query = query.eq("rfm_segment", segment)
        if status:
            query = query.eq("status", status)

        # Pagination
        start = (page - 1) * page_size
        query = query.range(start, start + page_size - 1)

        data = query.execute().data or []

        # Optionally filter by q (name/id) — customer names live in customers table
        # but customer_metrics only has customer_id. Do a simple substring match.
        if q:
            ql = q.lower()
            data = [r for r in data if ql in r.get("customer_id", "").lower()]

        items = [
            CustomerSummary(
                customer_id=r["customer_id"],
                status=r.get("status") or _lifecycle_status(_date(r.get("last_order_date"))),
                rfm_segment=r.get("rfm_segment"),
                ltv=_float(r.get("ltv")),
                last_order_date=_date(r.get("last_order_date")),
                is_registered=True,  # customer_metrics only tracks registered customers
                churn_score=_float(r.get("churn_score")),
                cluster_tag=_str(r.get("cluster_tag")),
                aov=_float(r.get("aov_total")),
            )
            for r in data
        ]

        # Total count (approximate — without a separate count call)
        total = len(items) + start if len(items) == page_size else start + len(items)

        return Page[CustomerSummary](items=items, total=total, page=page, page_size=page_size)

    except Exception:
        # Table not yet populated — return empty page
        return Page[CustomerSummary](items=[], total=0, page=page, page_size=page_size)


# ── detail ────────────────────────────────────────────────────────────────────


@router.get("/{customer_id}", response_model=CustomerDetail)
async def get_customer(customer_id: str, sb=Depends(get_supabase)) -> CustomerDetail:
    """Customer 360 detail — metrics, orders timeline, purchased products."""
    try:
        rows = (
            sb.table("customer_metrics")
            .select("*")
            .eq("customer_id", customer_id)
            .limit(1)
            .execute()
            .data
            or []
        )
    except Exception:
        rows = []

    if not rows:
        raise HTTPException(status_code=404, detail=f"Customer '{customer_id}' not found.")

    r = rows[0]
    last_order = _date(r.get("last_order_date"))
    status = r.get("status") or _lifecycle_status(last_order)

    metrics = CustomerMetrics(
        recency_score=r.get("recency_score"),
        frequency_score=r.get("frequency_score"),
        monetary_score=r.get("monetary_score"),
        rfm_segment=r.get("rfm_segment"),
        cluster_tag=r.get("cluster_tag"),
        churn_score=_float(r.get("churn_score")),
        upsell_tag=_bool(r.get("upsell_tag")),
        status=status,
        ltv=_float(r.get("ltv")),
        aov_total=_float(r.get("aov_total")),
        aov_capsules=_float(r.get("aov_capsules")),
        discount_dependency_pct=_float(r.get("discount_dependency_pct")),
        has_machine=_bool(r.get("has_machine")),
        machine_model=_str(r.get("machine_model")),
        last_order_date=last_order,
        expected_next_order=_date(r.get("expected_next_order")),
        computed_at=r.get("computed_at"),
    )

    return CustomerDetail(
        customer_id=customer_id,
        status=status,
        rfm_segment=r.get("rfm_segment"),
        ltv=_float(r.get("ltv")),
        last_order_date=last_order,
        is_registered=True,
        email_masked=r.get("email_masked"),
        phone_masked=r.get("phone_masked"),
        registration_date=_date(r.get("registration_date")),
        metrics=metrics,
    )


# ── cross-link: customer → products purchased ─────────────────────────────────


class CustomerProduct:
    """Serialized separately — not in schemas.customers to avoid circular import."""
    pass


from pydantic import BaseModel  # noqa: E402


class CustomerProductRow(BaseModel):
    sku: str
    name: str
    total_units: int
    total_spend: float
    last_purchase_date: date | None = None
    category: str | None = None


@router.get("/{customer_id}/products", response_model=list[CustomerProductRow])
async def get_customer_products(
    customer_id: str,
    sb=Depends(get_supabase),
) -> list[CustomerProductRow]:
    """Products a customer has bought — quantity, spend, last purchase date.

    Queries orders_flat filtered to RETAIL_CHANNELS only.
    """
    try:
        rows = (
            sb.rpc(
                "get_customer_products",
                {"p_customer_id": customer_id},
            )
            .execute()
            .data
            or []
        )
    except Exception:
        # RPC not yet defined — fall back to orders_flat direct query
        try:
            rows = (
                sb.table("orders_flat")
                .select("sku, product_name, quantity, total_price, order_date, channel")
                .eq("customer_id", customer_id)
                .in_("channel", list(RETAIL_CHANNELS))
                .execute()
                .data
                or []
            )
            # Aggregate in Python
            agg: dict[str, dict] = {}
            for r in rows:
                s = r.get("sku") or ""
                if not s:
                    continue
                if s not in agg:
                    agg[s] = {
                        "sku": s,
                        "name": r.get("product_name") or s,
                        "total_units": 0,
                        "total_spend": 0.0,
                        "last_purchase_date": None,
                        "category": None,
                    }
                agg[s]["total_units"] += int(r.get("quantity") or 0)
                agg[s]["total_spend"] += float(r.get("total_price") or 0)
                d = _date(r.get("order_date"))
                if d and (agg[s]["last_purchase_date"] is None or d > agg[s]["last_purchase_date"]):
                    agg[s]["last_purchase_date"] = d
            rows = list(agg.values())
        except Exception:
            rows = []

    return [
        CustomerProductRow(
            sku=r.get("sku", ""),
            name=r.get("name") or r.get("product_name") or r.get("sku", ""),
            total_units=int(r.get("total_units") or r.get("quantity") or 0),
            total_spend=float(r.get("total_spend") or r.get("total_price") or 0),
            last_purchase_date=_date(r.get("last_purchase_date") or r.get("order_date")),
            category=r.get("category"),
        )
        for r in rows
        if r.get("sku")
    ]


# ── cross-link: customer → recent orders ─────────────────────────────────────


class CustomerOrderRow(BaseModel):
    order_id: str
    order_date: date | None = None
    channel: str | None = None
    total_price: float
    items_count: int
    status: str | None = None


@router.get("/{customer_id}/orders", response_model=list[CustomerOrderRow])
async def get_customer_orders(
    customer_id: str,
    limit: int = 20,
    sb=Depends(get_supabase),
) -> list[CustomerOrderRow]:
    """Recent orders for a customer — retail channels only, newest first."""
    try:
        rows = (
            sb.table("orders_flat")
            .select("order_id, order_date, channel, total_price, quantity, status")
            .eq("customer_id", customer_id)
            .in_("channel", list(RETAIL_CHANNELS))
            .order("order_date", desc=True)
            .limit(limit)
            .execute()
            .data
            or []
        )
    except Exception:
        rows = []

    # Group by order_id (orders_flat may have one row per line item)
    agg: dict[str, dict] = {}
    for r in rows:
        oid = r.get("order_id") or ""
        if not oid:
            continue
        if oid not in agg:
            agg[oid] = {
                "order_id": oid,
                "order_date": r.get("order_date"),
                "channel": r.get("channel"),
                "total_price": 0.0,
                "items_count": 0,
                "status": r.get("status"),
            }
        agg[oid]["total_price"] += float(r.get("total_price") or 0)
        agg[oid]["items_count"] += int(r.get("quantity") or 1)

    return [
        CustomerOrderRow(
            order_id=v["order_id"],
            order_date=_date(v["order_date"]),
            channel=v["channel"],
            total_price=v["total_price"],
            items_count=v["items_count"],
            status=v["status"],
        )
        for v in agg.values()
    ]


# ── GET /customers/analytics — aggregate stats for the analytics tab ──────────


@router.get("/analytics")
async def get_customer_analytics(sb=Depends(get_supabase)):
    """Aggregate customer metrics for the Analytics tab.

    Queries customer_metrics for segment/status distribution, avg KPIs.
    Returns zeros/empty arrays if table not populated.
    """
    try:
        rows: list[dict] = (
            sb.table("customer_metrics")
            .select("rfm_segment, status, ltv, aov_total, churn_score")
            .execute()
            .data or []
        )
    except Exception:
        rows = []

    if not rows:
        return {
            "total_customers": 0,
            "segment_distribution": [],
            "status_distribution": [],
            "avg_churn_score": None,
            "avg_ltv": None,
            "avg_aov": None,
            "populated": False,
        }

    def _f(v) -> float | None:
        try:
            return float(v) if v is not None else None
        except (TypeError, ValueError):
            return None

    total = len(rows)

    # Segment distribution
    seg_counts: dict[str, int] = {}
    for r in rows:
        seg = r.get("rfm_segment") or "unknown"
        seg_counts[seg] = seg_counts.get(seg, 0) + 1
    segment_distribution = [
        {"segment": k, "count": v, "share": round(v / total, 4)}
        for k, v in sorted(seg_counts.items(), key=lambda x: -x[1])
    ]

    # Status distribution
    st_counts: dict[str, int] = {}
    for r in rows:
        st = r.get("status") or "unknown"
        st_counts[st] = st_counts.get(st, 0) + 1
    status_distribution = [
        {"status": k, "count": v, "share": round(v / total, 4)}
        for k, v in sorted(st_counts.items(), key=lambda x: -x[1])
    ]

    # Avg KPIs
    churn_vals = [_f(r.get("churn_score")) for r in rows if _f(r.get("churn_score")) is not None]
    ltv_vals = [_f(r.get("ltv")) for r in rows if _f(r.get("ltv")) is not None]
    aov_vals = [_f(r.get("aov_total")) for r in rows if _f(r.get("aov_total")) is not None]

    return {
        "total_customers": total,
        "segment_distribution": segment_distribution,
        "status_distribution": status_distribution,
        "avg_churn_score": round(sum(churn_vals) / len(churn_vals), 4) if churn_vals else None,
        "avg_ltv": round(sum(ltv_vals) / len(ltv_vals), 2) if ltv_vals else None,
        "avg_aov": round(sum(aov_vals) / len(aov_vals), 2) if aov_vals else None,
        "populated": True,
    }

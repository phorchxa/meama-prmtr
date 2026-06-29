"""KPI router — sales channel metrics, current vs previous month."""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends

from ..deps import get_supabase

router = APIRouter(prefix="/kpi", tags=["kpi"])


def _month_range(offset: int = 0) -> tuple[str, str]:
    """Return (ISO start, ISO end) for the month `offset` months before today."""
    now = datetime.now(timezone.utc)
    month = now.month - offset
    year = now.year
    while month <= 0:
        month += 12
        year -= 1
    next_m = month + 1
    next_y = year
    if next_m > 12:
        next_m = 1
        next_y += 1
    start = datetime(year, month, 1, tzinfo=timezone.utc)
    end = datetime(next_y, next_m, 1, tzinfo=timezone.utc)
    return start.isoformat(), end.isoformat()


def _delta(cur: float | None, prev: float | None) -> float | None:
    if cur is None or prev is None or prev == 0:
        return None
    return round((cur - prev) / abs(prev) * 100, 2)


def _metric(cur: float | None, prev: float | None) -> dict:
    c = float(cur) if cur is not None else None
    p = float(prev) if prev is not None else None
    return {"current": c, "previous": p, "delta_pct": _delta(c, p)}


def _build_channel(cur: dict, prev: dict) -> dict:
    keys = set(cur) | set(prev)
    return {k: _metric(cur.get(k), prev.get(k)) for k in sorted(keys)}


@router.get("/sales-channels")
async def sales_channels_kpi(sb=Depends(get_supabase)):
    """Real KPIs for Ecommerce, Brand Stores, Call Sales — current vs previous month."""
    cur_start, cur_end = _month_range(0)
    prv_start, prv_end = _month_range(1)

    def _rpc(fn: str, start: str, end: str) -> dict:
        res = sb.rpc(fn, {"p_from": start, "p_to": end}).execute()
        rows = res.data or []
        return rows[0] if rows else {}

    # current month
    c_ecom  = _rpc("kpi_ecommerce",   cur_start, cur_end)
    c_sess  = _rpc("kpi_sessions",    cur_start, cur_end)
    c_store = _rpc("kpi_brand_stores", cur_start, cur_end)
    c_call  = _rpc("kpi_call_sales",  cur_start, cur_end)

    # previous month
    p_ecom  = _rpc("kpi_ecommerce",   prv_start, prv_end)
    p_sess  = _rpc("kpi_sessions",    prv_start, prv_end)
    p_store = _rpc("kpi_brand_stores", prv_start, prv_end)
    p_call  = _rpc("kpi_call_sales",  prv_start, prv_end)

    return {
        "period": {
            "current":  {"from": cur_start[:10], "to": cur_end[:10]},
            "previous": {"from": prv_start[:10], "to": prv_end[:10]},
        },
        "ecommerce":   _build_channel({**c_ecom, **c_sess}, {**p_ecom, **p_sess}),
        "brand_stores": _build_channel(c_store, p_store),
        "call_sales":  _build_channel(c_call,  p_call),
    }

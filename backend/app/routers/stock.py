"""04 Stock — stock_quantity from products_master + velocity from get_product_stats RPC."""
from __future__ import annotations

import time
from typing import Any

from fastapi import APIRouter, Depends, Response

from ..business_rules import LOW_STOCK_WEEKS, REORDER_POINT_DAYS
from ..deps import get_supabase

router = APIRouter(prefix="/stock", tags=["stock"])

_CACHE_TTL = 300
_cache: dict[str, Any] = {"ts": 0.0, "data": None}

_EXCLUDE_CATEGORIES = {"Shipping", "Test", "None", None}


def _float0(v) -> float:
    try:
        return float(v) if v is not None else 0.0
    except (TypeError, ValueError):
        return 0.0


@router.get("")
async def get_stock(low_stock_only: bool = False, sb=Depends(get_supabase), response: Response = None):
    """Stock levels: stock_quantity from products_master, velocity from get_product_stats RPC.

    velocity_per_day = units_30d (from RPC) / 30
    weeks_of_cover   = stock_quantity / (velocity_per_day * 7)
    status: critical < 2w, low 2–3.99w, ok >= 4w
    Sorted: critical first, then weeks_of_cover ascending.
    """
    if _cache["data"] and (time.time() - float(_cache["ts"])) < _CACHE_TTL:
        data = _cache["data"]
        if low_stock_only:
            return {**data, "items": [i for i in data["items"] if i["status"] in ("critical", "low")]}
        return data

    # ── 1. Stock quantities from products_master ──────────────────────────────
    try:
        products_raw: list[dict] = (
            sb.table("products_master")
            .select("sku, name, name_en, category, stock_quantity, "
                    "price_b2c, price_brand_shop, price_marketplace")
            .execute()
            .data or []
        )
    except Exception:
        products_raw = []

    # ── 2. Sales velocity from the same RPC the products router uses ──────────
    try:
        stats_raw: list[dict] = sb.rpc("get_product_stats").execute().data or []
    except Exception:
        stats_raw = []
    stats_map = {r["sku"]: r for r in stats_raw}

    items: list[dict] = []
    for p in products_raw:
        cat = p.get("category")
        if cat in _EXCLUDE_CATEGORIES:
            continue
        sq = p.get("stock_quantity")
        if sq is None:
            continue

        sq_f = float(sq)
        st = stats_map.get(p["sku"], {})
        units_30d = _float0(st.get("units_30d"))
        velocity_per_day = units_30d / 30.0

        # Skip inactive products: no stock AND no recent sales → discontinued
        if sq_f == 0 and velocity_per_day == 0:
            continue

        if velocity_per_day > 0:
            weeks_of_cover = sq_f / (velocity_per_day * 7)
        elif sq_f > 0:
            weeks_of_cover = 99.9  # stock with no recent sales → surplus
        else:
            weeks_of_cover = 0.0

        if weeks_of_cover < LOW_STOCK_WEEKS:
            status = "critical"
        elif weeks_of_cover < LOW_STOCK_WEEKS * 2:
            status = "low"
        else:
            status = "ok"

        reorder_point = round(velocity_per_day * REORDER_POINT_DAYS, 1) if velocity_per_day > 0 else 0.0

        price = None
        for k in ("price_b2c", "price_brand_shop", "price_marketplace"):
            v = p.get(k)
            if v is not None:
                try:
                    price = float(v)
                    break
                except (TypeError, ValueError):
                    pass

        items.append({
            "sku": p.get("sku", ""),
            "name": p.get("name_en") or p.get("name") or p.get("sku", ""),
            "category": cat or "Other",
            "units_on_hand": int(sq_f),
            "velocity_per_day": round(velocity_per_day, 2),
            "weeks_of_cover": round(min(weeks_of_cover, 99.9), 2),
            "reorder_point": reorder_point,
            "status": status,
            "price": price,
        })

    STATUS_ORDER = {"critical": 0, "low": 1, "ok": 2}
    items.sort(key=lambda x: (STATUS_ORDER.get(x["status"], 3), x["weeks_of_cover"]))

    result = {
        "items": items,
        "critical_count": sum(1 for i in items if i["status"] == "critical"),
        "low_stock_count": sum(1 for i in items if i["status"] == "low"),
        "total": len(items),
    }
    _cache["ts"] = time.time()
    _cache["data"] = result
    if response:
        response.headers["Cache-Control"] = "s-maxage=300, stale-while-revalidate=60"
    if low_stock_only:
        return {**result, "items": [i for i in items if i["status"] in ("critical", "low")]}
    return result

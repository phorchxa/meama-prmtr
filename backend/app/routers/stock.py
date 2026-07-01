"""04 Stock — on-hand balance from fina_stock + velocity from get_product_stats RPC."""
from __future__ import annotations

import asyncio
from concurrent.futures import ThreadPoolExecutor

from fastapi import APIRouter, Depends, Response

from ..business_rules import LOW_STOCK_WEEKS, REORDER_POINT_DAYS
from ..deps import get_supabase
from ..services.cache import SWRCache
from ..services.catalog import clean_category, dedupe_geo, fetch_fina_stock

router = APIRouter(prefix="/stock", tags=["stock"])

_CACHE_TTL = 60  # "fresh" cutoff — favor fresh data over speed (user request);
# stale entries are served instantly and refreshed in the background (SWRCache)
_cache: SWRCache[dict] = SWRCache(ttl=_CACHE_TTL)


def _float0(v) -> float:
    try:
        return float(v) if v is not None else 0.0
    except (TypeError, ValueError):
        return 0.0


async def _build_stock(sb) -> dict:
    # ── 1. Catalog from products_georgia (deduped by variant_sku) — display
    # metadata only; NOT the stock source (products_georgia.inventory_quantity
    # is stale/unreliable — Fina is the source of truth for on-hand balance).
    def _geo() -> list[dict]:
        try:
            return (
                sb.table("products_georgia")
                .select("variant_sku, title, product_type, status, variant_price")
                .execute()
                .data or []
            )
        except Exception:
            return []

    def _stats() -> list[dict]:
        try:
            return sb.rpc("get_product_stats").execute().data or []
        except Exception:
            return []

    loop = asyncio.get_event_loop()
    with ThreadPoolExecutor(max_workers=3) as pool:
        geo_fut = loop.run_in_executor(pool, _geo)
        stats_fut = loop.run_in_executor(pool, _stats)
        stock_fut = loop.run_in_executor(pool, fetch_fina_stock, sb)
        geo_raw, stats_raw, fina_stock = await asyncio.gather(geo_fut, stats_fut, stock_fut)

    geo_map = dedupe_geo(geo_raw)
    stats_map = {r["sku"]: r for r in stats_raw}

    items: list[dict] = []
    for sku, p in geo_map.items():
        # ── 2. Stock on hand from fina_stock.sul_nashti, keyed by product_code
        # == products_georgia.variant_sku == order_items.sku (Fina = source of truth).
        sq = fina_stock.get(sku)
        if sq is None:
            continue

        sq_f = float(sq)
        st = stats_map.get(sku, {})
        units_30d = _float0(st.get("units_30d"))
        velocity_per_day = units_30d / 30.0

        # Skip inactive products: no stock AND no recent sales → discontinued
        if sq_f <= 0 and velocity_per_day == 0:
            continue

        if velocity_per_day > 0:
            weeks_of_cover = sq_f / (velocity_per_day * 7) if sq_f > 0 else 0.0
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

        category = clean_category(p.get("product_type")) or "Other"
        price = _float0(p.get("variant_price")) or None
        name = (p.get("title") or "").strip() or (st.get("last_title") or "").strip() or sku

        items.append({
            "sku": sku,
            "name": name,
            "category": category,
            "units_on_hand": int(sq_f),
            "velocity_per_day": round(velocity_per_day, 2),
            "weeks_of_cover": round(min(weeks_of_cover, 99.9), 2),
            "reorder_point": reorder_point,
            "status": status,
            "price": price,
        })

    STATUS_ORDER = {"critical": 0, "low": 1, "ok": 2}
    items.sort(key=lambda x: (STATUS_ORDER.get(x["status"], 3), x["weeks_of_cover"]))

    return {
        "items": items,
        "critical_count": sum(1 for i in items if i["status"] == "critical"),
        "low_stock_count": sum(1 for i in items if i["status"] == "low"),
        "total": len(items),
    }


@router.get("")
async def get_stock(low_stock_only: bool = False, sb=Depends(get_supabase), response: Response = None):
    """Stock levels: on-hand balance from fina_stock.sul_nashti (Fina is the
    source of truth), keyed to products_georgia.variant_sku for display
    metadata (deduped to one canonical row per SKU); velocity from
    get_product_stats RPC.

    velocity_per_day = units_30d (from RPC) / 30
    weeks_of_cover   = inventory / (velocity_per_day * 7)
    status: critical < 2w, low 2–3.99w, ok >= 4w
    Sorted: critical first, then weeks_of_cover ascending.
    """
    data = await _cache.get("default", lambda: _build_stock(sb))
    if response:
        response.headers["Cache-Control"] = "s-maxage=300, stale-while-revalidate=60"
    if low_stock_only:
        return {**data, "items": [i for i in data["items"] if i["status"] in ("critical", "low")]}
    return data

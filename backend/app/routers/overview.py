"""01 Command Overview — real KPIs aggregated from the same RPCs as the products router."""
from __future__ import annotations

from datetime import date, timedelta

from fastapi import APIRouter, Depends, Response

from ..business_rules import LOW_STOCK_WEEKS, REORDER_POINT_DAYS, RETAIL_CHANNELS
from ..deps import get_supabase
from ..services.cache import SWRCache
from ..services.catalog import clean_category, dedupe_geo, fetch_fina_stock

router = APIRouter(prefix="/overview", tags=["overview"])

_CACHE_TTL = 60  # "fresh" cutoff — favor fresh data over speed (user request);
# stale entries are served instantly and refreshed in the background (SWRCache)
_cache: SWRCache[dict] = SWRCache(ttl=_CACHE_TTL)


def _float0(v) -> float:
    try:
        return float(v) if v is not None else 0.0
    except (TypeError, ValueError):
        return 0.0


def _int0(v) -> int:
    try:
        return int(v) if v is not None else 0
    except (TypeError, ValueError):
        return 0


async def _build_overview(sb) -> dict:
    # ── 1. Catalog metadata from products_georgia (deduped by variant_sku) ────
    try:
        geo_raw: list[dict] = (
            sb.table("products_georgia")
            .select("variant_sku, title, product_type, status, variant_price, "
                    "cost_per_item, inventory_quantity")
            .execute()
            .data or []
        )
    except Exception:
        geo_raw = []
    geo_map = dedupe_geo(geo_raw)

    # ── 2. Sales stats from RPC (same as products router) ────────────────────
    try:
        stats_raw: list[dict] = sb.rpc("get_product_stats").execute().data or []
    except Exception:
        stats_raw = []
    stats_map = {r["sku"]: r for r in stats_raw}

    # ── 3. New metrics: total_revenue (vending filter) + avg_monthly_consumption ─
    try:
        nm_raw: list[dict] = sb.rpc("get_product_new_metrics").execute().data or []
    except Exception:
        nm_raw = []
    nm_map = {r["sku"]: r for r in nm_raw}

    # ── 3b. Stock on hand from fina_stock (Fina = source of truth) ───────────
    fina_stock = fetch_fina_stock(sb)

    # ── 4. Aggregate KPIs — driven by SALES (every sku with retail revenue) ───
    total_skus = 0
    revenue_30d = 0.0
    units_30d = 0
    critical_skus = 0
    low_skus = 0
    cat_rev: dict[str, float] = {}
    margins: list[float] = []

    for sku in stats_map:
        st = stats_map.get(sku, {})
        nm = nm_map.get(sku, {})

        # Exclude ₾0-lifetime lines (vending dispenses / shipping / test).
        if _float0(nm.get("total_revenue")) <= 0:
            continue

        geo = geo_map.get(sku, {})
        total_skus += 1

        rev = _float0(st.get("revenue_30d"))
        units = _int0(st.get("units_30d"))
        revenue_30d += rev
        units_30d += units

        cat = clean_category(geo.get("product_type")) or "Other"
        cat_rev[cat] = cat_rev.get(cat, 0.0) + rev

        # Stock cover (stock from fina_stock)
        sq = fina_stock.get(sku)
        amc = _float0(nm.get("avg_monthly_consumption"))
        if sq is not None and amc > 0:
            months = float(sq) / amc
            weeks = months * 4.33
            if weeks < LOW_STOCK_WEEKS:
                critical_skus += 1
            elif weeks < LOW_STOCK_WEEKS * 2:
                low_skus += 1

        # Margin (cogs from products_georgia.cost_per_item)
        cogs = _float0(geo.get("cost_per_item"))
        price = _float0(geo.get("variant_price"))
        if cogs and price and price > 0:
            margins.append((price - cogs) / price)

    # None (not 0.0) when no COGS data — products_georgia.cost_per_item is
    # currently unpopulated, so showing "0%" on a margin tile would mislead.
    avg_margin = sum(margins) / len(margins) if margins else None
    top_cat = max(cat_rev, key=lambda k: cat_rev[k]) if cat_rev else None
    top_cat_pct = (cat_rev.get(top_cat, 0.0) / revenue_30d) if (top_cat and revenue_30d > 0) else 0.0

    # ── 5. Revenue trend from orders_flat (optional) ─────────────────────────
    revenue_trend_30d: list[dict] = []
    ecom_revenue = 0.0
    pos_revenue = 0.0
    try:
        since = (date.today() - timedelta(days=30)).isoformat()
        raw = (
            sb.table("orders_flat")
            .select("order_date, channel, total_price")
            .gte("order_date", since)
            .in_("channel", list(RETAIL_CHANNELS))
            .execute()
            .data or []
        )
        if raw:
            by_day: dict[str, float] = {}
            for r in raw:
                d = str(r.get("order_date") or "")[:10]
                if d:
                    by_day[d] = by_day.get(d, 0.0) + _float0(r.get("total_price"))
                ch = r.get("channel") or ""
                v = _float0(r.get("total_price"))
                if ch == "ecom":
                    ecom_revenue += v
                else:
                    pos_revenue += v
            revenue_trend_30d = [
                {"date": d, "revenue": round(v, 2)}
                for d, v in sorted(by_day.items())
            ]
    except Exception:
        revenue_trend_30d = []

    channel_total = ecom_revenue + pos_revenue
    ecom_pct = ecom_revenue / channel_total if channel_total > 0 else 0.0

    # ── 6. Recent open alerts ─────────────────────────────────────────────────
    alerts: list[dict] = []
    try:
        alerts = (
            sb.table("alerts")
            .select("id, type, severity, message, created_at, status")
            .eq("status", "open")
            .order("created_at", desc=True)
            .limit(5)
            .execute()
            .data or []
        )
    except Exception:
        alerts = []

    # ── 7. Actions: reorder items with critical stock ─────────────────────────
    actions: list[dict] = []
    for sku in stats_map:
        nm = nm_map.get(sku, {})
        if _float0(nm.get("total_revenue")) <= 0:
            continue
        geo = geo_map.get(sku, {})
        sq = fina_stock.get(sku)
        amc = _float0(nm.get("avg_monthly_consumption"))
        if sq is None or amc <= 0:
            continue
        months = float(sq) / amc
        weeks = months * 4.33
        if weeks < LOW_STOCK_WEEKS:
            st = stats_map.get(sku, {})
            velocity_day = _float0(st.get("units_30d")) / 30.0
            price = _float0(geo.get("variant_price"))
            display_name = (geo.get("title") or "").strip() or (st.get("last_title") or "").strip() or sku
            actions.append({
                "type": "reorder",
                "sku": sku,
                "title": f"Reorder {display_name}",
                "signal": f"{weeks:.1f} weeks of cover — below {LOW_STOCK_WEEKS}w floor",
                "severity": "critical",
                "est_impact_gel": round((price or 0) * velocity_day * REORDER_POINT_DAYS, 2),
                "to": "/stock",
            })
    actions.sort(key=lambda x: x.get("est_impact_gel", 0), reverse=True)

    result = {
        "kpis": {
            "total_skus": total_skus,
            "revenue_30d_gel": round(revenue_30d, 2),
            "units_30d": units_30d,
            "top_category": top_cat,
            "top_category_pct": round(top_cat_pct, 4),
            "avg_margin_pct": round(avg_margin, 4) if avg_margin is not None else None,
            "critical_stock_skus": critical_skus,
            "low_stock_skus": low_skus,
            "ecom_pct": round(ecom_pct, 4),
        },
        "revenue_trend_30d": revenue_trend_30d,
        "alerts": alerts,
        "actions": actions[:5],
    }
    return result


@router.get("")
async def get_overview(sb=Depends(get_supabase), response: Response = None):
    """Top-line KPIs from the same Supabase RPCs used by the products router.

    - revenue_30d / units_30d: from get_product_stats RPC (order_items.sku)
    - stock_quantity / cogs / price: from products_georgia (deduped by variant_sku)
    - revenue_trend_30d / alerts: from orders_flat / alerts tables (empty if ETL not run)
    """
    data = await _cache.get("default", lambda: _build_overview(sb))
    if response:
        response.headers["Cache-Control"] = "s-maxage=60, stale-while-revalidate=30"
    return data

"""03 Product Intelligence — merges all data sources into ProductSummary."""
from __future__ import annotations

import re
import time
from fastapi import APIRouter, Depends

from ..deps import get_supabase
from ..schemas.products import AffinityPair, ProductIntelligenceResponse, ProductSummary

router = APIRouter(prefix="/products", tags=["products"])

_CACHE_TTL = 300  # 5 minutes
_cache: dict[str, object] = {"ts": 0.0, "data": None}
_aff_cache: dict[str, object] = {"ts": 0.0, "data": None}

_EXCLUDE_CATEGORIES = {"Shipping", "Test", "None", None}

CATEGORY_DISPLAY: dict[str, str] = {
    "Multicapsule":                     "Multicapsule",
    "European":                         "European Format",
    "Classic\xa0Coffee":                "Classic Coffee",
    "Classic Coffee":                   "Classic Coffee",
    "BIO":                              "BIO",
    "Tea":                              "Tea",
    "Coffee Machine":                   "Machines",
    "Accessories":                      "Accessories",
    "Variety Pack":                     "Variety Packs",
    "Bundle":                           "Bundles",
    "Coffee Machine Replacement Parts": "Spare Parts",
    "Merch":                            "Merch",
    "Add On":                           "Add-Ons",
}


def _price(row: dict) -> float | None:
    for key in ("price_b2c", "price_brand_shop", "price_marketplace"):
        v = row.get(key)
        if v is not None:
            try:
                return float(v)
            except (TypeError, ValueError):
                pass
    return None


def _parse_caffeine_mg(raw: str | None) -> int | None:
    if not raw:
        return None
    m = re.search(r"(\d+)", raw)
    return int(m.group(1)) if m else None


def _float(v) -> float | None:
    try:
        return float(v) if v is not None else None
    except (TypeError, ValueError):
        return None


def _float0(v) -> float:
    return _float(v) or 0.0


def _int0(v) -> int:
    try:
        return int(v) if v is not None else 0
    except (TypeError, ValueError):
        return 0


@router.get("", response_model=ProductIntelligenceResponse)
async def get_product_intelligence(sb=Depends(get_supabase)) -> ProductIntelligenceResponse:
    if _cache["data"] and (time.time() - float(_cache["ts"])) < _CACHE_TTL:
        return _cache["data"]  # type: ignore[return-value]

    # ── 1. Products master ──────────────────────────────────────────────────
    products_raw: list[dict] = (
        sb.table("products_master")
        .select("sku, name, name_en, category, collection, price_b2c, price_brand_shop, "
                "price_marketplace, cogs, stock_quantity")
        .execute()
        .data or []
    )
    if not products_raw:
        return ProductIntelligenceResponse(products=[], affinities=[])

    product_map = {p["sku"]: p for p in products_raw}

    # ── 2. Product images ───────────────────────────────────────────────────
    try:
        geo_raw: list[dict] = (
            sb.table("products_georgia")
            .select("variant_sku, image_url")
            .not_.is_("image_url", "null")
            .execute()
            .data or []
        )
        image_map: dict[str, str] = {r["variant_sku"]: r["image_url"] for r in geo_raw if r.get("variant_sku")}
    except Exception:
        image_map = {}

    # ── 3. Bible enrichment ─────────────────────────────────────────────────
    try:
        bible_raw: list[dict] = (
            sb.table("Meama Products Bible").select("*").execute().data or []
        )
        bible_map: dict[str, dict] = {
            r["Fina Code"]: r for r in bible_raw if r.get("Fina Code")
        }
    except Exception:
        bible_map = {}

    # ── 4. Sales stats (30d + monthly series + repeat rate) ────────────────
    try:
        stats_raw: list[dict] = sb.rpc("get_product_stats").execute().data or []
    except Exception:
        stats_raw = []
    stats_map = {row["sku"]: row for row in stats_raw}

    # ── 5. Channel split ────────────────────────────────────────────────────
    try:
        ch_raw: list[dict] = sb.rpc("get_product_channel_stats").execute().data or []
    except Exception:
        ch_raw = []
    ch_map = {row["sku"]: row for row in ch_raw}

    # ── 6. Reorder + retention rates ───────────────────────────────────────
    try:
        rr_raw: list[dict] = sb.rpc("get_product_reorder_rates").execute().data or []
    except Exception:
        rr_raw = []
    rr_map = {row["sku"]: row for row in rr_raw}

    # ── 7. New metrics (totals, rankings, growth, margin, promo, consumption, refund)
    try:
        nm_raw: list[dict] = sb.rpc("get_product_new_metrics").execute().data or []
    except Exception:
        nm_raw = []
    nm_map = {row["sku"]: row for row in nm_raw}

    # ── 8. Top bundle partner ───────────────────────────────────────────────
    try:
        tb_raw: list[dict] = sb.rpc("get_product_top_bundles").execute().data or []
    except Exception:
        tb_raw = []
    tb_map = {row["sku"]: row for row in tb_raw}

    # ── 9. Build response ───────────────────────────────────────────────────
    result: list[ProductSummary] = []
    for sku, p in product_map.items():
        cat = p.get("category")
        if cat in _EXCLUDE_CATEGORIES:
            continue

        st  = stats_map.get(sku, {})
        ch  = ch_map.get(sku, {})
        rr  = rr_map.get(sku, {})
        nm  = nm_map.get(sku, {})
        tb  = tb_map.get(sku, {})
        bib = bible_map.get(sku, {})

        # Stock status: derived in DB from avg_monthly_consumption + stock_quantity.
        # If stock_quantity was set on this product, the new_metrics RPC returns it.
        # We also re-derive locally in case the function ran before the column was updated.
        stock_status: str | None = None
        sq = p.get("stock_quantity")
        amc = _float0(nm.get("avg_monthly_consumption"))
        if sq is not None and amc > 0:
            months = float(sq) / amc
            if months < 2:
                stock_status = "understock"
            elif months <= 3:
                stock_status = "in_stock"
            else:
                stock_status = "overstock"

        result.append(
            ProductSummary(
                sku=sku,
                name=p.get("name_en") or p.get("name") or sku,
                category=cat or "Other",
                subcategory=p.get("collection"),
                price=_price(p) or 0.0,
                cogs=_float(p.get("cogs")),
                # enrichment
                image_url=image_map.get(sku),
                caffeine=bib.get("Caffeine"),
                caffeine_mg=_parse_caffeine_mg(bib.get("Caffeine")),
                intensity_level=_float(bib.get("Intensity level")),
                bitterness=_float(bib.get("Bitternes")),
                arabica_pct=_float(bib.get("Arabica")),
                robusta_pct=_float(bib.get("Robusta")),
                flavor_profile=bib.get("Flavor Profile"),
                ingredients=bib.get("Contains"),
                beverage_type=bib.get("Beverage Type"),
                bio=bool(bib.get("Bio", False) or False),
                compatible_with=bib.get("Compatible with"),
                capsule_format=bib.get("Capsule Format"),
                hot_cold=bib.get("Hot / Cold"),
                # 30d + monthly
                units_sold_30d=_int0(st.get("units_30d")),
                revenue_30d=round(_float0(st.get("revenue_30d")), 2),
                monthly_units=[_int0(st.get(f"m{i}")) for i in range(12)],
                repeat_rate=round(_float0(st.get("repeat_rate")), 4),
                # channel
                units_30d_web=_int0(ch.get("units_30d_web")),
                revenue_30d_web=round(_float0(ch.get("revenue_30d_web")), 2),
                avg_price_web=round(float(ch["avg_price_web"]), 2) if ch.get("avg_price_web") else None,
                units_30d_pos=_int0(ch.get("units_30d_pos")),
                revenue_30d_pos=round(_float0(ch.get("revenue_30d_pos")), 2),
                avg_price_pos=round(float(ch["avg_price_pos"]), 2) if ch.get("avg_price_pos") else None,
                # reorder
                total_buyers=_int0(rr.get("total_buyers")),
                reorder_rate_30d=round(_float0(rr.get("reorder_rate_30d")), 4),
                reorder_rate_60d=round(_float0(rr.get("reorder_rate_60d")), 4),
                reorder_rate_90d=round(_float0(rr.get("reorder_rate_90d")), 4),
                retention_rate=round(_float0(rr.get("retention_rate")), 4),
                # new metrics
                total_revenue=round(_float0(nm.get("total_revenue")), 2),
                total_quantity=_int0(nm.get("total_quantity")),
                format_rank_pct=round(float(nm["format_rank_pct"]), 4) if nm.get("format_rank_pct") else None,
                total_rank_pct=round(float(nm["total_rank_pct"]), 4) if nm.get("total_rank_pct") else None,
                monthly_growth_pct=round(float(nm["monthly_growth_pct"]), 4) if nm.get("monthly_growth_pct") is not None else None,
                margin_pct=round(float(nm["margin_pct"]), 4) if nm.get("margin_pct") is not None else None,
                full_price_revenue=round(_float0(nm.get("full_price_revenue")), 2),
                full_price_units=_int0(nm.get("full_price_units")),
                discounted_revenue=round(_float0(nm.get("discounted_revenue")), 2),
                discounted_units=_int0(nm.get("discounted_units")),
                avg_monthly_consumption=round(_float0(nm.get("avg_monthly_consumption")), 2),
                refund_rate=round(_float0(nm.get("refund_rate")), 4),
                # bundle
                top_bundle_sku=tb.get("top_bundle_sku"),
                top_bundle_name=tb.get("top_bundle_name"),
                top_bundle_count=_int0(tb.get("top_bundle_count")),
                # stock
                stock_status=stock_status,
                ai_insight=None,
            )
        )

    result.sort(key=lambda x: x.revenue_30d, reverse=True)
    response = ProductIntelligenceResponse(products=result, affinities=[])
    _cache["ts"] = time.time()
    _cache["data"] = response
    return response


@router.get("/affinity", response_model=list[AffinityPair])
async def get_affinity_pairs(sb=Depends(get_supabase)) -> list[AffinityPair]:
    if _aff_cache["data"] and (time.time() - float(_aff_cache["ts"])) < _CACHE_TTL:
        return _aff_cache["data"]  # type: ignore[return-value]
    try:
        raw: list[dict] = sb.rpc("get_product_affinity_pairs").execute().data or []
    except Exception:
        raw = []
    result = [
        AffinityPair(
            sku_a=r["sku_a"],
            sku_b=r["sku_b"],
            co_orders=int(r["co_orders"]),
            name_a=r.get("name_a"),
            name_b=r.get("name_b"),
        )
        for r in raw
    ]
    _aff_cache["ts"] = time.time()
    _aff_cache["data"] = result
    return result

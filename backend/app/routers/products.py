"""03 Product Intelligence — merges products_master, products_georgia,
Meama Products Bible, and four analytics RPCs."""
from __future__ import annotations

import re
import time
from fastapi import APIRouter, Depends

from ..deps import get_supabase
from ..schemas.products import AffinityPair, ProductIntelligenceResponse, ProductSummary

router = APIRouter(prefix="/products", tags=["products"])

_CACHE_TTL = 300  # seconds
_cache: dict[str, object] = {"ts": 0.0, "data": None}
_aff_cache: dict[str, object] = {"ts": 0.0, "data": None}

_EXCLUDE_CATEGORIES = {"Shipping", "Test", "None", None}

CATEGORY_DISPLAY: dict[str, str] = {
    "Multicapsule":                    "Multicapsule",
    "European":                        "European Format",
    "Classic\xa0Coffee":               "Classic Coffee",
    "Classic Coffee":                  "Classic Coffee",
    "BIO":                             "BIO",
    "Tea":                             "Tea",
    "Coffee Machine":                  "Machines",
    "Accessories":                     "Accessories",
    "Variety Pack":                    "Variety Packs",
    "Bundle":                          "Bundles",
    "Coffee Machine Replacement Parts": "Spare Parts",
    "Merch":                           "Merch",
    "Add On":                          "Add-Ons",
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


@router.get("", response_model=ProductIntelligenceResponse)
async def get_product_intelligence(sb=Depends(get_supabase)) -> ProductIntelligenceResponse:
    if _cache["data"] and (time.time() - float(_cache["ts"])) < _CACHE_TTL:
        return _cache["data"]  # type: ignore[return-value]

    # ── 1. Products master ─────────────────────────────────────────────────────
    products_raw: list[dict] = (
        sb.table("products_master")
        .select("sku, name, name_en, category, collection, price_b2c, price_brand_shop, price_marketplace")
        .execute()
        .data or []
    )
    if not products_raw:
        return ProductIntelligenceResponse(products=[], affinities=[])

    product_map = {p["sku"]: p for p in products_raw}

    # ── 2. Product images from products_georgia ────────────────────────────────
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

    # ── 3. Bible enrichment ────────────────────────────────────────────────────
    # select("*") avoids supabase-py mangling column names that contain spaces.
    try:
        bible_raw: list[dict] = (
            sb.table("Meama Products Bible")
            .select("*")
            .execute()
            .data or []
        )
        bible_map: dict[str, dict] = {
            r["Fina Code"]: r for r in bible_raw if r.get("Fina Code")
        }
    except Exception:
        bible_map = {}

    # ── 4. Sales stats RPC ─────────────────────────────────────────────────────
    try:
        stats_raw: list[dict] = sb.rpc("get_product_stats").execute().data or []
    except Exception:
        stats_raw = []
    stats_map = {row["sku"]: row for row in stats_raw}

    # ── 5. Channel split RPC ───────────────────────────────────────────────────
    try:
        ch_raw: list[dict] = sb.rpc("get_product_channel_stats").execute().data or []
    except Exception:
        ch_raw = []
    ch_map = {row["sku"]: row for row in ch_raw}

    # ── 6. Reorder rates RPC ───────────────────────────────────────────────────
    try:
        rr_raw: list[dict] = sb.rpc("get_product_reorder_rates").execute().data or []
    except Exception:
        rr_raw = []
    rr_map = {row["sku"]: row for row in rr_raw}

    # ── 7. Build response ──────────────────────────────────────────────────────
    result: list[ProductSummary] = []
    for sku, p in product_map.items():
        cat = p.get("category")
        if cat in _EXCLUDE_CATEGORIES:
            continue

        stats = stats_map.get(sku, {})
        ch = ch_map.get(sku, {})
        rr = rr_map.get(sku, {})
        bib = bible_map.get(sku, {})

        caffeine_str = bib.get("Caffeine")

        result.append(
            ProductSummary(
                sku=sku,
                name=p.get("name_en") or p.get("name") or sku,
                category=cat or "Other",
                subcategory=p.get("collection"),
                price=_price(p) or 0.0,
                cogs=None,
                image_url=image_map.get(sku),
                caffeine=caffeine_str,
                caffeine_mg=_parse_caffeine_mg(caffeine_str),
                intensity_level=bib.get("Intensity level"),
                bitterness=bib.get("Bitternes"),
                arabica_pct=bib.get("Arabica"),
                robusta_pct=bib.get("Robusta"),
                flavor_profile=bib.get("Flavor Profile"),
                ingredients=bib.get("Contains"),
                beverage_type=bib.get("Beverage Type"),
                bio=bool(bib.get("Bio", False) or False),
                compatible_with=bib.get("Compatible with"),
                capsule_format=bib.get("Capsule Format"),
                hot_cold=bib.get("Hot / Cold"),
                units_sold_30d=int(stats.get("units_30d") or 0),
                revenue_30d=round(float(stats.get("revenue_30d") or 0), 2),
                monthly_units=[int(stats.get(f"m{i}") or 0) for i in range(12)],
                repeat_rate=round(float(stats.get("repeat_rate") or 0), 4),
                units_30d_web=int(ch.get("units_30d_web") or 0),
                revenue_30d_web=round(float(ch.get("revenue_30d_web") or 0), 2),
                avg_price_web=round(float(ch["avg_price_web"]), 2) if ch.get("avg_price_web") else None,
                units_30d_pos=int(ch.get("units_30d_pos") or 0),
                revenue_30d_pos=round(float(ch.get("revenue_30d_pos") or 0), 2),
                avg_price_pos=round(float(ch["avg_price_pos"]), 2) if ch.get("avg_price_pos") else None,
                total_buyers=int(rr.get("total_buyers") or 0),
                reorder_rate_30d=round(float(rr.get("reorder_rate_30d") or 0), 4),
                reorder_rate_60d=round(float(rr.get("reorder_rate_60d") or 0), 4),
                reorder_rate_90d=round(float(rr.get("reorder_rate_90d") or 0), 4),
                retention_rate=round(float(rr.get("retention_rate") or 0), 4),
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

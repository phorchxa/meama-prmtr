"""03 Product Intelligence — merges all data sources into ProductSummary."""
from __future__ import annotations

import asyncio
import re
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from fastapi import APIRouter, Depends, HTTPException, Response

from pydantic import BaseModel

from ..business_rules import RETAIL_CHANNELS
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
async def get_product_intelligence(sb=Depends(get_supabase), response: Response = None) -> ProductIntelligenceResponse:
    if _cache["data"] and (time.time() - float(_cache["ts"])) < _CACHE_TTL:
        if response:
            response.headers["Cache-Control"] = "s-maxage=300, stale-while-revalidate=60"
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

    # ── 2. Products_georgia enrichment (image, product_type, flavor_profile, capsule_format) ───
    try:
        geo_raw: list[dict] = (
            sb.table("products_georgia")
            .select("variant_sku, image_url, product_type, flavor_profile, capsule_format, variant_price, inventory_quantity")
            .execute()
            .data or []
        )
        image_map: dict[str, str] = {}
        geo_map: dict[str, dict] = {}
        for r in geo_raw:
            vs = r.get("variant_sku")
            if not vs:
                continue
            geo_map[vs] = r
            if r.get("image_url") and vs not in image_map:
                image_map[vs] = r["image_url"]
    except Exception:
        image_map = {}
        geo_map = {}

    # ── 2b. SKU bridge: products_master.sku → products_georgia.variant_sku ─────
    # Some products_master SKUs (e.g. cap51-08) differ from products_georgia
    # variant_sku (cap51-1208). "SKU Matching" table provides the mapping.
    try:
        sku_match_raw: list[dict] = (
            sb.table("SKU Matching")
            .select('"Product variant SKU","unified Code"')
            .execute()
            .data or []
        )
        # Map short products_master SKU → long products_georgia variant_sku
        sku_bridge: dict[str, str] = {
            r["Product variant SKU"]: r["unified Code"]
            for r in sku_match_raw
            if r.get("Product variant SKU") and r.get("unified Code")
            and r["Product variant SKU"] != r["unified Code"]
        }
    except Exception:
        sku_bridge = {}

    def _geo_lookup(sku: str) -> dict:
        """Look up products_georgia row, trying bridge SKU if direct miss."""
        return geo_map.get(sku) or geo_map.get(sku_bridge.get(sku, ""), {})

    # Rebuild image_map with bridge lookups too
    for pm_sku in product_map:
        if pm_sku not in image_map:
            bridged_geo = geo_map.get(sku_bridge.get(pm_sku, ""))
            if bridged_geo and bridged_geo.get("image_url"):
                image_map[pm_sku] = bridged_geo["image_url"]

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

    # ── 4–8. Run all 5 RPCs in parallel (independent queries) ──────────────
    def _rpc(name: str) -> list[dict]:
        try:
            return sb.rpc(name).execute().data or []
        except Exception:
            return []

    loop = asyncio.get_event_loop()
    with ThreadPoolExecutor(max_workers=5) as pool:
        stats_fut  = loop.run_in_executor(pool, _rpc, "get_product_stats")
        ch_fut     = loop.run_in_executor(pool, _rpc, "get_product_channel_stats")
        rr_fut     = loop.run_in_executor(pool, _rpc, "get_product_reorder_rates")
        nm_fut     = loop.run_in_executor(pool, _rpc, "get_product_new_metrics")
        tb_fut     = loop.run_in_executor(pool, _rpc, "get_product_top_bundles")
        stats_raw, ch_raw, rr_raw, nm_raw, tb_raw = await asyncio.gather(
            stats_fut, ch_fut, rr_fut, nm_fut, tb_fut
        )

    stats_map = {row["sku"]: row for row in stats_raw}
    ch_map    = {row["sku"]: row for row in ch_raw}
    rr_map    = {row["sku"]: row for row in rr_raw}
    nm_map    = {row["sku"]: row for row in nm_raw}
    tb_map    = {row["sku"]: row for row in tb_raw}

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

        # Stock status: derived from products_master.stock_quantity + avg_monthly_consumption.
        # avg_monthly_consumption comes from get_product_new_metrics(); stock_quantity is read
        # directly from products_master above. Re-derived here so the router is self-contained.
        sq = p.get("stock_quantity")
        amc = _float0(nm.get("avg_monthly_consumption"))
        if sq is None:
            stock_status: str | None = "unknown"
        elif amc <= 0:
            stock_status = "unknown"
        else:
            months = float(sq) / amc
            if months < 2:
                stock_status = "understock"
            elif months <= 3:
                stock_status = "in_stock"
            else:
                stock_status = "overstock"

        geo = _geo_lookup(sku)

        # Stock: prefer products_master.stock_quantity, fall back to products_georgia.inventory_quantity
        if sq is None and geo.get("inventory_quantity") is not None:
            sq = geo["inventory_quantity"]
            # Re-derive stock_status with fallback stock value
            if amc <= 0:
                stock_status = "unknown"
            else:
                months = float(sq) / amc
                if months < 2:
                    stock_status = "understock"
                elif months <= 3:
                    stock_status = "in_stock"
                else:
                    stock_status = "overstock"

        # intensity_bucket from Bible intensity_level
        raw_intensity = _float(bib.get("Intensity level"))
        intensity_bucket: str | None = None
        if raw_intensity is not None:
            if raw_intensity < 4:
                intensity_bucket = "light"
            elif raw_intensity < 7:
                intensity_bucket = "medium"
            else:
                intensity_bucket = "strong"

        # flavor_notes: products_georgia.flavor_profile is text[] — parse safely
        geo_flavor_raw = geo.get("flavor_profile")
        if isinstance(geo_flavor_raw, list):
            flavor_notes = [f for f in geo_flavor_raw if f and str(f).strip()]
        elif isinstance(geo_flavor_raw, str) and geo_flavor_raw.strip():
            flavor_notes = [t.strip() for t in geo_flavor_raw.split(",") if t.strip()]
        else:
            flavor_notes = []

        # beverage_type_en: normalise from Georgian Bible label
        bev_raw = bib.get("Beverage Type") or ""
        _BEV_MAP = {
            "ესპრესო & ლუნგო": "espresso",
            "ფილტრის ყავა":    "filter_coffee",
            "ჩაი & ნაყენი":    "tea",
            "მიქსოლოგია":      "cold_mix",
            "საკვები დანამატი": "wellness",
        }
        beverage_type_en: str | None = _BEV_MAP.get(bev_raw.strip())

        # product_type from products_georgia (strip POS suffix)
        pt_raw = geo.get("product_type") or ""
        product_type_geo = re.sub(r"\s*\(POS\)\s*$", "", pt_raw, flags=re.IGNORECASE).strip() or None

        result.append(
            ProductSummary(
                sku=sku,
                name=p.get("name_en") or p.get("name") or sku,
                category=cat or "Other",
                subcategory=p.get("collection"),
                price=_price(p) or float(geo.get("variant_price") or 0) or float(ch.get("avg_price_web") or ch.get("avg_price_pos") or 0),
                cogs=_float(p.get("cogs")),
                # enrichment
                image_url=image_map.get(sku),
                caffeine=bib.get("Caffeine"),
                caffeine_mg=_parse_caffeine_mg(bib.get("Caffeine")),
                intensity_level=raw_intensity,
                intensity_bucket=intensity_bucket,
                bitterness=_float(bib.get("Bitternes")),
                arabica_pct=_float(bib.get("Arabica")),
                robusta_pct=_float(bib.get("Robusta")),
                flavor_profile=bib.get("Flavor Profile"),
                flavor_notes=flavor_notes,
                ingredients=bib.get("Contains"),
                beverage_type=bib.get("Beverage Type"),
                beverage_type_en=beverage_type_en,
                bio=bool(bib.get("Bio", False) or False),
                compatible_with=bib.get("Compatible with"),
                capsule_format=bib.get("Capsule Format") or geo.get("capsule_format") or None,
                hot_cold=bib.get("Hot / Cold"),
                product_type_geo=product_type_geo,
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
                stock_quantity=_int0(sq) if sq is not None else None,
                stock_status=stock_status,
                ai_insight=None,
            )
        )

    result.sort(key=lambda x: x.revenue_30d, reverse=True)
    built = ProductIntelligenceResponse(products=result, affinities=[])
    _cache["ts"] = time.time()
    _cache["data"] = built
    if response:
        response.headers["Cache-Control"] = "s-maxage=300, stale-while-revalidate=60"
    return built


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


# ── Cross-link schemas ────────────────────────────────────────────────────────


class ProductCustomerRow(BaseModel):
    customer_id: str
    total_spend: float
    total_units: int
    order_count: int
    last_purchase_date: date | None = None
    rfm_segment: str | None = None
    churn_score: float | None = None


class ProductOrderRow(BaseModel):
    order_id: str
    customer_id: str
    order_date: date | None = None
    channel: str | None = None
    quantity: int
    unit_price: float
    total_price: float


# ── GET /products/{sku} — single product ─────────────────────────────────────


@router.get("/{sku}", response_model=ProductSummary)
async def get_product(sku: str, sb=Depends(get_supabase)) -> ProductSummary:
    """Single-product detail — same data shape as the list but for one SKU.

    Shares all the same Supabase RPCs. Because the full list is cached we can
    call it and filter rather than re-querying.  The 5-minute cache means this is
    effectively free after the first list call.
    """
    # Reuse the cached intelligence response
    full = await get_product_intelligence(sb)
    hit = next((p for p in full.products if p.sku == sku), None)
    if hit is None:
        raise HTTPException(status_code=404, detail=f"Product '{sku}' not found.")
    return hit


# ── GET /products/{sku}/customers — top customers for a product ───────────────


@router.get("/{sku}/customers", response_model=list[ProductCustomerRow])
async def get_product_customers(
    sku: str,
    limit: int = 20,
    sb=Depends(get_supabase),
) -> list[ProductCustomerRow]:
    """Top customers who purchased this product (sorted by total spend).

    Queries orders_flat filtered to RETAIL_CHANNELS and joins customer_metrics
    for segment/churn context. Falls back to empty list if tables not populated.
    """
    # Verify the product exists
    full = await get_product_intelligence(sb)
    if not any(p.sku == sku for p in full.products):
        raise HTTPException(status_code=404, detail=f"Product '{sku}' not found.")

    def _date(v) -> date | None:
        if v is None:
            return None
        if isinstance(v, date):
            return v
        try:
            return date.fromisoformat(str(v)[:10])
        except ValueError:
            return None

    try:
        # Try the dedicated RPC first
        rows = (
            sb.rpc("get_product_top_customers", {"p_sku": sku, "p_limit": limit})
            .execute()
            .data
            or []
        )
    except Exception:
        rows = []

    if not rows:
        # Fallback: aggregate orders_flat directly
        try:
            raw = (
                sb.table("orders_flat")
                .select("customer_id, quantity, total_price, order_date")
                .eq("sku", sku)
                .in_("channel", list(RETAIL_CHANNELS))
                .execute()
                .data
                or []
            )
            agg: dict[str, dict] = {}
            for r in raw:
                cid = r.get("customer_id") or ""
                if not cid:
                    continue
                if cid not in agg:
                    agg[cid] = {
                        "customer_id": cid,
                        "total_spend": 0.0,
                        "total_units": 0,
                        "order_count": 0,
                        "last_purchase_date": None,
                    }
                agg[cid]["total_spend"] += float(r.get("total_price") or 0)
                agg[cid]["total_units"] += int(r.get("quantity") or 0)
                agg[cid]["order_count"] += 1
                d = _date(r.get("order_date"))
                if d and (agg[cid]["last_purchase_date"] is None or d > agg[cid]["last_purchase_date"]):
                    agg[cid]["last_purchase_date"] = d

            # Sort by spend descending, take top N
            rows = sorted(agg.values(), key=lambda x: x["total_spend"], reverse=True)[:limit]

            # Enrich with customer_metrics (segment, churn)
            if rows:
                customer_ids = [r["customer_id"] for r in rows]
                try:
                    metrics_raw = (
                        sb.table("customer_metrics")
                        .select("customer_id, rfm_segment, churn_score")
                        .in_("customer_id", customer_ids)
                        .execute()
                        .data
                        or []
                    )
                    metrics_map = {m["customer_id"]: m for m in metrics_raw}
                    for r in rows:
                        m = metrics_map.get(r["customer_id"], {})
                        r["rfm_segment"] = m.get("rfm_segment")
                        r["churn_score"] = m.get("churn_score")
                except Exception:
                    pass
        except Exception:
            rows = []

    return [
        ProductCustomerRow(
            customer_id=r.get("customer_id", ""),
            total_spend=float(r.get("total_spend") or 0),
            total_units=int(r.get("total_units") or 0),
            order_count=int(r.get("order_count") or 0),
            last_purchase_date=_date(r.get("last_purchase_date")),
            rfm_segment=r.get("rfm_segment"),
            churn_score=r.get("churn_score"),
        )
        for r in rows
        if r.get("customer_id")
    ]


# ── GET /products/{sku}/orders — recent orders for a product ──────────────────


@router.get("/{sku}/orders", response_model=list[ProductOrderRow])
async def get_product_orders(
    sku: str,
    limit: int = 50,
    channel: str | None = None,
    sb=Depends(get_supabase),
) -> list[ProductOrderRow]:
    """Recent orders containing this SKU — retail channels only, newest first."""
    full = await get_product_intelligence(sb)
    if not any(p.sku == sku for p in full.products):
        raise HTTPException(status_code=404, detail=f"Product '{sku}' not found.")

    def _date(v) -> date | None:
        if v is None:
            return None
        if isinstance(v, date):
            return v
        try:
            return date.fromisoformat(str(v)[:10])
        except ValueError:
            return None

    try:
        q = (
            sb.table("orders_flat")
            .select("order_id, customer_id, order_date, channel, quantity, unit_price, total_price")
            .eq("sku", sku)
            .in_("channel", list(RETAIL_CHANNELS))
            .order("order_date", desc=True)
            .limit(limit)
        )
        if channel and channel in RETAIL_CHANNELS:
            q = q.eq("channel", channel)
        rows = q.execute().data or []
    except Exception:
        rows = []

    return [
        ProductOrderRow(
            order_id=r.get("order_id", ""),
            customer_id=r.get("customer_id", ""),
            order_date=_date(r.get("order_date")),
            channel=r.get("channel"),
            quantity=int(r.get("quantity") or 0),
            unit_price=float(r.get("unit_price") or 0),
            total_price=float(r.get("total_price") or 0),
        )
        for r in rows
    ]


# ── GET /products/{sku}/segment-buyers — which segments buy this product ──────


class ProductSegmentBuyerRow(BaseModel):
    segment: str
    rfm_label: str
    customer_count: int
    total_spend: float
    avg_spend: float


@router.get("/{sku}/segment-buyers", response_model=list[ProductSegmentBuyerRow])
async def get_product_segment_buyers(
    sku: str,
    sb=Depends(get_supabase),
) -> list[ProductSegmentBuyerRow]:
    """Which customer segments (from portfolio_customers) buy this product.

    Uses the get_product_segment_buyers RPC (0010 migration). Falls back
    to an empty list if portfolio_customers mat-view is not yet populated.
    """
    full = await get_product_intelligence(sb)
    if not any(p.sku == sku for p in full.products):
        raise HTTPException(status_code=404, detail=f"Product '{sku}' not found.")

    try:
        rows = (
            sb.rpc("get_product_segment_buyers", {"p_sku": sku})
            .execute()
            .data
            or []
        )
    except Exception:
        rows = []

    return [
        ProductSegmentBuyerRow(
            segment=r.get("segment", "unknown"),
            rfm_label=r.get("rfm_label", "unknown"),
            customer_count=int(r.get("customer_count") or 0),
            total_spend=float(r.get("total_spend") or 0),
            avg_spend=float(r.get("avg_spend") or 0),
        )
        for r in rows
    ]

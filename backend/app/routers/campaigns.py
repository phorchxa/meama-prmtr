"""05 Campaign Intelligence + promo calculator."""
from __future__ import annotations

import json
import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

from ..business_rules import (
    MARGIN_FLOOR,
    max_safe_discount,
    min_safe_price,
    net_margin,
)
from ..deps import get_supabase
from ..schemas.campaigns import (
    CampaignCreate,
    CampaignDetail,
    CampaignProductRow,
    CampaignStatusUpdate,
    CampaignSummary,
    CatalogProduct,
    MetaCampaignRow,
    MetaDailyPoint,
    MetaOverview,
    PromoCalcLine,
    PromoCalcRequest,
    PromoCalcResponse,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/campaigns", tags=["campaigns"])

# NOTE: execute_readonly_query uses a naive substring regex — never include
# column names that contain CREATE/INSERT/UPDATE/DELETE (e.g. created_at).

def _campaigns_query(*, with_meta: bool) -> str:
    """List query for all campaigns. `with_meta` toggles the Meta-ad aggregate
    columns/join — call with_meta=False as a fallback when campaigns.meta_insights
    is unavailable. Mirrors the _detail_query builder pattern below."""
    meta_select = (
        """COALESCE(mi_agg.spend_usd, 0)   AS meta_spend_usd,
  mi_agg.roas                      AS meta_roas,
  COALESCE(mi_agg.impressions, 0) AS meta_impressions,
  COALESCE(mi_agg.clicks, 0)      AS meta_clicks"""
        if with_meta
        else """0    AS meta_spend_usd,
  NULL AS meta_roas,
  0    AS meta_impressions,
  0    AS meta_clicks"""
    )
    meta_join = (
        """LEFT JOIN (
  SELECT
    campaign_id,
    SUM(spend_usd)   AS spend_usd,
    SUM(impressions) AS impressions,
    SUM(clicks)      AS clicks,
    CASE
      WHEN SUM(spend_usd) > 0
      THEN SUM(spend_usd * COALESCE(roas, 0)) / NULLIF(SUM(spend_usd), 0)
    END AS roas
  FROM campaigns.meta_insights
  GROUP BY campaign_id
) mi_agg ON mi_agg.campaign_id = c.id"""
        if with_meta
        else ""
    )
    return f"""
SELECT
  c.id,
  c.name,
  c.channel,
  c.status,
  c.target_segment,
  c.launched_at,
  c.scheduled_at,
  p.type        AS promo_type,
  p.discount_value,
  p.shopify_code,
  p.source_app,
  CASE WHEN c.status = 'active' THEN mtd.revenue_total ELSE cr.revenue_total END AS revenue_total,
  CASE WHEN c.status = 'active' THEN mtd.roi ELSE cr.roi END AS roi,
  CASE WHEN c.status = 'active' THEN mtd.converted ELSE cr.converted END AS converted,
  cr.reached,
  cr.conversion_rate,
  CASE WHEN c.status = 'active' THEN mtd.avg_order_value ELSE cr.avg_order_value END AS avg_order_value,
  mtd.revenue_total AS revenue_mtd,   -- month-to-date for ALL campaigns (NULL if no MTD orders)
  mtd.roi           AS roi_mtd,
  {meta_select},
  p.valid_from,
  p.valid_to,
  sd.status                        AS shopify_discount_status,
  sd.usage_count                   AS shopify_usage_count,
  sd.usage_limit                   AS shopify_usage_limit
FROM campaigns.campaigns c
LEFT JOIN campaigns.promotions p
  ON p.id = c.promotion_id
LEFT JOIN campaigns.campaign_results cr
  ON cr.campaign_id = c.id
LEFT JOIN (
  SELECT
    co.campaign_id,
    COUNT(DISTINCT co.shopify_order_id) AS converted,
    ROUND(SUM(co.attributed_revenue)::numeric, 2) AS revenue_total,
    ROUND(AVG(co.attributed_revenue)::numeric, 2) AS avg_order_value,
    ROUND(
      (SUM(co.attributed_revenue) - SUM(o.discount_amount))
      / NULLIF(SUM(o.discount_amount), 0),
      4
    ) AS roi
  FROM campaigns.campaign_orders co
  JOIN public.meama_georgia_orders o
    ON o.shopify_order_id = co.shopify_order_id
  WHERE o.processed_at >= date_trunc('month', NOW())
  GROUP BY co.campaign_id
) mtd ON mtd.campaign_id = c.id
{meta_join}
LEFT JOIN LATERAL (
  SELECT status, usage_count, usage_limit
  FROM campaigns.shopify_discounts sd2
  WHERE sd2.promotion_id = p.id
  ORDER BY
    CASE sd2.status WHEN 'ACTIVE' THEN 0 WHEN 'SCHEDULED' THEN 1 ELSE 2 END,
    sd2.usage_count DESC NULLS LAST
  LIMIT 1
) sd ON true
ORDER BY c.launched_at DESC NULLS LAST
"""


@router.get("", response_model=list[CampaignSummary])
async def list_campaigns(sb=Depends(get_supabase)) -> list[CampaignSummary]:
    """List all campaigns with results and Meta ad spend aggregates."""
    try:
        res = sb.rpc("execute_readonly_query", {"query_text": _campaigns_query(with_meta=True)}).execute()
        rows = res.data or []
    except Exception as exc:
        logger.warning("meta_insights unavailable, falling back: %s", exc)
        try:
            res = sb.rpc("execute_readonly_query", {"query_text": _campaigns_query(with_meta=False)}).execute()
            rows = res.data or []
        except Exception as exc2:
            logger.error("campaigns query failed: %s", exc2)
            return []

    return [
        CampaignSummary(
            id=str(r["id"]),
            name=r["name"],
            channel=r.get("channel"),
            status=r.get("status"),
            promo_type=r.get("promo_type"),
            discount_value=float(r["discount_value"]) if r.get("discount_value") is not None else None,
            shopify_code=r.get("shopify_code"),
            target_segment=r.get("target_segment"),
            launched_at=r.get("launched_at"),
            scheduled_at=r.get("scheduled_at"),
            revenue_total=float(r["revenue_total"]) if r.get("revenue_total") is not None else None,
            roi=float(r["roi"]) if r.get("roi") is not None else None,
            converted=int(r["converted"]) if r.get("converted") is not None else None,
            reached=int(r["reached"]) if r.get("reached") is not None else None,
            conversion_rate=float(r["conversion_rate"]) if r.get("conversion_rate") is not None else None,
            avg_order_value=float(r["avg_order_value"]) if r.get("avg_order_value") is not None else None,
            revenue_mtd=float(r["revenue_mtd"]) if r.get("revenue_mtd") is not None else None,
            roi_mtd=float(r["roi_mtd"]) if r.get("roi_mtd") is not None else None,
            meta_spend_usd=float(r.get("meta_spend_usd") or 0),
            meta_roas=float(r["meta_roas"]) if r.get("meta_roas") is not None else None,
            meta_impressions=int(r.get("meta_impressions") or 0),
            meta_clicks=int(r.get("meta_clicks") or 0),
            valid_from=r.get("valid_from"),
            valid_to=r.get("valid_to"),
            shopify_discount_status=r.get("shopify_discount_status"),
            shopify_usage_count=int(r["shopify_usage_count"]) if r.get("shopify_usage_count") is not None else None,
            shopify_usage_limit=int(r["shopify_usage_limit"]) if r.get("shopify_usage_limit") is not None else None,
        )
        for r in rows
    ]


@router.post("", response_model=CampaignSummary, status_code=201)
async def create_campaign(body: CampaignCreate, sb=Depends(get_supabase)) -> CampaignSummary:
    """Create a draft campaign (+ optional promotion) via the create_campaign RPC."""
    payload = {
        "name": body.name.strip(),
        "channel": body.channel,
        "promo_type": body.promo_type,
        "discount_value": body.discount_value,
        "target_segment": body.target_segment,
        "scheduled_at": body.scheduled_at.isoformat() if body.scheduled_at else None,
    }
    try:
        res = sb.rpc("create_campaign", {"payload": json.dumps(payload)}).execute()
    except Exception as exc:
        logger.error("create_campaign RPC failed: %s", exc)
        raise HTTPException(status_code=502, detail="could not create campaign") from exc

    data = res.data
    r = data[0] if isinstance(data, list) and data else (data if isinstance(data, dict) else None)
    if not r:
        raise HTTPException(status_code=502, detail="create_campaign returned no row")

    return CampaignSummary(
        id=str(r.get("id")),
        name=r.get("name") or body.name,
        channel=r.get("channel"),
        status=r.get("status"),
        promo_type=r.get("promo_type"),
        discount_value=float(r["discount_value"]) if r.get("discount_value") is not None else None,
        shopify_code=r.get("shopify_code"),
        target_segment=r.get("target_segment"),
        launched_at=None,
        scheduled_at=r.get("scheduled_at"),
    )


@router.patch("/{campaign_id}/status", response_model=CampaignStatusUpdate)
async def set_campaign_status(
    campaign_id: str, body: CampaignStatusUpdate, sb=Depends(get_supabase)
) -> CampaignStatusUpdate:
    """Toggle a campaign's status (active ⟷ completed) via the set_campaign_status RPC."""
    try:
        cid = str(UUID(campaign_id))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="invalid campaign id") from exc

    try:
        res = sb.rpc(
            "set_campaign_status", {"p_campaign_id": cid, "p_status": body.status}
        ).execute()
    except Exception as exc:
        logger.error("set_campaign_status RPC failed: %s", exc)
        raise HTTPException(status_code=502, detail="could not update status") from exc

    data = res.data
    r = data[0] if isinstance(data, list) and data else (data if isinstance(data, dict) else None)
    new_status = (r or {}).get("status", body.status)
    return CampaignStatusUpdate(status=new_status)


def _detail_query(cid: str, *, with_meta: bool) -> str:
    meta_select = (
        """COALESCE(mi.spend_usd, 0)   AS meta_spend_usd,
           mi.roas                      AS meta_roas,
           COALESCE(mi.impressions, 0) AS meta_impressions,
           COALESCE(mi.clicks, 0)      AS meta_clicks"""
        if with_meta
        else "0 AS meta_spend_usd, NULL AS meta_roas, 0 AS meta_impressions, 0 AS meta_clicks"
    )
    meta_join = (
        """LEFT JOIN (
             SELECT campaign_id, SUM(spend_usd) AS spend_usd,
                    SUM(impressions) AS impressions, SUM(clicks) AS clicks,
                    CASE WHEN SUM(spend_usd) > 0
                      THEN SUM(spend_usd * COALESCE(roas, 0)) / NULLIF(SUM(spend_usd), 0)
                    END AS roas
             FROM campaigns.meta_insights GROUP BY campaign_id
           ) mi ON mi.campaign_id = c.id"""
        if with_meta
        else ""
    )
    return f"""
    SELECT
      c.id, c.name, c.channel, c.status, c.target_segment, c.launched_at, c.scheduled_at,
      p.type AS promo_type, p.discount_value, p.shopify_code, p.source_app,
      p.discount_type, p.min_order_value, p.valid_from, p.valid_to, p.tag_pattern, p.excluded_segments,
      CASE WHEN c.status = 'active' THEN mtd.revenue_total ELSE cr.revenue_total END AS revenue_total,
      CASE WHEN c.status = 'active' THEN mtd.roi ELSE cr.roi END AS roi,
      CASE WHEN c.status = 'active' THEN mtd.converted ELSE cr.converted END AS converted,
      cr.reached,
      cr.conversion_rate,
      CASE WHEN c.status = 'active' THEN mtd.avg_order_value ELSE cr.avg_order_value END AS avg_order_value,
  mtd.revenue_total AS revenue_mtd,   -- month-to-date for ALL campaigns (NULL if no MTD orders)
  mtd.roi           AS roi_mtd,
      {meta_select},
      sd.status      AS shopify_discount_status,
      sd.usage_count AS shopify_usage_count,
      sd.usage_limit AS shopify_usage_limit
    FROM campaigns.campaigns c
    LEFT JOIN campaigns.promotions p ON p.id = c.promotion_id
    LEFT JOIN campaigns.campaign_results cr ON cr.campaign_id = c.id
    LEFT JOIN (
      SELECT
        co.campaign_id,
        COUNT(DISTINCT co.shopify_order_id) AS converted,
        ROUND(SUM(co.attributed_revenue)::numeric, 2) AS revenue_total,
        ROUND(AVG(co.attributed_revenue)::numeric, 2) AS avg_order_value,
        ROUND(
          (SUM(co.attributed_revenue) - SUM(o.discount_amount))
          / NULLIF(SUM(o.discount_amount), 0),
          4
        ) AS roi
      FROM campaigns.campaign_orders co
      JOIN public.meama_georgia_orders o
        ON o.shopify_order_id = co.shopify_order_id
      WHERE o.processed_at >= date_trunc('month', NOW())
      GROUP BY co.campaign_id
    ) mtd ON mtd.campaign_id = c.id
    {meta_join}
    LEFT JOIN LATERAL (
      SELECT status, usage_count, usage_limit
      FROM campaigns.shopify_discounts sd2
      WHERE sd2.promotion_id = p.id
      ORDER BY
        CASE sd2.status WHEN 'ACTIVE' THEN 0 WHEN 'SCHEDULED' THEN 1 ELSE 2 END,
        sd2.usage_count DESC NULLS LAST
      LIMIT 1
    ) sd ON true
    WHERE c.id = '{cid}'
    """


def _detail_products_query(cid: str) -> str:
    return f"""
    SELECT
      oi.sku,
      MAX(oi.title)                              AS title,
      MAX(pg.variant_price)                      AS price,
      MAX(pg.compare_at_price)                   AS compare_at_price,
      MAX(pg.cost_per_item)                      AS cost_per_item,
      SUM(oi.quantity)                           AS units,
      ROUND(SUM(oi.price * oi.quantity)::numeric, 2) AS revenue
    FROM campaigns.campaign_orders co
    JOIN public.meama_georgia_order_items oi ON oi.shopify_order_id = co.shopify_order_id
    LEFT JOIN public.products_georgia pg ON pg.variant_sku = oi.sku
    WHERE co.campaign_id = '{cid}'
    GROUP BY oi.sku
    ORDER BY revenue DESC NULLS LAST
    LIMIT 10
    """


_META_CAMPAIGNS_QUERY = """
SELECT
  meta_campaign_id,
  meta_campaign_name,
  meta_account_id,
  SUM(spend_usd)   AS spend_usd,
  SUM(impressions) AS impressions,
  SUM(clicks)      AS clicks,
  CASE WHEN SUM(spend_usd) > 0
    THEN SUM(spend_usd * COALESCE(roas, 0)) / NULLIF(SUM(spend_usd), 0)
  END AS roas
FROM campaigns.meta_insights
WHERE date >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY meta_campaign_id, meta_campaign_name, meta_account_id
ORDER BY SUM(spend_usd) DESC
"""

_META_DAILY_QUERY = """
SELECT date, SUM(spend_usd) AS spend_usd
FROM campaigns.meta_insights
WHERE date >= CURRENT_DATE - INTERVAL '14 days'
GROUP BY date
ORDER BY date ASC
"""


@router.get("/meta-overview", response_model=MetaOverview)
async def meta_overview(sb=Depends(get_supabase)) -> MetaOverview:
    """Meta ad performance — last 30 days from campaigns.meta_insights."""
    campaigns_data: list[dict] = []
    daily_data: list[dict] = []

    try:
        res = sb.rpc("execute_readonly_query", {"query_text": _META_CAMPAIGNS_QUERY}).execute()
        campaigns_data = res.data or []
    except Exception as exc:
        logger.warning("meta_insights campaigns query failed: %s", exc)

    try:
        res = sb.rpc("execute_readonly_query", {"query_text": _META_DAILY_QUERY}).execute()
        daily_data = res.data or []
    except Exception as exc:
        logger.warning("meta_insights daily query failed: %s", exc)

    rows = [
        MetaCampaignRow(
            meta_campaign_id=str(r.get("meta_campaign_id") or ""),
            meta_campaign_name=r.get("meta_campaign_name"),
            meta_account_id=r.get("meta_account_id"),
            spend_usd=float(r.get("spend_usd") or 0),
            impressions=int(r.get("impressions") or 0),
            clicks=int(r.get("clicks") or 0),
            roas=float(r["roas"]) if r.get("roas") is not None else None,
        )
        for r in campaigns_data
        if r.get("meta_campaign_id")
    ]

    total_spend = sum(c.spend_usd for c in rows)
    total_impressions = sum(c.impressions for c in rows)
    total_clicks = sum(c.clicks for c in rows)
    weighted = sum(c.spend_usd * (c.roas or 0) for c in rows)
    blended_roas = (weighted / total_spend) if total_spend > 0 else None
    below = sum(1 for c in rows if c.roas is not None and c.roas < 2.0)

    trend = [
        MetaDailyPoint(date=str(r["date"]), spend_usd=float(r.get("spend_usd") or 0))
        for r in daily_data
    ]

    return MetaOverview(
        period_days=30,
        total_spend_usd=round(total_spend, 2),
        blended_roas=round(blended_roas, 3) if blended_roas is not None else None,
        total_impressions=total_impressions,
        total_clicks=total_clicks,
        campaign_count=len(rows),
        below_threshold_count=below,
        campaigns=rows,
        daily_trend=trend,
    )


# Catalog columns are safe for execute_readonly_query (none contain the
# CREATE/INSERT/UPDATE/DELETE substrings its naive guard rejects).
_CATALOG_QUERY = """
SELECT sku, name_en, name_ka, product_type, category, subcategory, status,
       caps_per_pack, price_per_pack, price_per_unit, total_cogs, full_margin
FROM campaigns.product_catalog
WHERE status <> 'discontinued'
ORDER BY product_type, category NULLS LAST, subcategory NULLS LAST, name_en
"""


@router.get("/products", response_model=list[CatalogProduct])
async def list_catalog_products(
    include_discontinued: bool = False, sb=Depends(get_supabase)
) -> list[CatalogProduct]:
    """Product catalog (price + COGS) synced from the commercial-master sheet.

    Feeds the promo calculator's product/bundle pickers so price and COGS are
    selected, never hand-typed. Margin math stays in business_rules.py.
    """
    query = _CATALOG_QUERY
    if include_discontinued:
        query = query.replace("WHERE status <> 'discontinued'\n", "")
    try:
        res = sb.rpc("execute_readonly_query", {"query_text": query}).execute()
        rows = res.data or []
    except Exception:
        logger.exception("product_catalog query failed")
        rows = []
    return [CatalogProduct(**row) for row in rows]


@router.post("/promo-calculator", response_model=PromoCalcResponse)
async def promo_calculator(req: PromoCalcRequest) -> PromoCalcResponse:
    """Compute per-SKU promo safety. Pure arithmetic — fully implemented."""
    lines: list[PromoCalcLine] = []
    for item in req.sku_list:
        discounted_price = item.full_price * (1.0 - req.discount_pct)
        msp = min_safe_price(item.cogs)
        msd = max_safe_discount(item.full_price, item.cogs)
        effective_margin = net_margin(discounted_price, item.cogs)

        reasons: list[str] = []
        if effective_margin < MARGIN_FLOOR:
            reasons.append(
                f"margin {effective_margin:.1%} below floor {MARGIN_FLOOR:.0%}"
            )
        if discounted_price < msp:
            reasons.append(
                f"price ₾{discounted_price:.2f} below min safe ₾{msp:.2f}"
            )

        blocked = len(reasons) > 0
        lines.append(
            PromoCalcLine(
                sku=item.sku,
                full_price=round(item.full_price, 2),
                cogs=round(item.cogs, 2),
                discounted_price=round(discounted_price, 2),
                min_safe_price=round(msp, 2),
                max_safe_discount=round(msd, 4),
                effective_margin=round(effective_margin, 4),
                status="red" if blocked else "green",
                blocked=blocked,
                reasons=reasons,
            )
        )

    return PromoCalcResponse(
        discount_pct=req.discount_pct,
        blocked=any(line.blocked for line in lines),
        lines=lines,
    )


# NOTE: declared LAST so the dynamic path does not shadow the static
# routes above (/meta-overview, /promo-calculator).
@router.get("/{campaign_id}", response_model=CampaignDetail)
async def get_campaign(campaign_id: str, sb=Depends(get_supabase)) -> CampaignDetail:
    """One campaign: promotion terms + the products its orders actually sold (with prices)."""
    try:
        cid = str(UUID(campaign_id))  # validate — value is embedded into raw SQL
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="invalid campaign id") from exc

    try:
        res = sb.rpc("execute_readonly_query", {"query_text": _detail_query(cid, with_meta=True)}).execute()
        rows = res.data or []
    except Exception as exc:
        logger.warning("meta_insights unavailable on detail, falling back: %s", exc)
        res = sb.rpc("execute_readonly_query", {"query_text": _detail_query(cid, with_meta=False)}).execute()
        rows = res.data or []

    if not rows:
        raise HTTPException(status_code=404, detail="campaign not found")
    r = rows[0]

    try:
        pres = sb.rpc("execute_readonly_query", {"query_text": _detail_products_query(cid)}).execute()
        prows = pres.data or []
    except Exception as exc:
        logger.warning("campaign product attribution failed: %s", exc)
        prows = []

    def _f(v: object) -> float | None:
        return float(v) if v is not None else None  # type: ignore[arg-type]

    products = [
        CampaignProductRow(
            sku=pr.get("sku"),
            title=pr.get("title"),
            price=_f(pr.get("price")),
            compare_at_price=_f(pr.get("compare_at_price")),
            cost_per_item=_f(pr.get("cost_per_item")),
            units=int(pr.get("units") or 0),
            revenue=float(pr.get("revenue") or 0),
        )
        for pr in prows
    ]

    return CampaignDetail(
        id=str(r["id"]),
        name=r["name"],
        channel=r.get("channel"),
        status=r.get("status"),
        promo_type=r.get("promo_type"),
        discount_value=_f(r.get("discount_value")),
        shopify_code=r.get("shopify_code"),
        target_segment=r.get("target_segment"),
        launched_at=r.get("launched_at"),
        scheduled_at=r.get("scheduled_at"),
        revenue_total=_f(r.get("revenue_total")),
        roi=_f(r.get("roi")),
        converted=int(r["converted"]) if r.get("converted") is not None else None,
        reached=int(r["reached"]) if r.get("reached") is not None else None,
        conversion_rate=_f(r.get("conversion_rate")),
        avg_order_value=_f(r.get("avg_order_value")),
        meta_spend_usd=float(r.get("meta_spend_usd") or 0),
        meta_roas=_f(r.get("meta_roas")),
        meta_impressions=int(r.get("meta_impressions") or 0),
        meta_clicks=int(r.get("meta_clicks") or 0),
        shopify_discount_status=r.get("shopify_discount_status"),
        shopify_usage_count=int(r["shopify_usage_count"]) if r.get("shopify_usage_count") is not None else None,
        shopify_usage_limit=int(r["shopify_usage_limit"]) if r.get("shopify_usage_limit") is not None else None,
        source_app=r.get("source_app"),
        discount_type=r.get("discount_type"),
        min_order_value=_f(r.get("min_order_value")),
        valid_from=r.get("valid_from"),
        valid_to=r.get("valid_to"),
        tag_pattern=r.get("tag_pattern"),
        excluded_segments=r.get("excluded_segments") or [],
        products=products,
    )

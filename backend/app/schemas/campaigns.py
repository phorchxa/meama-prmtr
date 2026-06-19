"""Schemas — 05 Campaign Intelligence + promo calculator."""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class CampaignSummary(BaseModel):
    id: str
    name: str
    channel: str | None = None
    status: str | None = None
    promo_type: str | None = None       # bundle | discount | gift | subscription | clearance
    discount_value: float | None = None
    shopify_code: str | None = None
    target_segment: str | None = None
    launched_at: datetime | None = None
    scheduled_at: datetime | None = None
    created_at: datetime | None = None
    # Campaign results (GEL)
    revenue_total: float | None = None
    roi: float | None = None
    converted: int | None = None
    reached: int | None = None
    conversion_rate: float | None = None
    avg_order_value: float | None = None
    # Meta ad performance (USD — never mixed with GEL)
    meta_spend_usd: float = 0.0
    meta_roas: float | None = None
    meta_impressions: int = 0
    meta_clicks: int = 0


class CampaignCreate(BaseModel):
    """Payload for the 'Add campaign' modal — creates a draft campaign."""
    name: str = Field(min_length=1, max_length=200)
    channel: str = "email"
    promo_type: str | None = None       # bundle | discount | gift | subscription | clearance
    discount_value: float | None = Field(default=None, ge=0, le=100)
    target_segment: str | None = None
    scheduled_at: datetime | None = None


class CampaignProductRow(BaseModel):
    """A product attributed to a campaign via its orders (price in GEL)."""
    sku: str | None = None
    title: str | None = None
    price: float | None = None          # current variant price (GEL)
    compare_at_price: float | None = None
    cost_per_item: float | None = None  # COGS if known
    units: int = 0
    revenue: float = 0.0


class CampaignDetail(CampaignSummary):
    """Full campaign view: promotion terms + attributed products with prices."""
    discount_type: str | None = None      # fixed | percentage | bogo | tiered | clearance
    min_order_value: float | None = None  # fixed bundle price
    valid_from: datetime | None = None
    valid_to: datetime | None = None
    tag_pattern: str | None = None
    excluded_segments: list[str] = []
    products: list[CampaignProductRow] = []


# ---- Promo calculator (real math) ----
class PromoCalcSkuInput(BaseModel):
    sku: str
    full_price: float = Field(gt=0)
    cogs: float = Field(ge=0)


class PromoCalcRequest(BaseModel):
    sku_list: list[PromoCalcSkuInput] = Field(min_length=1)
    discount_pct: float = Field(ge=0, le=1, description="Fraction, e.g. 0.20 = 20%")


class PromoCalcLine(BaseModel):
    sku: str
    full_price: float
    cogs: float
    discounted_price: float
    min_safe_price: float
    max_safe_discount: float
    effective_margin: float
    status: str  # "green" | "red"
    blocked: bool
    reasons: list[str] = []


class PromoCalcResponse(BaseModel):
    discount_pct: float
    blocked: bool  # true if ANY line is blocked
    lines: list[PromoCalcLine]


# ---- Meta Ads overview ----
class MetaCampaignRow(BaseModel):
    meta_campaign_id: str
    meta_campaign_name: str | None = None
    meta_account_id: str | None = None
    spend_usd: float = 0.0
    impressions: int = 0
    clicks: int = 0
    roas: float | None = None


class MetaDailyPoint(BaseModel):
    date: str
    spend_usd: float = 0.0


class MetaOverview(BaseModel):
    period_days: int = 30
    total_spend_usd: float = 0.0
    blended_roas: float | None = None
    total_impressions: int = 0
    total_clicks: int = 0
    campaign_count: int = 0
    below_threshold_count: int = 0
    campaigns: list[MetaCampaignRow] = []
    daily_trend: list[MetaDailyPoint] = []

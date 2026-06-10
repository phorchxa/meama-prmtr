"""Schemas — 05 Campaign Intelligence + promo calculator."""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class CampaignSummary(BaseModel):
    id: str
    name: str
    type: str | None = None
    target_segment: str | None = None
    channel: str | None = None
    discount_pct: float | None = None
    status: str | None = None
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    predicted_reach: int | None = None
    predicted_revenue: float | None = None
    actual_revenue: float | None = None
    approval_status: str | None = None  # pending | approved | edited | rejected


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

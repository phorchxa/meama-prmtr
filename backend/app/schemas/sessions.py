"""Sessions & Behavior schemas."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel

RangeParam = Literal["today", "7d", "30d"]


class SessionsKpis(BaseModel):
    sessions: int
    unique_visitors: int
    registered_share: float
    conversion_rate: float
    avg_duration_seconds: int
    engaged_pct: float


class FunnelRow(BaseModel):
    label: str
    count: int
    pct: float


class WhoIsBrowsing(BaseModel):
    registered: int
    anonymous: int
    warm: int


class TopProduct(BaseModel):
    sku: str
    name: str
    category: str | None = None
    count: int


class ChannelRow(BaseModel):
    channel: str
    count: int
    pct: float


class DeviceRow(BaseModel):
    device_type: str
    count: int
    pct: float


class GeoRow(BaseModel):
    location: str
    count: int
    pct: float


class SessionsOverviewResponse(BaseModel):
    range: RangeParam
    kpis: SessionsKpis
    funnel: list[FunnelRow]
    who: WhoIsBrowsing
    top_products: list[TopProduct]
    top_categories: list[TopProduct]
    viewed_not_bought: list[TopProduct]
    channels: list[ChannelRow]
    devices: list[DeviceRow]
    geo: list[GeoRow]


class RecoverableCart(BaseModel):
    customer_id: str | None = None
    full_name: str | None = None
    email: str | None = None
    segment: str | None = None
    stage: str
    stage_num: int
    cart_value: float
    last_seen: str
    products: list[str] = []


class AbandonmentKpis(BaseModel):
    cart_abandonment_rate: float
    checkout_abandonment_rate: float
    recoverable_carts: int
    recoverable_value: float


class AbandonmentByStage(BaseModel):
    stage: str
    stage_num: int
    count: int


class SourceSplit(BaseModel):
    shopify_abandoned: int
    live_pixel: int


class AbandonmentResponse(BaseModel):
    range: RangeParam
    kpis: AbandonmentKpis
    by_stage: list[AbandonmentByStage]
    source: SourceSplit
    recoverable: list[RecoverableCart]

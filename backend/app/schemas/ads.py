"""Schemas — 06 Ads (Meta). All monetary values are USD."""
from __future__ import annotations

from datetime import date

from pydantic import BaseModel


class AdInsight(BaseModel):
    campaign_id: str
    date: date
    spend_usd: float
    impressions: int
    clicks: int
    roas: float | None = None
    below_roas_threshold: bool = False  # roas < ROAS_ALERT_THRESHOLD


class AdsResponse(BaseModel):
    currency: str = "USD"
    insights: list[AdInsight]
    total_spend_usd: float = 0.0

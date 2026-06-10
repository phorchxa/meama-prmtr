"""Schemas — 01 Command Overview."""
from __future__ import annotations

from pydantic import BaseModel

from .common import TrendPoint


class Kpi(BaseModel):
    key: str
    label: str
    value: float
    unit: str  # "GEL" | "USD" | "count" | "pct"
    delta_pct: float | None = None  # vs previous period
    trend: list[TrendPoint] = []


class OverviewResponse(BaseModel):
    period: str  # e.g. "last_30d"
    currency: str = "GEL"
    kpis: list[Kpi]

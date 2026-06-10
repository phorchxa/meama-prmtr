"""01 Command Overview — KPI grid. Retail channels only."""
from __future__ import annotations

from fastapi import APIRouter

from ..business_rules import RETAIL_CHANNELS
from ..schemas.overview import Kpi, OverviewResponse

router = APIRouter(prefix="/overview", tags=["overview"])


@router.get("", response_model=OverviewResponse)
async def get_overview(period: str = "last_30d") -> OverviewResponse:
    """Top-line KPIs. STUB: returns the KPI shape with zeroed values.

    Phase 1 computes these from `orders` filtered to RETAIL_CHANNELS
    (excludes vending/b2b/collect).
    """
    _retail = RETAIL_CHANNELS  # documents the scope filter applied in Phase 1
    kpis = [
        Kpi(key="revenue", label="Revenue", value=0.0, unit="GEL"),
        Kpi(key="orders", label="Orders", value=0.0, unit="count"),
        Kpi(key="aov", label="Avg Order Value", value=0.0, unit="GEL"),
        Kpi(key="active_customers", label="Active Customers", value=0.0, unit="count"),
        Kpi(key="at_risk_customers", label="At-Risk Customers", value=0.0, unit="count"),
        Kpi(key="meta_spend", label="Meta Ad Spend", value=0.0, unit="USD"),
    ]
    return OverviewResponse(period=period, kpis=kpis)

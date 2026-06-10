"""07 Reports — catalog of exportable reports."""
from __future__ import annotations

from fastapi import APIRouter

from ..schemas.reports import ReportDefinition, ReportsResponse

router = APIRouter(prefix="/reports", tags=["reports"])

_CATALOG = [
    ReportDefinition(
        key="revenue_by_channel",
        title="Revenue by Channel",
        description="Retail revenue split (ecom vs brand_store).",
    ),
    ReportDefinition(
        key="customer_segments",
        title="Customer Segments",
        description="RFM segment distribution and LTV.",
    ),
    ReportDefinition(
        key="product_performance",
        title="Product Performance",
        description="Units sold and revenue per SKU.",
    ),
]


@router.get("", response_model=ReportsResponse)
async def list_reports() -> ReportsResponse:
    """List available reports. STUB catalog; generation wired in Phase 1."""
    return ReportsResponse(reports=_CATALOG)

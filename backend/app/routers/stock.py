"""04 Stock — units on hand, weeks of cover, reorder points."""
from __future__ import annotations

from fastapi import APIRouter

from ..schemas.stock import StockResponse

router = APIRouter(prefix="/stock", tags=["stock"])


@router.get("", response_model=StockResponse)
async def get_stock(low_stock_only: bool = False) -> StockResponse:
    """Stock levels. STUB: empty shape.

    Phase 1: weeks_of_cover = units_on_hand / (avg_daily_sales * 7);
    is_low_stock when weeks_of_cover < LOW_STOCK_WEEKS.
    """
    return StockResponse(items=[], low_stock_count=0)

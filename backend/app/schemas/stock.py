"""Schemas — 04 Stock."""
from __future__ import annotations

from pydantic import BaseModel


class StockItem(BaseModel):
    sku: str
    name: str | None = None
    units_on_hand: int
    avg_daily_sales: float = 0.0
    weeks_of_cover: float | None = None
    reorder_point: float | None = None  # REORDER_POINT_DAYS * avg_daily_sales
    is_low_stock: bool = False  # weeks_of_cover < LOW_STOCK_WEEKS


class StockResponse(BaseModel):
    items: list[StockItem]
    low_stock_count: int = 0

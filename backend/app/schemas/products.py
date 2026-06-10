"""Schemas — 03 Product Intelligence."""
from __future__ import annotations

from pydantic import BaseModel


class ProductSummary(BaseModel):
    sku: str
    name: str
    category: str  # machine | capsule | accessory
    subcategory: str | None = None  # flavoured | origin | functional | classic
    intensity: str | None = None  # light | medium | strong
    format: str | None = None  # 51mm | 37mm
    price: float | None = None
    units_sold: int = 0
    revenue: float = 0.0


class AffinityPair(BaseModel):
    sku_a: str
    sku_b: str
    co_purchase_count: int


class ProductIntelligenceResponse(BaseModel):
    top_products: list[ProductSummary]
    affinities: list[AffinityPair] = []

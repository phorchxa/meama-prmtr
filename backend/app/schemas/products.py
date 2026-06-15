"""Schemas — 03 Product Intelligence."""
from __future__ import annotations

from pydantic import BaseModel


class ProductSummary(BaseModel):
    sku: str
    name: str
    category: str
    subcategory: str | None = None
    price: float
    cogs: float | None = None

    # Enrichment from products_georgia
    image_url: str | None = None

    # Enrichment from Meama Products Bible
    caffeine: str | None = None         # raw string e.g. "70mg"
    caffeine_mg: int | None = None      # parsed integer
    intensity_level: float | None = None
    bitterness: float | None = None
    arabica_pct: float | None = None
    robusta_pct: float | None = None
    flavor_profile: str | None = None
    ingredients: str | None = None
    beverage_type: str | None = None
    bio: bool = False
    compatible_with: str | None = None
    capsule_format: str | None = None   # e.g. "Multicapsule", "European"
    hot_cold: str | None = None

    # Sales stats (from product_stats_cache)
    units_sold_30d: int = 0
    revenue_30d: float = 0.0
    monthly_units: list[int] = []       # 12 months oldest → newest
    repeat_rate: float = 0.0

    # Channel split (from get_product_channel_stats)
    units_30d_web: int = 0
    revenue_30d_web: float = 0.0
    avg_price_web: float | None = None
    units_30d_pos: int = 0
    revenue_30d_pos: float = 0.0
    avg_price_pos: float | None = None

    # Reorder rates (from get_product_reorder_rates)
    total_buyers: int = 0
    reorder_rate_30d: float = 0.0
    reorder_rate_60d: float = 0.0
    reorder_rate_90d: float = 0.0
    retention_rate: float = 0.0

    ai_insight: str | None = None


class AffinityPair(BaseModel):
    sku_a: str
    sku_b: str
    co_orders: int
    name_a: str | None = None
    name_b: str | None = None


class ProductIntelligenceResponse(BaseModel):
    products: list[ProductSummary]
    affinities: list[AffinityPair] = []

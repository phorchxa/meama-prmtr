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

    # ── Enrichment ──────────────────────────────────────────────────────────
    image_url: str | None = None
    caffeine: str | None = None
    caffeine_mg: int | None = None
    intensity_level: float | None = None
    intensity_bucket: str | None = None      # 'light' | 'medium' | 'strong'
    bitterness: float | None = None
    arabica_pct: float | None = None
    robusta_pct: float | None = None
    flavor_profile: str | None = None        # Bible: comma-separated text
    flavor_notes: list[str] = []             # products_georgia: text[] parsed
    ingredients: str | None = None
    beverage_type: str | None = None
    beverage_type_en: str | None = None      # normalised English label
    bio: bool = False
    compatible_with: str | None = None
    capsule_format: str | None = None
    hot_cold: str | None = None
    product_type_geo: str | None = None      # products_georgia.product_type

    # ── 30d + 12-month series (get_product_stats) ────────────────────────────
    units_sold_30d: int = 0
    revenue_30d: float = 0.0
    monthly_units: list[int] = []
    repeat_rate: float = 0.0

    # ── Channel split (get_product_channel_stats) ────────────────────────────
    units_30d_web: int = 0
    revenue_30d_web: float = 0.0
    avg_price_web: float | None = None
    units_30d_pos: int = 0
    revenue_30d_pos: float = 0.0
    avg_price_pos: float | None = None

    # ── Reorder + retention (get_product_reorder_rates) ──────────────────────
    total_buyers: int = 0
    reorder_rate_30d: float = 0.0
    reorder_rate_60d: float = 0.0
    reorder_rate_90d: float = 0.0
    retention_rate: float = 0.0

    # ── New metrics (get_product_new_metrics) ─────────────────────────────────
    total_revenue: float = 0.0          # all-time retail revenue
    total_quantity: int = 0             # all-time retail units sold
    format_rank_pct: float | None = None  # share within same category (90d)
    total_rank_pct: float | None = None   # share of all retail units (90d)
    monthly_growth_pct: float | None = None  # current vs prev month units
    margin_pct: float | None = None     # (revenue_ex_vat – COGS×qty) / revenue_ex_vat; VAT=18% (GEO_VAT_RATE)
    full_price_revenue: float = 0.0
    full_price_units: int = 0
    discounted_revenue: float = 0.0
    discounted_units: int = 0
    avg_monthly_consumption: float = 0.0  # avg units/month last 6 months
    refund_rate: float = 0.0

    # ── Top bundle partner (get_product_top_bundles) ──────────────────────────
    top_bundle_sku: str | None = None
    top_bundle_name: str | None = None
    top_bundle_count: int = 0

    # ── Stock status (derived from avg_monthly_consumption + stock_quantity) ──
    stock_quantity: int | None = None   # units on hand (products_master or geo fallback)
    stock_status: str | None = None     # 'understock' | 'in_stock' | 'overstock'

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

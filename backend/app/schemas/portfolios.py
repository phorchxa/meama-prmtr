"""Portfolios (Customer 360) schemas."""
from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel

CustomerStatus = Literal["new", "active", "at_risk", "lost", "prospect"]
CustomerSegment = Literal["loyalist", "at_risk", "lapsed", "new_machine", "active", "prospect"]
CustomerChannel = Literal["online", "in_store", "app", "mixed", "none"]
CustomerRegion = Literal["tbilisi", "regions", "unknown"]
CapitalVsRegional = Literal["capital", "regional", "unknown"]
MachineConversionStatus = Literal[
    "no_machine",
    "machine_only_no_capsules",
    "machine_then_capsules",
    "capsules_without_machine_purchase",
    "unknown",
]
CapsulePriceRange = Literal["budget", "mid_range", "premium"]
ReturnPeriodLabel = Literal["frequent", "regular", "slow", "lapsed_pattern"]
ChurnReason = Literal[
    "healthy_active",
    "promo_dependent",
    "long_recency_gap",
    "machine_without_capsules",
    "low_frequency",
    "single_category_dependency",
    "new_customer",
    "never_ordered",
    "unknown",
]
DeliveryVsPickupPreference = Literal[
    "delivery",
    "pickup_or_store",
    "mixed",
    "unknown",
]


class SessionProduct(BaseModel):
    sku: str
    title: str


class LatestSession(BaseModel):
    session_id: str | None = None
    products_viewed_sku: list[str] | None = None
    products_carted_sku: list[str] | None = None
    types_viewed: list[str] | None = None
    viewed_products: list[SessionProduct] | None = None
    cart_products: list[SessionProduct] | None = None
    add_to_carts: int | None = None
    converted: bool | None = None


class PortfolioSummary(BaseModel):
    shopify_customer_id: int
    full_name: str
    email: str | None = None
    phone: str | None = None
    phone_only: bool = False
    initials: str
    accept_marketing_email: bool = False
    sms_marketing: bool = False
    region: CustomerRegion
    order_count: int
    total_spend: float
    aov: float
    last_order_at: datetime | None = None
    days_since_last_order: int | None = None
    customer_since: datetime | None = None
    tenure_days: int | None = None
    tenure_months: int | None = None
    active_months: int | None = None
    status: CustomerStatus
    segment: CustomerSegment = "active"
    health_score: int = 0
    recency_score: int | None = None
    frequency_score: int | None = None
    monetary_score: int | None = None
    rfm_label: str | None = None
    has_machine: bool = False
    machine_model: str | None = None
    machine_acquisition_date: datetime | None = None
    machine_to_capsule_conversion_status: MachineConversionStatus | None = None
    channel: CustomerChannel | None = None
    top_product_types: list[str] | None = None
    top_item_title: str | None = None
    capsule_aov: float | None = None
    avg_capsule_packs_per_month: float | None = None
    expected_next_order_date: datetime | None = None
    top_flavors: list[str] | None = None
    format_preferences: list[str] | None = None
    never_bought_capsules_flag: bool | None = None
    favorite_intensity: float | None = None
    intensity_bucket: str | None = None
    avg_capsule_price: float | None = None
    capsule_price_range: CapsulePriceRange | None = None
    bought_capsule_categories: list[str] | None = None
    never_bought_capsule_categories: list[str] | None = None
    avg_return_interval_days: float | None = None
    median_return_interval_days: float | None = None
    return_period_label: ReturnPeriodLabel | None = None
    expected_return_window_start: datetime | None = None
    expected_return_window_end: datetime | None = None
    churn_reason: ChurnReason | None = None
    recommended_next_machine: str | None = None
    delivery_vs_pickup_preference: DeliveryVsPickupPreference | None = None
    promo_orders: int = 0
    promo_spend: float = 0.0
    full_price_spend: float = 0.0
    promo_share: float = 0.0
    capital_vs_regional: CapitalVsRegional | None = None
    ecommerce_share: float | None = None
    brand_store_share: float | None = None
    beverage_type_preference: str | None = None
    bible_match_rate: float | None = None
    never_ordered: bool = False
    is_registered: bool = False
    customer_created_at: datetime | None = None
    # On-site behavior (shopify_customer_behavior + latest shopify_session)
    sessions_30d: int | None = None
    last_session_at: datetime | None = None
    days_since_last_session: int | None = None
    last_funnel_stage: int | None = None
    last_cart_value: float | None = None
    last_viewed_sku: str | None = None
    add_to_carts: int | None = None
    converted: bool | None = None
    viewed_products: list[SessionProduct] | None = None
    cart_products: list[SessionProduct] | None = None
    latest_session: LatestSession | None = None
    checkout_abandons: int | None = None
    session_warm: bool = False
    top_browsed_category: str | None = None
    last_viewed_products: list[str] | None = None
    last_viewed_category: str | None = None
    top_viewed_products: list[str] | None = None
    last_session_channel: str | None = None
    last_session_device: str | None = None
    last_session_city: str | None = None


class OrderRow(BaseModel):
    shopify_order_id: int
    processed_at: datetime | None = None
    total: float = 0.0
    source: str | None = None
    discount_code: str | None = None
    discount_amount: float = 0.0


class PortfolioDetail(PortfolioSummary):
    first_order_at: datetime | None = None
    recent_orders: list[OrderRow] = []

"""Schemas — 02 Customer 360."""
from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel


class CustomerSummary(BaseModel):
    customer_id: str
    first_name: str | None = None
    last_name: str | None = None
    region: str | None = None  # tbilisi | regions
    is_registered: bool = False
    status: str | None = None  # new | active | at_risk | lost
    rfm_segment: str | None = None
    ltv: float | None = None
    last_order_date: date | None = None


class CustomerMetrics(BaseModel):
    recency_score: int | None = None
    frequency_score: int | None = None
    monetary_score: int | None = None
    rfm_segment: str | None = None
    cluster_tag: str | None = None  # Claude output
    churn_score: float | None = None  # Claude output, 0.0–1.0
    upsell_tag: bool | None = None  # Claude output
    status: str | None = None
    ltv: float | None = None
    aov_total: float | None = None
    aov_capsules: float | None = None
    discount_dependency_pct: float | None = None
    has_machine: bool | None = None
    machine_model: str | None = None
    last_order_date: date | None = None
    expected_next_order: date | None = None
    computed_at: datetime | None = None


class CustomerDetail(CustomerSummary):
    email_masked: str | None = None  # never expose full PII downstream
    phone_masked: str | None = None
    registration_date: date | None = None
    metrics: CustomerMetrics | None = None

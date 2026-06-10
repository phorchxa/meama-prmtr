"""MEAMA PRMTR business rules — the SINGLE source of truth.

Every constant the platform reasons about lives here. Do not duplicate these
values elsewhere; import them. See CLAUDE.md for the narrative version.
"""
from __future__ import annotations

# ---- Margin / pricing guardrails ----
MARGIN_FLOOR = 0.40           # minimum gross margin allowed on any promo
MIN_PRICE_MULTIPLIER = 1.6667  # min_safe_price = COGS * MIN_PRICE_MULTIPLIER
MAX_DISCOUNT = 0.25           # hard cap across all campaign types

# ---- Customer lifecycle (calendar days since last order) ----
CHURN_DAYS = 90               # lost: no order for >= 3 calendar months
AT_RISK_MIN_DAYS = 45
AT_RISK_MAX_DAYS = 89

# ---- Stock ----
LOW_STOCK_WEEKS = 2           # low stock: < 2 weeks of trailing avg daily sales
REORDER_POINT_DAYS = 14       # reorder_point = 14 * avg daily sales

# ---- Alerting thresholds ----
ROAS_ALERT_THRESHOLD = 2.0
CANCEL_SPIKE_PCT = 0.15       # cancellations spike
CANCEL_SPIKE_WINDOW_H = 24
REFUND_SHARE_ALERT = 0.05     # refunds > 5% of daily revenue
CHURN_SCORE_ALERT = 0.7       # Claude-produced churn_score threshold

# ---- Scope / metric filters ----
RETAIL_CHANNELS = ("ecom", "brand_store")  # every retail metric filters to these
NON_RETAIL_CHANNELS = ("vending", "b2b", "collect")

# Segments that NEVER receive discounts — early access only.
NO_DISCOUNT_SEGMENTS = ("champion", "capsule_loyalist", "flavour_explorer")

# ---- Metric definitions ----
AOV_EXCLUDES_ZERO_SPEND = True  # ₾0 lifetime customers excluded from AOV
LTV_REGISTERED_ONLY = True


def min_safe_price(cogs: float) -> float:
    """Lowest price that preserves the margin floor for a SKU."""
    return cogs * MIN_PRICE_MULTIPLIER


def max_safe_discount(full_price: float, cogs: float) -> float:
    """Largest discount fraction allowed before breaching the margin floor.

    max_safe_discount = 1 - (COGS * MIN_PRICE_MULTIPLIER / full_price)
    Clamped to [0, MAX_DISCOUNT].
    """
    if full_price <= 0:
        return 0.0
    raw = 1.0 - (min_safe_price(cogs) / full_price)
    return max(0.0, min(raw, MAX_DISCOUNT))

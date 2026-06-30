"""MEAMA PRMTR business rules — the SINGLE source of truth.

Every constant the platform reasons about lives here. Do not duplicate these
values elsewhere; import them. See CLAUDE.md for the narrative version.
"""
from __future__ import annotations

# ---- Margin / pricing guardrails ----
# All margins are NET OF VAT: a price P (gross, incl. VAT) yields ex-VAT revenue
# P / (1 + GEO_VAT_RATE), and margin is measured against that. The 40% floor is a
# net floor; this matches the commercial-master sheet (whose stored full_margin is
# already net of VAT) and the Bundles/B2B tabs labelled "net of VAT".
MARGIN_FLOOR = 0.40           # minimum NET-of-VAT margin allowed on any promo
MIN_PRICE_MULTIPLIER = 1.6667  # net price at the floor = COGS * MIN_PRICE_MULTIPLIER
MAX_DISCOUNT = 0.25           # consumer-deal guideline / B2B entry marker — NOT a hard
                              # block; the binding rule is net_margin < MARGIN_FLOOR
GEO_VAT_RATE = 0.18           # Georgian VAT 18%; revenue / (1 + GEO_VAT_RATE) = ex-VAT revenue

# ---- B2B wholesale (gated channel; never combines with B2C offers) ----
B2B_CAP_TIER_THRESHOLD = 500   # capsules per order; tier boundary
B2B_CAP_DISCOUNT_UNDER = 0.25  # capsule discount under the threshold
B2B_CAP_DISCOUNT_OVER = 0.30   # capsule discount at/over the threshold
B2B_ACCESSORY_DISCOUNT = 0.15  # flat accessory wholesale discount (machines = ecom)

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
# "ecom" covers: website orders, mobile app orders, AND call-centre orders
#   (all arrive via Shopify web channel → source='web' in the DB).
# "brand_store" covers: physical POS / retail store orders (source='pos').
# Vending, B2B, and Collect are stored but excluded from every retail KPI.
RETAIL_CHANNELS = ("ecom", "brand_store")
NON_RETAIL_CHANNELS = ("vending", "b2b", "collect")

# Raw Shopify source strings in meama_georgia_orders that map to retail channels.
# Used in SQL RPCs and Python queries — keep in sync with every source IN (...) clause.
# shopify_draft_order = admin/phone-created paid orders, counted as ecom.
RETAIL_ORDER_SOURCES = (
    "web", "online_store", "Online Store", "195189899265",  # ecom
    "shopify_draft_order",                                  # ecom (admin/phone)
    "pos",                                                  # brand_store
)

# Segments that NEVER receive discounts — early access only.
NO_DISCOUNT_SEGMENTS = ("champion", "capsule_loyalist", "flavour_explorer")

# ---- Metric definitions ----
AOV_EXCLUDES_ZERO_SPEND = True  # ₾0 lifetime customers excluded from AOV
LTV_REGISTERED_ONLY = True


def min_safe_price(cogs: float) -> float:
    """Lowest GROSS price (incl. VAT) that preserves the net margin floor.

    At net price COGS * 1.6667 the net margin is exactly 40%; expressed as a gross
    price that is COGS * MIN_PRICE_MULTIPLIER * (1 + GEO_VAT_RATE).
    """
    return cogs * MIN_PRICE_MULTIPLIER * (1 + GEO_VAT_RATE)


def max_safe_discount(full_price: float, cogs: float) -> float:
    """Largest discount fraction allowed before breaching the net margin floor.

    max_safe_discount = 1 - (min_safe_price(cogs) / full_price), floored at 0.
    NOT capped at MAX_DISCOUNT — the true ceiling can exceed 25% (e.g. high-margin
    categories); 25% is only an advisory guideline, never the binding constraint.
    """
    if full_price <= 0:
        return 0.0
    return max(0.0, 1.0 - (min_safe_price(cogs) / full_price))


def net_margin(price: float, cogs: float) -> float:
    """Net-of-VAT margin at a given gross price.

    net_margin = (price/(1+VAT) - COGS) / (price/(1+VAT)).
    """
    if price <= 0:
        return 0.0
    net = price / (1 + GEO_VAT_RATE)
    return (net - cogs) / net if net > 0 else 0.0

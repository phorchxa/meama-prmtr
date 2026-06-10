"""Stage 2 — clean, dedupe, and channel-tag staged data.

Channel tagging is the load-bearing transform: every order row is tagged with one
of ecom / brand_store / vending / b2b / collect. Retail metrics downstream filter
to (ecom, brand_store); the rest are kept but excluded.
"""
from __future__ import annotations

CHANNELS = ("ecom", "brand_store", "vending", "b2b", "collect")
RETAIL_CHANNELS = ("ecom", "brand_store")


def transform(con) -> dict:
    """Run cleaning + tagging over DuckDB staging tables. STUB — Phase 1.

    Phase 1 steps:
      1. normalize types/dates, trim strings, standardize phone/email formats
      2. dedupe on natural keys (shopify_order_id, shopify_customer_id, sku)
      3. derive `channel` per order from source table + flags
      4. resolve region -> (tbilisi | regions)
      5. emit clean tables ready for push
    """
    _ = (CHANNELS, RETAIL_CHANNELS)
    return {"status": "stub", "stage": "transform"}

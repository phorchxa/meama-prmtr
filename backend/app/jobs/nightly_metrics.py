"""Nightly recompute of `customer_metrics` (RFM, status). Rule-based — NO ML.

RFM: recency/frequency/monetary quintile scores (1–5) over RETAIL_CHANNELS only.
Status from days-since-last-order:
  active   < AT_RISK_MIN_DAYS
  at_risk  AT_RISK_MIN_DAYS..AT_RISK_MAX_DAYS
  lost     >= CHURN_DAYS
  new      first order within recency window / no prior history
LTV registered-only; AOV excludes ₾0-lifetime customers.
"""
from __future__ import annotations

from ..business_rules import (
    AT_RISK_MAX_DAYS,
    AT_RISK_MIN_DAYS,
    CHURN_DAYS,
    RETAIL_CHANNELS,
)


def run() -> dict:
    """Recompute customer_metrics. STUB skeleton — implemented in Phase 1."""
    _ = (RETAIL_CHANNELS, AT_RISK_MIN_DAYS, AT_RISK_MAX_DAYS, CHURN_DAYS)
    # TODO(phase1):
    #   1. pull retail orders per customer (filter to RETAIL_CHANNELS)
    #   2. compute RFM quintiles + status flags (pandas/SQL)
    #   3. upsert into customer_metrics, set computed_at
    #   4. write a sync_log row
    return {"status": "stub", "job": "nightly_metrics", "updated": 0}


if __name__ == "__main__":
    print(run())

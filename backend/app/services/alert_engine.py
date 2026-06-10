"""Alert rule evaluation + cooldown dedup skeleton.

Flow (Phase 1):
  1. Evaluate each rule against fresh data -> candidate alerts.
  2. Dedup: skip if an open alert of the same (type, entity_id) exists within the
     rule's cooldown window.
  3. Persist surviving alerts to `alerts` BEFORE dispatch.
  4. Dispatch via Telegram, recording channels_sent + a sync_log row.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import timedelta

from ..business_rules import (
    CANCEL_SPIKE_PCT,
    CANCEL_SPIKE_WINDOW_H,
    CHURN_SCORE_ALERT,
    REFUND_SHARE_ALERT,
    ROAS_ALERT_THRESHOLD,
)


@dataclass(frozen=True)
class AlertRule:
    type: str
    severity: str  # critical | high | medium
    cooldown: timedelta
    description: str


# Per-type rules + cooldowns. Thresholds come from business_rules (no magic numbers).
ALERT_RULES: dict[str, AlertRule] = {
    "low_roas": AlertRule(
        "low_roas", "high", timedelta(hours=24),
        f"ROAS below {ROAS_ALERT_THRESHOLD}",
    ),
    "cancel_spike": AlertRule(
        "cancel_spike", "critical", timedelta(hours=CANCEL_SPIKE_WINDOW_H),
        f"Cancellations > {CANCEL_SPIKE_PCT:.0%} in {CANCEL_SPIKE_WINDOW_H}h",
    ),
    "refund_share": AlertRule(
        "refund_share", "high", timedelta(hours=24),
        f"Refunds > {REFUND_SHARE_ALERT:.0%} of daily revenue",
    ),
    "high_churn": AlertRule(
        "high_churn", "medium", timedelta(days=7),
        f"churn_score >= {CHURN_SCORE_ALERT}",
    ),
    "low_stock": AlertRule(
        "low_stock", "high", timedelta(days=1),
        "Stock below low-stock threshold",
    ),
}


@dataclass
class CandidateAlert:
    type: str
    entity_id: str | None
    message: str
    severity: str = ""
    channels_sent: list[str] = field(default_factory=list)


def is_duplicate(candidate: CandidateAlert, supabase) -> bool:
    """True if an open alert of the same (type, entity_id) is within cooldown.

    STUB: real query in Phase 1. Cooldown-dedup query pattern:
        SELECT 1 FROM alerts
        WHERE type = :type AND entity_id IS NOT DISTINCT FROM :entity_id
          AND status = 'open'
          AND created_at > now() - :cooldown
        LIMIT 1;
    """
    raise NotImplementedError("alert_engine.is_duplicate is stubbed — Phase 1.")


def evaluate_rules(supabase) -> list[CandidateAlert]:
    """Evaluate all ALERT_RULES against current data. STUB: returns []."""
    # TODO(phase1): one evaluator per rule, reading aggregates from Postgres.
    return []

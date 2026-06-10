"""Evaluate alert rules, dedup by cooldown, persist, then dispatch via Telegram."""
from __future__ import annotations

from ..services import alert_engine


def run() -> dict:
    """Run the alert pipeline. STUB skeleton — implemented in Phase 1."""
    # TODO(phase1):
    #   candidates = alert_engine.evaluate_rules(supabase)
    #   for c in candidates:
    #       if alert_engine.is_duplicate(c, supabase): continue
    #       insert into alerts (status='open')         # persist BEFORE dispatch
    #       telegram.send_message(format_alert_message(c.severity, c.message))
    #       update channels_sent; write sync_log
    candidates = alert_engine.evaluate_rules(supabase=None)
    return {"status": "stub", "job": "alert_runner", "raised": len(candidates)}


if __name__ == "__main__":
    print(run())

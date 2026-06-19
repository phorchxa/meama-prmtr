"""Win-back trigger — fires every 5 minutes.

Finds at-risk customers who abandoned checkout (funnel_stage >= 4), have been
quiet for WINBACK_QUIET_MINUTES, and haven't received a message in
WINBACK_COOLDOWN_HOURS.  Sends via Omnisend (email preferred, SMS fallback).
Logs every attempt to shopify_winback_triggers for dedup and audit.

CONSENT IS MANDATORY: accept_marketing_email gating for email,
sms_marketing gating for SMS — never both skipped.
"""
from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta

from ..config import get_settings
from ..deps import _supabase_client
from ..services.omnisend import send_winback_email, send_winback_sms

logger = logging.getLogger(__name__)


async def run_winback_trigger() -> dict:
    """Identify candidates and fire win-back offers. Returns {fired, skipped, errors}."""
    settings = get_settings()
    sb = _supabase_client()

    now = datetime.now(UTC)
    quiet_cutoff = (now - timedelta(minutes=settings.winback_quiet_minutes)).isoformat()
    cooldown_cutoff = (now - timedelta(hours=settings.winback_cooldown_hours)).isoformat()
    target_statuses = [s.strip() for s in settings.winback_target_statuses.split(",") if s.strip()]

    # ── 1. Candidate sessions: funnel >= threshold, not converted, gone quiet ──
    sess_res = (
        sb.table("shopify_sessions")
        .select("session_id,customer_id,cart_value_peak,funnel_stage,ended_at")
        .gte("funnel_stage", settings.winback_funnel_stage_min)
        .eq("converted", False)
        .lte("ended_at", quiet_cutoff)
        .not_.is_("customer_id", "null")
        .execute()
    )
    sessions = sess_res.data or []
    if not sessions:
        logger.debug("winback: no candidate sessions")
        return {"fired": 0, "skipped": 0, "errors": 0}

    customer_ids = list({s["customer_id"] for s in sessions})
    session_ids = [s["session_id"] for s in sessions]

    # ── 2. Portfolio data — at_risk customers with marketing consent ──
    pf_res = (
        sb.table("portfolio_customers")
        .select(
            "shopify_customer_id,full_name,email,phone,"
            "accept_marketing_email,sms_marketing,status,total_spend"
        )
        .in_("shopify_customer_id", customer_ids[:200])
        .in_("status", target_statuses)
        .execute()
    )
    portfolio_map = {str(r["shopify_customer_id"]): r for r in (pf_res.data or [])}

    # ── 3. Dedup: sessions already triggered ──
    dedup_sess_res = (
        sb.table("shopify_winback_triggers")
        .select("session_id")
        .in_("session_id", session_ids[:200])
        .execute()
    )
    triggered_sessions: set[str] = {r["session_id"] for r in (dedup_sess_res.data or [])}

    # ── 4. Dedup: customers triggered within cooldown window ──
    dedup_cust_res = (
        sb.table("shopify_winback_triggers")
        .select("customer_id")
        .in_("customer_id", customer_ids[:200])
        .gte("fired_at", cooldown_cutoff)
        .execute()
    )
    triggered_customers: set[str] = {r["customer_id"] for r in (dedup_cust_res.data or [])}

    # ── 5. Process each candidate ──
    fired = skipped = errors = 0

    for sess in sessions:
        sid = sess["session_id"]
        cid = sess["customer_id"]

        if sid in triggered_sessions or cid in triggered_customers:
            continue

        pf = portfolio_map.get(cid)
        if not pf:
            continue  # not at_risk or not in portfolio

        can_email = bool(pf.get("accept_marketing_email")) and bool(pf.get("email"))
        can_sms = bool(pf.get("sms_marketing")) and bool(pf.get("phone"))
        if not (can_email or can_sms):
            continue  # consent gate — never send without explicit opt-in

        channel = "email" if can_email else "sms"
        cart_value = float(sess.get("cart_value_peak") or 0)
        full_name = pf.get("full_name") or ""

        provider_ref: str | None = None
        status: str

        if not settings.omnisend_api_key:
            # No API key configured — log as skipped so the dedup row still exists
            status = "skipped"
            skipped += 1
            logger.info("winback skipped (no OMNISEND_API_KEY): session=%s customer=%s", sid, cid)
        else:
            try:
                if channel == "email":
                    provider_ref = await send_winback_email(
                        settings.omnisend_api_key,
                        pf["email"], full_name, cart_value, sid,
                    )
                else:
                    provider_ref = await send_winback_sms(
                        settings.omnisend_api_key,
                        pf["phone"], full_name, cart_value, sid,
                    )
                status = "sent"
                fired += 1
                logger.info(
                    "winback sent: session=%s customer=%s channel=%s cart=%.0f ref=%s",
                    sid, cid, channel, cart_value, provider_ref,
                )
            except Exception as exc:
                status = "failed"
                errors += 1
                logger.error("winback Omnisend error: session=%s error=%s", sid, exc)

        # Always log — even skipped/failed — so the dedup guard holds
        try:
            sb.table("shopify_winback_triggers").insert({
                "session_id": sid,
                "customer_id": cid,
                "channel": channel,
                "cart_value": cart_value if cart_value else None,
                "status": status,
                "provider_ref": provider_ref,
            }).execute()
        except Exception as exc:
            logger.error("winback log insert failed: session=%s error=%s", sid, exc)

        # Prevent double-firing within this same batch run
        triggered_sessions.add(sid)
        triggered_customers.add(cid)

    result = {"fired": fired, "skipped": skipped, "errors": errors}
    logger.info("winback run complete: %s", result)
    return result

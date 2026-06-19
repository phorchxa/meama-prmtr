"""Omnisend integration — win-back event trigger.

Fires a custom event ('winback_checkout_abandon') that triggers the matching
automation in the Omnisend dashboard.  The automation template controls copy,
timing, and channel (email vs SMS) — this layer only signals the intent.

Consent enforcement happens BEFORE this module is called; this module assumes
the caller has already validated accept_marketing_email / sms_marketing.
"""
from __future__ import annotations

import logging

import httpx

logger = logging.getLogger(__name__)

_BASE = "https://api.omnisend.com/v3"
_EVENT_NAME = "winback_checkout_abandon"
_TIMEOUT = 10  # seconds


async def _fire_event(
    api_key: str,
    identifier: dict,           # {"email": "..."} or {"phone": "+995…"}
    full_name: str,
    cart_value: float,
    session_id: str,
) -> str:
    """POST a custom event to Omnisend and return the eventID."""
    payload = {
        **identifier,
        "eventName": _EVENT_NAME,
        "systemName": "meama_crm",
        "origin": "api",
        "properties": {
            "firstName": (full_name or "").split()[0] if full_name else "",
            "cartValue": round(cart_value, 2),
            "sessionId": session_id,
        },
    }
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        resp = await client.post(
            f"{_BASE}/events",
            headers={"X-API-KEY": api_key, "Content-Type": "application/json"},
            json=payload,
        )
        resp.raise_for_status()
        data = resp.json()
        return str(data.get("eventID") or data.get("id") or "ok")


async def send_winback_email(
    api_key: str,
    email: str,
    full_name: str,
    cart_value: float,
    session_id: str,
) -> str:
    """Trigger win-back automation for an email-consented customer."""
    if not email:
        raise ValueError("email is required for email channel")
    return await _fire_event(api_key, {"email": email}, full_name, cart_value, session_id)


async def send_winback_sms(
    api_key: str,
    phone: str,
    full_name: str,
    cart_value: float,
    session_id: str,
) -> str:
    """Trigger win-back automation for an SMS-consented customer."""
    if not phone:
        raise ValueError("phone is required for sms channel")
    return await _fire_event(api_key, {"phone": phone}, full_name, cart_value, session_id)

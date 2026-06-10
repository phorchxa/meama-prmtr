"""Telegram Bot API wrapper — sendMessage with severity emoji + Tbilisi time."""
from __future__ import annotations

from datetime import UTC, datetime, timedelta, timezone

from ..config import get_settings

TBILISI_TZ = timezone(timedelta(hours=4))  # Asia/Tbilisi (GMT+4)

SEVERITY_EMOJI = {
    "critical": "🚨",
    "high": "⚠️",
    "medium": "ℹ️",
}


def tbilisi_timestamp(dt: datetime | None = None) -> str:
    """Format a timestamp in Asia/Tbilisi (GMT+4), ka-GE friendly."""
    dt = (dt or datetime.now(UTC)).astimezone(TBILISI_TZ)
    return dt.strftime("%Y-%m-%d %H:%M") + " (GMT+4)"


def format_alert_message(severity: str, message: str, dt: datetime | None = None) -> str:
    emoji = SEVERITY_EMOJI.get(severity, "ℹ️")
    return f"{emoji} {message}\n🕒 {tbilisi_timestamp(dt)}"


def send_message(text: str, *, chat_id: str | None = None) -> dict:
    """Send a Telegram message. STUB: real httpx POST implemented in Phase 1.

    Phase 1: POST https://api.telegram.org/bot<token>/sendMessage
    with {chat_id, text, parse_mode}. Caller writes the alert to `alerts` and
    records dispatch in channels_sent / sync_log — never fail silently.
    """
    settings = get_settings()
    _token = settings.telegram_bot_token
    _chat = chat_id or settings.telegram_chat_id
    # TODO(phase1): httpx.post(url, json={"chat_id": _chat, "text": text})
    raise NotImplementedError("telegram.send_message is stubbed — implemented in Phase 1.")

"""Schemas — 08 Alerts."""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class Alert(BaseModel):
    id: str
    type: str
    severity: str  # critical | high | medium
    entity_id: str | None = None
    message: str
    status: str = "open"  # open | resolved
    channels_sent: list[str] = []
    created_at: datetime | None = None


class AlertsResponse(BaseModel):
    items: list[Alert]
    open_count: int = 0

"""Schemas — 09 Action Queue."""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class Action(BaseModel):
    id: str
    priority: int = Field(ge=1, le=5)
    action_type: str
    customer_or_segment: str | None = None
    trigger_signal: str | None = None
    suggested_offer: str | None = None
    estimated_revenue_impact: float | None = None
    deadline: datetime | None = None
    status: str = "pending"  # pending | in_progress | done


class ActionsResponse(BaseModel):
    items: list[Action]
    pending_count: int = 0

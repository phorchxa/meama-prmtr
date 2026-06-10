"""Shared schema primitives."""
from __future__ import annotations

from datetime import datetime
from typing import Generic, TypeVar

from pydantic import BaseModel, Field

T = TypeVar("T")


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int = 1
    page_size: int = 50


class Money(BaseModel):
    """Currency-tagged amount. Order data is GEL; Meta Ads data is USD."""

    amount: float
    currency: str = Field(default="GEL", pattern="^(GEL|USD)$")


class TrendPoint(BaseModel):
    label: str
    value: float


class Health(BaseModel):
    status: str = "ok"
    service: str = "meama-prmtr-backend"
    environment: str
    time: datetime

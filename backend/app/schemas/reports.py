"""Schemas — 07 Reports."""
from __future__ import annotations

from pydantic import BaseModel


class ReportDefinition(BaseModel):
    key: str
    title: str
    description: str
    formats: list[str] = ["json", "csv"]


class ReportsResponse(BaseModel):
    reports: list[ReportDefinition]

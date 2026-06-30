"""Social KPI dashboard endpoint — organic TikTok + Instagram + Facebook placeholder.

GET /api/v1/social-kpis/overview
  Returns a SocialKpisResponse with per-platform metrics and explicit status fields
  (ok / insufficient_history / not_available / not_connected) so the frontend can
  render distinct visual states without guessing from null values.

Visible to: admin, analyst, marketing (no financial data).
"""
from __future__ import annotations

import time
from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Query, Response

from ..deps import get_supabase
from ..schemas.social_kpis import SocialKpisResponse
from ..services.social_kpis import get_social_kpis

router = APIRouter(prefix="/social-kpis", tags=["social-kpis"])

TBILISI = ZoneInfo("Asia/Tbilisi")
_CACHE_TTL = 300  # 5 minutes — social stats sync at most daily

# Keyed by period_days so different period requests don't collide
_cache: dict[str, Any] = {}


@router.get("/overview", response_model=SocialKpisResponse)
async def get_overview(
    period_days: int = Query(default=30, ge=7, le=90, description="Rolling window in days"),
    sb=Depends(get_supabase),
    response: Response = None,
):
    """Organic social KPIs — TikTok + Instagram + Facebook/MeamaCorner/X placeholders."""
    key = str(period_days)
    cached = _cache.get(key)
    if cached and (time.time() - cached["ts"]) < _CACHE_TTL:
        if response:
            response.headers["Cache-Control"] = "s-maxage=300, stale-while-revalidate=60"
        return cached["data"]

    now = datetime.now(TBILISI)
    result = get_social_kpis(sb, now, period_days)

    _cache[key] = {"ts": time.time(), "data": result}
    if response:
        response.headers["Cache-Control"] = "s-maxage=300, stale-while-revalidate=60"
    return result

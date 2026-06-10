"""06 Ads (Meta). All amounts in USD — never mixed with GEL."""
from __future__ import annotations

from fastapi import APIRouter

from ..schemas.ads import AdsResponse

router = APIRouter(prefix="/ads", tags=["ads"])


@router.get("", response_model=AdsResponse)
async def get_ads(date_from: str | None = None, date_to: str | None = None) -> AdsResponse:
    """Meta ad insights. STUB: empty shape.

    Phase 1: pulled from `meta_insights` (synced via services/meta_api.py);
    below_roas_threshold flags roas < ROAS_ALERT_THRESHOLD.
    """
    return AdsResponse(insights=[], total_spend_usd=0.0)

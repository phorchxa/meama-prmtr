"""08 Alerts — readable by all authenticated users."""
from __future__ import annotations

from fastapi import APIRouter

from ..schemas.alerts import AlertsResponse

router = APIRouter(prefix="/alerts", tags=["alerts"])


@router.get("", response_model=AlertsResponse)
async def list_alerts(status: str = "open") -> AlertsResponse:
    """List alerts. STUB: empty shape.

    Alerts are written to the `alerts` table before dispatch (see
    services/alert_engine.py) and respect per-type cooldown dedup.
    """
    return AlertsResponse(items=[], open_count=0)

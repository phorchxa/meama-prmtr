"""09 Action Queue — prioritized next-best-actions."""
from __future__ import annotations

from fastapi import APIRouter

from ..schemas.actions import ActionsResponse

router = APIRouter(prefix="/actions", tags=["actions"])


@router.get("", response_model=ActionsResponse)
async def list_actions(status: str = "pending") -> ActionsResponse:
    """List queued actions ordered by priority. STUB: empty shape."""
    return ActionsResponse(items=[], pending_count=0)

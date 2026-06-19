"""08 Alerts — reads from the alerts table. Returns empty list if not populated."""
from __future__ import annotations

from fastapi import APIRouter, Depends

from ..deps import get_supabase

router = APIRouter(prefix="/alerts", tags=["alerts"])


@router.get("")
async def list_alerts(
    status: str = "open",
    limit: int = 50,
    sb=Depends(get_supabase),
):
    """List alerts from the alerts table, ordered by created_at DESC.

    Returns an empty list if the table is not populated — never fakes data.
    status: 'open' | 'resolved' | 'all'
    """
    try:
        q = (
            sb.table("alerts")
            .select("id, type, severity, entity_id, message, status, channels_sent, created_at")
            .order("created_at", desc=True)
            .limit(limit)
        )
        if status != "all":
            q = q.eq("status", status)
        rows = q.execute().data or []
    except Exception:
        rows = []

    open_count = sum(1 for r in rows if r.get("status") == "open")

    return {
        "items": rows,
        "open_count": open_count,
    }

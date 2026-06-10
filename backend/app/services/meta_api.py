"""Meta Marketing API (Graph API) client stub. All amounts are USD."""
from __future__ import annotations

from datetime import date

from ..config import get_settings

GRAPH_API_VERSION = "v21.0"


class MetaApiClient:
    """Graph API client using a System User token. Fetches ad insights."""

    def __init__(self):
        settings = get_settings()
        self._token = settings.meta_system_user_token
        self._ad_account_id = settings.meta_ad_account_id  # act_...

    def fetch_insights(
        self,
        date_from: date,
        date_to: date,
        *,
        fields: tuple[str, ...] = ("spend", "impressions", "clicks", "purchase_roas"),
    ) -> list[dict]:
        """Fetch insights for the ad account between two dates.

        STUB: real call implemented in Phase 1. Signature is stable so callers
        and `services/alert_engine` can be wired against it.

        Phase 1: GET /{GRAPH_API_VERSION}/{ad_account_id}/insights
            params: time_range, level, fields, time_increment=1
        Results upserted into `meta_insights` (unique campaign_id+date),
        every sync writing a `sync_log` row.
        """
        raise NotImplementedError(
            "MetaApiClient.fetch_insights is stubbed — implemented in Phase 1."
        )

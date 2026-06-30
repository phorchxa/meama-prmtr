"""Meta Marketing API (Graph API) client. All amounts are USD."""
from __future__ import annotations

import json
import logging
import time
from datetime import date

import httpx

from ..config import get_settings

logger = logging.getLogger(__name__)
GRAPH_API_VERSION = "v21.0"
GRAPH_BASE = f"https://graph.facebook.com/{GRAPH_API_VERSION}"


class MetaApiClient:
    """Graph API client. Uses META_ACCESS_TOKEN (falls back to META_SYSTEM_USER_TOKEN)."""

    def __init__(self):
        settings = get_settings()
        self._token = settings.meta_access_token or settings.meta_system_user_token
        self._account_ids = [
            a.strip()
            for a in settings.meta_ad_account_ids.split(",")
            if a.strip()
        ]
        if not self._token:
            raise RuntimeError(
                "No Meta token configured. Set META_ACCESS_TOKEN in environment."
            )

    def fetch_insights(
        self,
        date_from: date,
        date_to: date,
        *,
        fields: tuple[str, ...] = (
            "campaign_id", "campaign_name", "spend",
            "impressions", "clicks", "purchase_roas",
        ),
    ) -> list[dict]:
        """Fetch daily campaign-level insights across all configured ad accounts.

        Returns a list of dicts with keys: account_id, campaign_id, campaign_name,
        date, spend_usd, impressions, clicks, roas.
        """
        all_rows: list[dict] = []
        for account_id in self._account_ids:
            rows = self._fetch_account(account_id, date_from, date_to, fields)
            all_rows.extend(rows)
            logger.info(
                "Meta sync: %s → %d rows (%s → %s)",
                account_id, len(rows), date_from, date_to,
            )
        return all_rows

    def _fetch_account(
        self,
        account_id: str,
        date_from: date,
        date_to: date,
        fields: tuple[str, ...],
    ) -> list[dict]:
        rows: list[dict] = []
        params: dict = {
            "access_token": self._token,
            "level": "campaign",
            "fields": ",".join(fields),
            "time_range": json.dumps({"since": str(date_from), "until": str(date_to)}),
            "time_increment": "1",
            "limit": 500,
        }
        url = f"{GRAPH_BASE}/{account_id}/insights"

        while True:
            try:
                r = httpx.get(url, params=params, timeout=30)
                r.raise_for_status()
                data = r.json()
            except Exception as exc:
                logger.error("Meta API error for %s: %s", account_id, exc)
                break

            if "error" in data:
                logger.error("Meta API error %s: %s", account_id, data["error"])
                break

            for row in data.get("data", []):
                roas_list = row.get("purchase_roas", [])
                roas = float(roas_list[0]["value"]) if roas_list else None
                rows.append({
                    "account_id":    account_id,
                    "campaign_id":   str(row["campaign_id"]),
                    "campaign_name": row["campaign_name"],
                    "date":          row["date_start"],
                    "spend_usd":     float(row.get("spend", 0)),
                    "impressions":   int(row.get("impressions", 0)),
                    "clicks":        int(row.get("clicks", 0)),
                    "roas":          roas,
                })

            cursor = data.get("paging", {}).get("cursors", {}).get("after")
            if not cursor or not data.get("data"):
                break
            params["after"] = cursor
            time.sleep(0.2)

        return rows

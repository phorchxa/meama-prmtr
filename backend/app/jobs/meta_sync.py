"""Nightly Meta ad insights sync.

Fetches the last 8 days of daily campaign-level insights from all configured
Meta ad accounts and upserts them into campaigns.meta_insights via the
public.upsert_meta_insights RPC.

8-day rolling window: Meta can retroactively update attribution data up to
7 days back, so we always re-fetch the last week to stay accurate.
"""
from __future__ import annotations

import json
import logging
import sys
from datetime import date, timedelta

from supabase import create_client

from ..config import get_settings
from ..services.meta_api import MetaApiClient

logger = logging.getLogger(__name__)
BATCH_SIZE = 500
LOOKBACK_DAYS = 8


def run() -> None:
    settings = get_settings()

    if not settings.meta_access_token and not settings.meta_system_user_token:
        logger.warning("META_ACCESS_TOKEN not set — skipping Meta sync.")
        return

    client = MetaApiClient()
    sb = create_client(settings.supabase_url, settings.supabase_service_role_key)

    date_to = date.today()
    date_from = date_to - timedelta(days=LOOKBACK_DAYS)

    logger.info("Meta sync: fetching %s → %s", date_from, date_to)
    rows = client.fetch_insights(date_from, date_to)
    logger.info("Meta sync: %d insight rows fetched", len(rows))

    if not rows:
        logger.info("Meta sync: nothing to upsert.")
        return

    # Shape rows for the RPC
    payload = [
        {
            "meta_campaign_id":   r["campaign_id"],
            "meta_campaign_name": r["campaign_name"],
            "meta_account_id":    r["account_id"],
            "date":               r["date"],
            "spend_usd":          r["spend_usd"],
            "impressions":        r["impressions"],
            "clicks":             r["clicks"],
            "roas":               r["roas"],
        }
        for r in rows
    ]

    # Upsert in batches via public.upsert_meta_insights RPC
    total_upserted = 0
    for i in range(0, len(payload), BATCH_SIZE):
        batch = payload[i : i + BATCH_SIZE]
        try:
            res = sb.rpc("upsert_meta_insights", {"rows": json.dumps(batch)}).execute()
            inserted = res.data or 0
            total_upserted += int(inserted)
            logger.info(
                "Meta sync batch %d/%d: %d rows upserted",
                i // BATCH_SIZE + 1,
                (len(payload) + BATCH_SIZE - 1) // BATCH_SIZE,
                inserted,
            )
        except Exception as exc:
            logger.error("Meta sync batch %d failed: %s", i // BATCH_SIZE + 1, exc)

    logger.info("Meta sync complete: %d total rows upserted.", total_upserted)


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    run()

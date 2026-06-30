"""Geo resolver — runs every 10 minutes.

Reads shopify_pixel_events rows where ip_address IS NOT NULL and geo_country IS
NULL, resolves each IP against DB-IP Lite (.mmdb), writes geo_country /
geo_region / geo_city, then nulls ip_address when DROP_IP_AFTER is true.

After this runs, shopify_sessions.geo_* auto-populate (the VIEW aggregates from
pixel events), and the Sessions overview "Device & region" section fills in.

Env:
  DBIP_MMDB_PATH   — absolute path to the DB-IP City Lite .mmdb file
  DROP_IP_AFTER    — if true (default), null ip_address after resolving (privacy)
"""
from __future__ import annotations

import logging
from ipaddress import AddressValueError
from ipaddress import ip_address as parse_ip

from ..config import get_settings
from ..deps import _supabase_client

logger = logging.getLogger(__name__)

_BATCH = 500  # events per run


def _resolve(reader, raw_ip: str) -> tuple[str | None, str | None, str | None]:
    """Return (country_iso, region_name, city_name) or (None, None, None) on miss."""
    try:
        parse_ip(raw_ip)  # validate before passing to reader
    except (AddressValueError, ValueError):
        return None, None, None

    try:
        record = reader.get(raw_ip)
    except Exception:
        return None, None, None

    if not record:
        return None, None, None

    country = (record.get("country") or {}).get("iso_code")
    subdivisions = record.get("subdivisions") or []
    region = (subdivisions[0].get("names") or {}).get("en") if subdivisions else None
    city = ((record.get("city") or {}).get("names") or {}).get("en")
    return country, region, city


async def run_geo_resolver() -> dict:
    """Resolve unresolved IPs and optionally drop them. Returns {resolved, skipped, errors}."""
    settings = get_settings()

    if not settings.dbip_mmdb_path:
        logger.debug("geo_resolver: DBIP_MMDB_PATH not set — skipping")
        return {"resolved": 0, "skipped": 0, "errors": 0, "note": "DBIP_MMDB_PATH not configured"}

    import os
    if not os.path.isfile(settings.dbip_mmdb_path):
        logger.warning("geo_resolver: MMDB file not found at %s", settings.dbip_mmdb_path)
        return {"resolved": 0, "skipped": 0, "errors": 0, "note": "mmdb_not_found"}

    try:
        import maxminddb
    except ImportError:
        logger.error("geo_resolver: maxminddb package not installed")
        return {"resolved": 0, "skipped": 0, "errors": 0, "note": "maxminddb_not_installed"}

    sb = _supabase_client()

    # Fetch events with unresolved IPs
    rows_res = (
        sb.table("shopify_pixel_events")
        .select("id,ip_address")
        .not_.is_("ip_address", "null")
        .is_("geo_country", "null")
        .limit(_BATCH)
        .execute()
    )
    rows = rows_res.data or []
    if not rows:
        logger.debug("geo_resolver: no unresolved IPs")
        return {"resolved": 0, "skipped": 0, "errors": 0}

    resolved = skipped = errors = 0

    with maxminddb.open_database(settings.dbip_mmdb_path) as reader:
        for row in rows:
            raw_ip = row.get("ip_address")
            if not raw_ip:
                continue

            country, region, city = _resolve(reader, raw_ip)

            update: dict = {
                "geo_country": country,
                "geo_region": region,
                "geo_city": city,
            }
            if settings.drop_ip_after:
                update["ip_address"] = None

            try:
                sb.table("shopify_pixel_events").update(update).eq("id", row["id"]).execute()
                if country:
                    resolved += 1
                else:
                    skipped += 1  # unknown IP — still dropped if drop_ip_after
            except Exception as exc:
                logger.error("geo_resolver update failed: id=%s ip=%s error=%s", row["id"], raw_ip, exc)
                errors += 1

    result = {"resolved": resolved, "skipped": skipped, "errors": errors}
    logger.info("geo_resolver run complete: %s", result)
    return result

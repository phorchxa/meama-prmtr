"""
Load Shopify discounts CSV export → campaigns.shopify_discounts

Usage:
    python3 pipeline/load_discounts_csv.py pipeline/data/raw/discounts.csv

The CSV has no numeric Shopify IDs, so we derive a stable synthetic shopify_id
from the discount code using SHA-256. Synthetic IDs have bit 62 set (> 4.6e18),
far above real Shopify IDs (~10^10), so they never collide. Webhook-sourced rows
(real IDs) coexist cleanly.

Requires: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env
"""

import csv
import hashlib
import os
import sys
from datetime import datetime, timezone

from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

SUPABASE_URL = os.environ["SUPABASE_URL"]
SERVICE_KEY  = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

# bit 62 set → synthetic IDs live in a range Shopify never reaches
def synthetic_id(code: str) -> int:
    digest = hashlib.sha256(code.encode()).digest()
    base   = int.from_bytes(digest[:7], "big") & ((1 << 55) - 1)
    return base | (1 << 62)


def parse_dt(val: str) -> str | None:
    val = val.strip()
    if not val:
        return None
    # Shopify exports: "2026-06-22 01:24:35 +0400"
    try:
        dt = datetime.strptime(val, "%Y-%m-%d %H:%M:%S %z")
        return dt.isoformat()
    except ValueError:
        return None


def parse_bool(val: str) -> bool:
    return val.strip() == "1"


def map_type(type_col: str, class_col: str) -> str:
    """Normalise the Type + Discount Class columns to our discount_type values."""
    t = type_col.strip().lower()
    c = class_col.strip().lower()
    if "percentage" in t or "percent" in c:
        return "percentage"
    if "free shipping" in t or "shipping" in c:
        return "free_shipping"
    if "buy" in t and "get" in t:
        return "buy_x_get_y"
    if "app" in t:
        return "app"
    return "fixed_amount"


def main(csv_path: str) -> None:
    sb = create_client(SUPABASE_URL, SERVICE_KEY)

    rows: list[dict] = []
    with open(csv_path, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for raw in reader:
            code  = raw["Name"].strip()
            if not code:
                continue

            value_raw = raw["Value"].strip()
            value     = abs(float(value_raw)) if value_raw else None

            vtype = raw["Value Type"].strip()   # fixed_amount | percentage | app
            if vtype == "app":
                vtype = "fixed_amount"          # treat app discounts as opaque

            status = raw["Status"].strip()      # Active | Expired | Scheduled

            usage_limit_raw = raw.get("Usage Limit Per Code", "").strip()
            usage_limit     = int(usage_limit_raw) if usage_limit_raw else None

            rows.append({
                "shopify_id":                synthetic_id(code),
                "title":                     code,
                "status":                    status.upper(),
                "discount_type":             map_type(raw["Type"], raw["Discount Class"]),
                "value":                     value,
                "value_type":                vtype,
                "code":                      code,
                "usage_count":               int(raw.get("Times Used In Total", "0") or 0),
                "usage_limit":               usage_limit,
                "applies_once_per_customer": parse_bool(raw.get("Applies Once Per Customer", "0")),
                "starts_at":                 parse_dt(raw.get("Start", "")),
                "ends_at":                   parse_dt(raw.get("End", "")),
                "raw":                       dict(raw),
                "shopify_created_at":        parse_dt(raw.get("Start", "")),
                "shopify_updated_at":        None,
                "synced_at":                 datetime.now(timezone.utc).isoformat(),
            })

    print(f"Loaded {len(rows)} rows from CSV")

    # deduplicate by shopify_id — keep last occurrence (most recent status)
    seen: dict[int, dict] = {}
    for row in rows:
        seen[row["shopify_id"]] = row
    rows = list(seen.values())
    print(f"After dedup: {len(rows)} unique rows")

    # upsert in batches of 200
    for i in range(0, len(rows), 200):
        chunk = rows[i : i + 200]
        sb.schema("campaigns").from_("shopify_discounts").upsert(
            chunk, on_conflict="shopify_id"
        ).execute()
        print(f"  upserted {i + 1}–{i + len(chunk)}")

    print(f"\nDone — {len(rows)} discounts in campaigns.shopify_discounts")


if __name__ == "__main__":
    path = sys.argv[1] if len(sys.argv) > 1 else "pipeline/data/raw/discounts.csv"
    main(path)

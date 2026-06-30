"""
Backfill all Shopify discounts (price rules + codes) into campaigns.shopify_discounts.

Usage:
    python pipeline/backfill_shopify_discounts.py

Requires env vars (same as the rest of the backend):
    SHOPIFY_SHOP_DOMAIN       e.g. meama-georgia.myshopify.com
    SHOPIFY_ADMIN_API_TOKEN   Admin API token (read_discounts scope)
    SUPABASE_URL
    SUPABASE_SERVICE_ROLE_KEY
"""

import os
import sys
import time
import requests
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

SHOP_DOMAIN = os.environ["SHOPIFY_SHOP_DOMAIN"].rstrip("/")
TOKEN = os.environ["SHOPIFY_ADMIN_API_TOKEN"]
SUPABASE_URL = os.environ["SUPABASE_URL"]
SERVICE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
API_VERSION = "2024-10"

BASE = f"https://{SHOP_DOMAIN}/admin/api/{API_VERSION}"
HEADERS = {"X-Shopify-Access-Token": TOKEN, "Content-Type": "application/json"}


def shopify_get(path: str, params: dict | None = None) -> dict:
    resp = requests.get(f"{BASE}{path}", headers=HEADERS, params=params or {}, timeout=30)
    if resp.status_code == 429:
        retry = int(resp.headers.get("Retry-After", "2"))
        print(f"  rate limited — sleeping {retry}s")
        time.sleep(retry)
        return shopify_get(path, params)
    resp.raise_for_status()
    return resp.json()


def fetch_all_price_rules() -> list[dict]:
    rules, page_info = [], None
    while True:
        params: dict = {"limit": 250}
        if page_info:
            params["page_info"] = page_info
        data = shopify_get("/price_rules.json", params)
        batch = data.get("price_rules", [])
        rules.extend(batch)
        print(f"  fetched {len(rules)} price rules so far…")
        # Shopify cursor pagination via Link header
        link = requests.head.__doc__  # placeholder — check actual header below
        break  # handled below
    return rules


def fetch_all_price_rules_paginated() -> list[dict]:
    """Cursor-paginated fetch of all price rules."""
    rules: list[dict] = []
    url = f"{BASE}/price_rules.json"
    params: dict = {"limit": 250}

    while url:
        resp = requests.get(url, headers=HEADERS, params=params, timeout=30)
        if resp.status_code == 429:
            wait = int(resp.headers.get("Retry-After", "2"))
            print(f"  rate limited — sleeping {wait}s")
            time.sleep(wait)
            continue
        resp.raise_for_status()
        batch = resp.json().get("price_rules", [])
        rules.extend(batch)
        print(f"  {len(rules)} price rules fetched…")

        # parse next page from Link header
        link_header = resp.headers.get("Link", "")
        next_url = None
        for part in link_header.split(","):
            part = part.strip()
            if 'rel="next"' in part:
                next_url = part.split(";")[0].strip().strip("<>")
                break
        url = next_url
        params = {}  # page_info is embedded in next_url already

    return rules


def fetch_codes_for_rule(rule_id: int) -> list[dict]:
    data = shopify_get(f"/price_rules/{rule_id}/discount_codes.json", {"limit": 250})
    return data.get("discount_codes", [])


def map_row(rule: dict, codes: list[dict]) -> dict:
    first_code = codes[0]["code"] if codes else None
    vtype = rule.get("value_type", "")           # percentage | fixed_amount
    raw_value = rule.get("value", "0") or "0"
    value = abs(float(raw_value))                 # Shopify stores discounts as negative

    # derive status
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)
    starts = rule.get("starts_at")
    ends = rule.get("ends_at")

    if ends and datetime.fromisoformat(ends.replace("Z", "+00:00")) < now:
        status = "EXPIRED"
    elif starts and datetime.fromisoformat(starts.replace("Z", "+00:00")) > now:
        status = "SCHEDULED"
    else:
        status = "ACTIVE"

    total_usage = sum(int(c.get("usage_count", 0)) for c in codes)

    return {
        "shopify_id": int(rule["id"]),
        "title": rule.get("title") or "",
        "status": status,
        "discount_type": vtype,
        "value": value,
        "value_type": vtype,
        "code": first_code,
        "usage_count": total_usage,
        "usage_limit": rule.get("usage_limit"),
        "applies_once_per_customer": rule.get("once_per_customer", False),
        "starts_at": rule.get("starts_at"),
        "ends_at": rule.get("ends_at"),
        "raw": {**rule, "discount_codes": codes},
        "shopify_created_at": rule.get("created_at"),
        "shopify_updated_at": rule.get("updated_at"),
    }


def main() -> None:
    sb = create_client(SUPABASE_URL, SERVICE_KEY)

    print("Fetching all price rules from Shopify…")
    rules = fetch_all_price_rules_paginated()
    print(f"Total price rules: {len(rules)}")

    rows = []
    for i, rule in enumerate(rules, 1):
        codes = fetch_codes_for_rule(int(rule["id"]))
        rows.append(map_row(rule, codes))
        if i % 50 == 0:
            print(f"  processed {i}/{len(rules)}")
        time.sleep(0.05)  # gentle rate limiting

    print(f"\nUpserting {len(rows)} rows into campaigns.shopify_discounts…")
    # batch upsert in chunks of 100
    for i in range(0, len(rows), 100):
        chunk = rows[i : i + 100]
        res = sb.schema("campaigns").from_("shopify_discounts").upsert(
            chunk, on_conflict="shopify_id"
        ).execute()
        print(f"  upserted rows {i+1}–{i+len(chunk)}")

    print(f"\nDone. {len(rows)} discounts synced to campaigns.shopify_discounts.")


if __name__ == "__main__":
    main()

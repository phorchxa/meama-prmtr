"""
Sync bundle catalog from Shopify → campaigns.bundle_catalog

Pulls products from all three bundle apps:
  - Simple Bundles & Kits   (metafield ns: simple-bundles)
  - Easy Bundle Builder      (metafield ns: easy-bundle)
  - Wiz: Checkout Upsell    (product_type or tag: mix-and-match / wiz-bundle)

Usage:
    python3 pipeline/sync_bundle_catalog.py

Requires in .env:
    SHOPIFY_SHOP_DOMAIN         e.g. meama-georgia.myshopify.com
    SHOPIFY_ADMIN_API_TOKEN     shpat_... (preferred)
      OR
    SHOPIFY_CLIENT_ID + SHOPIFY_CLIENT_SECRET   (fetches a fresh 24h token)
    SUPABASE_URL
    SUPABASE_SERVICE_ROLE_KEY
"""

import json
import os
import time
from datetime import datetime, timezone

import requests
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

SHOP_DOMAIN   = os.environ["SHOPIFY_SHOP_DOMAIN"].rstrip("/")
SUPABASE_URL  = os.environ["SUPABASE_URL"]
SERVICE_KEY   = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
API_VERSION   = os.environ.get("SHOPIFY_API_VERSION", "2024-10")

BASE = f"https://{SHOP_DOMAIN}/admin/api/{API_VERSION}"


# ── Auth ──────────────────────────────────────────────────────────────────────

def get_token() -> str:
    """Return a valid Admin API token — direct token preferred over client credentials."""
    direct = os.environ.get("SHOPIFY_ADMIN_API_TOKEN", "").strip()
    if direct:
        return direct

    client_id     = os.environ["SHOPIFY_CLIENT_ID"]
    client_secret = os.environ["SHOPIFY_CLIENT_SECRET"]
    resp = requests.post(
        f"https://{SHOP_DOMAIN}/admin/oauth/access_token",
        data={
            "grant_type":    "client_credentials",
            "client_id":     client_id,
            "client_secret": client_secret,
        },
        timeout=20,
    )
    resp.raise_for_status()
    token = resp.json().get("access_token", "")
    if not token:
        raise RuntimeError(f"No access_token in response: {resp.text}")
    print("Obtained fresh OAuth token (valid 24h)")
    return token


# ── Shopify REST helpers ──────────────────────────────────────────────────────

def shopify_get(headers: dict, path: str, params: dict | None = None) -> dict:
    url = f"{BASE}{path}"
    while True:
        resp = requests.get(url, headers=headers, params=params or {}, timeout=30)
        if resp.status_code == 429:
            wait = int(resp.headers.get("Retry-After", "2"))
            print(f"  rate limited — sleeping {wait}s")
            time.sleep(wait)
            continue
        resp.raise_for_status()
        return resp.json()


def fetch_products_paginated(headers: dict, extra_params: dict | None = None) -> list[dict]:
    """Fetch all products matching extra_params, cursor-paginated."""
    products: list[dict] = []
    url = f"{BASE}/products.json"
    params: dict = {"limit": 250, **(extra_params or {})}

    while url:
        resp = requests.get(url, headers=headers, params=params, timeout=30)
        if resp.status_code == 429:
            wait = int(resp.headers.get("Retry-After", "2"))
            time.sleep(wait)
            continue
        resp.raise_for_status()
        batch = resp.json().get("products", [])
        products.extend(batch)
        print(f"  {len(products)} products fetched…")

        link = resp.headers.get("Link", "")
        url = next_page = None
        for part in link.split(","):
            if 'rel="next"' in part:
                next_page = part.split(";")[0].strip().strip("<>")
                break
        url = next_page
        params = {}

    return products


def fetch_metafields(headers: dict, product_id: int) -> list[dict]:
    data = shopify_get(headers, f"/products/{product_id}/metafields.json", {"limit": 250})
    return data.get("metafields", [])


# ── App detection & component parsing ────────────────────────────────────────

# Known metafield namespaces per app
_APP_NS = {
    "simple_bundles": {"simple-bundles", "simple_bundles"},
    "easy_bundle":    {"easy-bundle", "easybundle", "easy_bundle"},
    "wiz":            {"wiz", "wiz-bundle", "checkout-upsell"},
}


def detect_app(product: dict, metafields: list[dict]) -> str:
    """Identify which bundle app owns this product."""
    ns_set = {mf["namespace"] for mf in metafields}
    for app, namespaces in _APP_NS.items():
        if ns_set & namespaces:
            return app

    # Fallback: check product type and tags
    ptype = (product.get("product_type") or "").lower()
    tags  = [t.strip().lower() for t in (product.get("tags") or "").split(",")]

    if "simple" in ptype or any("simple" in t for t in tags):
        return "simple_bundles"
    if "easy" in ptype or any("easy" in t for t in tags):
        return "easy_bundle"
    if "wiz" in ptype or any("wiz" in t for t in tags) or "mix" in ptype:
        return "wiz"
    return "unknown"


def parse_components(metafields: list[dict]) -> tuple[list[str], list[str]]:
    """
    Extract component SKUs and titles from metafields.
    Each app stores components differently — we try common formats.
    Returns (skus, titles).
    """
    skus: list[str]   = []
    titles: list[str] = []

    for mf in metafields:
        ns  = mf.get("namespace", "")
        key = mf.get("key", "")
        val = mf.get("value", "")

        # Skip non-component metafields
        if key not in ("components", "bundle_config", "items", "products", "line_items"):
            continue

        try:
            data = json.loads(val)
        except (json.JSONDecodeError, TypeError):
            continue

        # Simple Bundles format: list of {sku, title, quantity}
        if isinstance(data, list):
            for item in data:
                if isinstance(item, dict):
                    sku   = item.get("sku") or item.get("variant_sku") or ""
                    title = item.get("title") or item.get("product_title") or ""
                    if sku:
                        skus.append(str(sku))
                    if title:
                        titles.append(str(title))

        # Easy Bundle format: sometimes {products: [...]}
        elif isinstance(data, dict):
            items = data.get("products") or data.get("items") or data.get("components") or []
            for item in items:
                if isinstance(item, dict):
                    sku   = item.get("sku") or item.get("variant_sku") or ""
                    title = item.get("title") or ""
                    if sku:
                        skus.append(str(sku))
                    if title:
                        titles.append(str(title))

    return skus, titles


def is_bundle_product(product: dict, metafields: list[dict]) -> bool:
    """True if this product belongs to any of the three bundle apps."""
    ns_set = {mf["namespace"] for mf in metafields}
    for namespaces in _APP_NS.values():
        if ns_set & namespaces:
            return True

    ptype = (product.get("product_type") or "").lower()
    tags  = [t.strip().lower() for t in (product.get("tags") or "").split(",")]
    bundle_keywords = {"bundle", "kit", "mix", "wiz", "simple", "easy"}
    return (
        any(kw in ptype for kw in bundle_keywords)
        or any(any(kw in t for kw in bundle_keywords) for t in tags)
    )


# ── Main ──────────────────────────────────────────────────────────────────────

def build_row(product: dict, metafields: list[dict]) -> dict:
    app           = detect_app(product, metafields)
    skus, titles  = parse_components(metafields)
    variants      = product.get("variants") or []
    price         = float(variants[0]["price"]) if variants else None
    compare_price = float(variants[0]["compare_at_price"]) if variants and variants[0].get("compare_at_price") else None

    return {
        "shopify_product_id": int(product["id"]),
        "title":              product.get("title") or "",
        "bundle_app":         app,
        "status":             (product.get("status") or "active").lower(),
        "price":              price,
        "compare_at_price":   compare_price,
        "component_skus":     skus or None,
        "component_titles":   titles or None,
        "raw":                {
            "product_type": product.get("product_type"),
            "tags":         product.get("tags"),
            "metafields":   [
                {"namespace": m["namespace"], "key": m["key"], "value": m["value"]}
                for m in metafields
            ],
        },
        "shopify_created_at": product.get("created_at"),
        "shopify_updated_at": product.get("updated_at"),
        "synced_at":          datetime.now(timezone.utc).isoformat(),
    }


def main() -> None:
    token   = get_token()
    headers = {"X-Shopify-Access-Token": token, "Content-Type": "application/json"}
    sb      = create_client(SUPABASE_URL, SERVICE_KEY)

    print("Fetching all Shopify products…")
    all_products = fetch_products_paginated(headers)
    print(f"Total products from Shopify: {len(all_products)}")

    rows: list[dict] = []
    for i, product in enumerate(all_products, 1):
        metafields = fetch_metafields(headers, int(product["id"]))
        time.sleep(0.05)  # gentle rate limiting

        if not is_bundle_product(product, metafields):
            continue

        rows.append(build_row(product, metafields))
        if len(rows) % 10 == 0 or i == len(all_products):
            print(f"  [{i}/{len(all_products)}] {len(rows)} bundles identified…")

    print(f"\nFound {len(rows)} bundle products across all apps")

    # Summary by app
    from collections import Counter
    counts = Counter(r["bundle_app"] for r in rows)
    for app, n in sorted(counts.items()):
        print(f"  {app}: {n}")

    if not rows:
        print("Nothing to upsert.")
        return

    print(f"\nUpserting {len(rows)} rows to campaigns.bundle_catalog…")
    for i in range(0, len(rows), 50):
        chunk = rows[i : i + 50]
        sb.schema("campaigns").from_("bundle_catalog").upsert(
            chunk, on_conflict="shopify_product_id"
        ).execute()
        print(f"  upserted {i + 1}–{i + len(chunk)}")

    print(f"\nDone — {len(rows)} bundles in campaigns.bundle_catalog")


if __name__ == "__main__":
    main()

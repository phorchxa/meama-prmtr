"""Shared products_georgia catalog helpers.

products_georgia.variant_sku is NOT unique — the same SKU appears as ACTIVE /
DRAFT / ARCHIVED rows, plus separate "(POS)" and "Tier Point" copies. Joining
to it naively fans out (5-10x), so every consumer must collapse it to ONE
canonical row per variant_sku first. These helpers are that single source of
truth (mirrors the geo_dedup CTE in migration 0018).
"""
from __future__ import annotations

import re


def _f(v) -> float:
    try:
        return float(v) if v is not None else 0.0
    except (TypeError, ValueError):
        return 0.0


def geo_rank(r: dict) -> tuple:
    """Sort key for choosing the canonical row of a duplicated variant_sku:
    ACTIVE > non-(POS) > non-Tier-Point > higher (real, non-zero) price."""
    pt = r.get("product_type") or ""
    title = r.get("title") or ""
    return (
        r.get("status") == "ACTIVE",
        "(pos)" not in pt.lower(),
        "tier point" not in title.lower(),
        _f(r.get("variant_price")),
    )


def clean_category(product_type: str | None) -> str | None:
    """Strip a trailing ' (POS)' marker from a products_georgia product_type."""
    cat = re.sub(r"\s*\(POS\)\s*$", "", (product_type or ""), flags=re.IGNORECASE).strip()
    return cat or None


def dedupe_geo(rows: list[dict], key: str = "variant_sku") -> dict[str, dict]:
    """Collapse products_georgia rows to one canonical row per variant_sku."""
    out: dict[str, dict] = {}
    for r in rows:
        k = r.get(key)
        if not k:
            continue
        cur = out.get(k)
        if cur is None or geo_rank(r) > geo_rank(cur):
            out[k] = r
    return out


def normalize_status(raw: str | None) -> str:
    """products_georgia.status (ACTIVE/DRAFT/ARCHIVED) → lowercase; default active.
    The UI 'Cancelled' tab maps to 'archived'."""
    s = (raw or "").strip().lower()
    return s if s in ("active", "draft", "archived") else "active"


def fetch_fina_stock(sb) -> dict[str, int]:
    """Map product_code → total on-hand balance (sul_nashti) from fina_stock.

    Fina is the source of truth for stock (per the business). product_code equals
    products_georgia.variant_sku == order_items.sku. Paginated; duplicate codes
    are summed (a SKU split across Fina product rows = combined balance).
    """
    out: dict[str, int] = {}
    start = 0
    while True:
        try:
            rows = (
                sb.table("fina_stock")
                .select("product_code, sul_nashti")
                .range(start, start + 999)
                .execute()
                .data or []
            )
        except Exception:
            break
        for r in rows:
            code = r.get("product_code")
            if not code:
                continue
            try:
                qty = int(r.get("sul_nashti") or 0)
            except (TypeError, ValueError):
                qty = 0
            out[code] = out.get(code, 0) + qty
        if len(rows) < 1000:
            break
        start += 1000
    return out

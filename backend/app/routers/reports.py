"""07 Reports — catalog of exportable reports."""
from __future__ import annotations

import csv
import io
import re
from collections import defaultdict
from datetime import datetime

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from ..business_rules import RETAIL_ORDER_SOURCES
from ..deps import get_supabase
from ..schemas.reports import ReportDefinition, ReportsResponse

router = APIRouter(prefix="/reports", tags=["reports"])

_CATALOG = [
    ReportDefinition(
        key="revenue_by_channel",
        title="Revenue by Channel",
        description="Retail revenue split (ecom vs brand_store).",
    ),
    ReportDefinition(
        key="customer_segments",
        title="Customer Segments",
        description="RFM segment distribution and LTV.",
    ),
    ReportDefinition(
        key="product_performance",
        title="Product Performance",
        description="Units sold and revenue per SKU.",
    ),
]


@router.get("", response_model=ReportsResponse)
async def list_reports() -> ReportsResponse:
    """List available reports. STUB catalog; generation wired in Phase 1."""
    return ReportsResponse(reports=_CATALOG)


def _clean_title(t: str) -> str:
    t = re.sub(r"\s*[\-–]\s*Tier Point\s*$", "", t, flags=re.IGNORECASE)
    t = re.sub(r"\s*\(POS\)\s*$", "", t, flags=re.IGNORECASE)
    return t.rstrip(".").strip()


@router.get("/at-risk-export")
async def at_risk_export(sb=Depends(get_supabase)):
    """Export at-risk customers with capsule history from their last 3 orders."""

    # ── 1. At-risk customers with a phone number ──────────────────────
    # NOTE: do NOT use .not_.is_("phone", "null") — causes silent empty result
    # in this supabase-py version. Filter phone in Python instead.
    res = (
        sb.table("portfolio_customers")
        .select("shopify_customer_id,full_name,phone,last_order_at,days_since_last_order")
        .eq("status", "at_risk")
        .eq("never_ordered", False)
        .order("days_since_last_order", desc=True)
        .execute()
    )
    customers = [c for c in (res.data or []) if c.get("phone")]

    def _empty_csv() -> StreamingResponse:
        buf = io.StringIO()
        buf.write("﻿")
        csv.writer(buf).writerow(
            ["სახელი", "გვარი", "მობილური", "ბოლო შეკვეთა", "კაფსულები (ბოლო 3 შეკვ.)"]
        )
        buf.seek(0)
        return StreamingResponse(
            iter([buf.getvalue()]),
            media_type="text/csv; charset=utf-8-sig",
            headers={"Content-Disposition": "attachment; filename=at_risk_customers.csv"},
        )

    if not customers:
        return _empty_csv()

    customer_ids = [int(c["shopify_customer_id"]) for c in customers]

    # ── 2. Last 3 orders per customer (chunked to stay under URL limit) ─
    orders_by_customer: dict[int, list[int]] = defaultdict(list)
    _CHUNK = 80
    for i in range(0, len(customer_ids), _CHUNK):
        chunk = customer_ids[i : i + _CHUNK]
        chunk_res = (
            sb.table("meama_georgia_orders")
            .select("shopify_order_id,customer_id,processed_at")
            .in_("customer_id", chunk)
            .neq("financial_status", "voided")
            .is_("cancelled_at", "null")
            .in_("source", list(RETAIL_ORDER_SOURCES))
            .order("processed_at", desc=True)
            .limit(1000)
            .execute()
        )
        for o in chunk_res.data or []:
            cid = int(o["customer_id"])
            if len(orders_by_customer[cid]) < 3:
                orders_by_customer[cid].append(int(o["shopify_order_id"]))

    all_order_ids = [oid for oids in orders_by_customer.values() for oid in oids]

    # ── 3. Capsule items from those orders (chunked) ──────────────────
    capsule_map: dict[int, set[str]] = defaultdict(set)
    if all_order_ids:
        item_rows: list[dict] = []
        for i in range(0, len(all_order_ids), _CHUNK):
            ir = (
                sb.table("meama_georgia_order_items")
                .select("shopify_order_id,sku,title")
                .in_("shopify_order_id", all_order_ids[i : i + _CHUNK])
                .limit(1000)
                .execute()
            )
            item_rows.extend(ir.data or [])

        skus = list({r["sku"] for r in item_rows if r.get("sku")})
        sku_type_map: dict[str, str] = {}
        sku_title_map: dict[str, str] = {}
        if skus:
            pg_res = (
                sb.table("products_georgia")
                .select("variant_sku,product_type,title")
                .in_("variant_sku", skus)
                .execute()
            )
            for pg in pg_res.data or []:
                sku = pg.get("variant_sku")
                if sku:
                    sku_type_map[sku] = pg.get("product_type", "")
                    sku_title_map[sku] = pg.get("title", "")

        order_to_customer: dict[int, int] = {}
        for cid, oids in orders_by_customer.items():
            for oid in oids:
                order_to_customer[oid] = cid

        for item in item_rows:
            oid = item.get("shopify_order_id")
            sku = item.get("sku", "")
            if "capsule" not in sku_type_map.get(sku, "").lower():
                continue
            raw_title = sku_title_map.get(sku) or item.get("title") or ""
            if not raw_title or "tier point" in raw_title.lower():
                continue
            title = _clean_title(raw_title)
            if not title:
                continue
            cid = order_to_customer.get(oid)
            if cid is not None:
                capsule_map[cid].add(title)

    # ── 4. Build CSV (UTF-8 BOM for Excel) ───────────────────────────
    buf = io.StringIO()
    buf.write("﻿")
    writer = csv.writer(buf)
    writer.writerow(["სახელი", "გვარი", "მობილური", "ბოლო შეკვეთა", "კაფსულები (ბოლო 3 შეკვ.)"])

    for c in customers:
        full_name = (c.get("full_name") or "").strip()
        parts = full_name.split(" ", 1)
        first = parts[0] if parts else ""
        last = parts[1] if len(parts) > 1 else ""
        phone = c.get("phone") or ""
        last_order = ""
        raw_date = c.get("last_order_at")
        if raw_date:
            try:
                dt = datetime.fromisoformat(str(raw_date).replace("Z", "+00:00"))
                last_order = dt.strftime("%d/%m/%Y")
            except Exception:
                last_order = str(raw_date)[:10]
        cid = c["shopify_customer_id"]
        capsules = ", ".join(sorted(capsule_map.get(cid, set())))
        writer.writerow([first, last, phone, last_order, capsules])

    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv; charset=utf-8-sig",
        headers={"Content-Disposition": "attachment; filename=at_risk_customers.csv"},
    )

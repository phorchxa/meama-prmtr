"""
Products Bible field audit — read-only PostgREST queries.
"""
import io, sys, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

import httpx
from collections import Counter

SUPABASE_URL = "https://oquuapdsleffspiwmlzs.supabase.co"
SERVICE_KEY = (
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"
    ".eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9xdXVhcGRzbGVmZnNwaXdtbHpzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjY1NTAwNSwiZXhwIjoyMDg4MjMxMDA1fQ"
    ".lWIYwKPtTJtNrvXpRYMdfPen_yaTjpzo9QfpC_y6u8I"
)
BASE = f"{SUPABASE_URL}/rest/v1"
H = {
    "apikey": SERVICE_KEY,
    "Authorization": f"Bearer {SERVICE_KEY}",
    "Accept-Profile": "public",
}

def get(path, params=None, prefer=None):
    headers = dict(H)
    if prefer:
        headers["Prefer"] = prefer
    return httpx.get(f"{BASE}/{path}", headers=headers, params=params or {}, timeout=30)

TABLE = "Meama Products Bible"

# ── 1. Column schema via information_schema ──────────────────────────────────
print("=" * 80)
print("1. ALL COLUMNS IN \"Meama Products Bible\"")
print("=" * 80)
r = get("information_schema.columns", {
    "select": "column_name,data_type,is_nullable",
    "table_schema": "eq.public",
    "table_name": f"eq.{TABLE}",
    "order": "ordinal_position",
    "limit": 100,
})
print(f"HTTP {r.status_code}")
if r.status_code < 400:
    cols = r.json()
    print(f"\n{'column_name':<40} {'data_type':<30} {'is_nullable'}")
    print("-" * 80)
    for c in cols:
        print(f"{c['column_name']:<40} {c['data_type']:<30} {c['is_nullable']}")
    print(f"\n→ {len(cols)} columns total")
else:
    print(f"Error: {r.text[:400]}")
    # Fallback: infer columns from a sample row
    print("\nFallback — inferring columns from sample row:")
    rf = get(TABLE, {"limit": 1})
    print(f"HTTP {rf.status_code}")
    if rf.status_code < 400:
        row = rf.json()
        if row:
            print(f"\n{'column_name':<50} {'python_type'}")
            print("-" * 70)
            for k, v in row[0].items():
                print(f"{k:<50} {type(v).__name__}")
            print(f"\n→ {len(row[0])} columns inferred from first row")

# ── 2. Sample 5 rows ─────────────────────────────────────────────────────────
print("\n" + "=" * 80)
print("2. SAMPLE 5 ROWS — ALL COLUMNS")
print("=" * 80)
r2 = get(TABLE, {"limit": 5})
print(f"HTTP {r2.status_code}")
if r2.status_code < 400:
    rows = r2.json()
    print(f"\n{len(rows)} rows returned")
    for i, row in enumerate(rows, 1):
        print(f"\n--- Row {i} ---")
        for k, v in row.items():
            val = str(v) if v is not None else "NULL"
            print(f"  {k:<45} {val[:80]}")
else:
    print(f"Error: {r2.text[:400]}")

# ── 3. Intensity level distribution (fetch all, group in Python) ──────────────
print("\n" + "=" * 80)
print("3. INTENSITY LEVEL DISTRIBUTION")
print("=" * 80)
r3 = get(TABLE, {
    "select": "Intensity level",
    "Intensity level": "not.is.null",
    "limit": 2000,
})
print(f"HTTP {r3.status_code}")
if r3.status_code < 400:
    rows3 = r3.json()
    counts = Counter(row.get("Intensity level") for row in rows3 if row.get("Intensity level") is not None)
    print(f"\n{'Intensity level':<20} {'products':>8}")
    print("-" * 32)
    for level in sorted(counts.keys(), key=lambda x: (float(x) if str(x).replace('.','').isdigit() else 999)):
        print(f"{str(level):<20} {counts[level]:>8}")
    print(f"\n→ {len(rows3)} rows with non-null intensity")
else:
    print(f"Error: {r3.text[:400]}")

# ── 4. Match rate: FINA CODE vs order_items SKU ───────────────────────────────
print("\n" + "=" * 80)
print("4. FINA CODE vs ORDER_ITEMS SKU MATCH RATE")
print("=" * 80)

# Fetch all Bible Fina Codes
print("Fetching Bible Fina Codes…")
r_bible = get(TABLE, {"select": "Fina Code", "limit": 5000})
print(f"  Bible HTTP {r_bible.status_code}")
if r_bible.status_code >= 400:
    print(f"Error: {r_bible.text[:300]}")
else:
    bible_rows = r_bible.json()
    bible_codes = {row["Fina Code"] for row in bible_rows if row.get("Fina Code")}
    print(f"  Bible has {len(bible_codes)} unique Fina Codes")

    # Fetch order_items SKUs (paginate — could be large)
    print("Fetching order_items SKUs…")
    page_size = 10000
    offset = 0
    all_items = []
    while True:
        ri = get("meama_georgia_order_items", {
            "select": "sku",
            "sku": "not.is.null",
            "sku": "neq.",
            "limit": page_size,
            "offset": offset,
        })
        if ri.status_code >= 400:
            print(f"  order_items HTTP {ri.status_code}: {ri.text[:200]}")
            break
        batch = ri.json()
        all_items.extend(batch)
        print(f"  fetched {len(all_items)} items so far…")
        if len(batch) < page_size:
            break
        offset += page_size

    total_li = len(all_items)
    matched = sum(1 for row in all_items if row.get("sku") in bible_codes)
    unmatched = total_li - matched
    match_pct = round(matched / total_li * 100, 1) if total_li else 0

    print(f"\n{'total_line_items':<25} {total_li:>10}")
    print(f"{'matched_to_bible':<25} {matched:>10}")
    print(f"{'unmatched':<25} {unmatched:>10}")
    print(f"{'match_rate_pct':<25} {match_pct:>9}%")

# ── 5. Unmatched SKU sample ──────────────────────────────────────────────────
print("\n" + "=" * 80)
print("5. UNMATCHED SKUs (TOP 20 BY OCCURRENCE)")
print("=" * 80)
# Reuse data from step 4 — fetch sku+title for unmatched
print("Fetching sku+title from order_items…")
page_size2 = 10000
offset2 = 0
all_with_title = []
while True:
    ri2 = get("meama_georgia_order_items", {
        "select": "sku,title",
        "sku": "not.is.null",
        "limit": page_size2,
        "offset": offset2,
    })
    if ri2.status_code >= 400:
        print(f"HTTP {ri2.status_code}: {ri2.text[:200]}")
        break
    batch2 = ri2.json()
    all_with_title.extend(batch2)
    if len(batch2) < page_size2:
        break
    offset2 += page_size2

if all_with_title and 'bible_codes' in dir():
    unmatched_items = [
        (row["sku"], row.get("title", ""))
        for row in all_with_title
        if row.get("sku") and row["sku"] not in bible_codes
    ]
    sku_counts: dict[tuple, int] = {}
    for sku, title in unmatched_items:
        key = (sku, title or "")
        sku_counts[key] = sku_counts.get(key, 0) + 1

    top20 = sorted(sku_counts.items(), key=lambda x: -x[1])[:20]

    print(f"\n{'sku':<25} {'occurrences':>12}  {'title'}")
    print("-" * 90)
    for (sku, title), cnt in top20:
        print(f"  {str(sku):<25} {cnt:>10}   {str(title)[:50]}")
    print(f"\n→ {len(sku_counts)} distinct unmatched SKUs")

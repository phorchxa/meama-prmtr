"""
SKU format mapping audit — read-only.
"""
import io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
import httpx

SUPABASE_URL = "https://oquuapdsleffspiwmlzs.supabase.co"
SERVICE_KEY = (
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"
    ".eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9xdXVhcGRzbGVmZnNwaXdtbHpzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjY1NTAwNSwiZXhwIjoyMDg4MjMxMDA1fQ"
    ".lWIYwKPtTJtNrvXpRYMdfPen_yaTjpzo9QfpC_y6u8I"
)
BASE = f"{SUPABASE_URL}/rest/v1"
H = {"apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}"}

def get(table, params, timeout=60):
    return httpx.get(f"{BASE}/{table}", headers=H, params=params, timeout=timeout)

def paginate(table, params, page_size=10000):
    rows, offset = [], 0
    while True:
        r = get(table, {**params, "limit": page_size, "offset": offset}, timeout=120)
        if r.status_code >= 400:
            print(f"  HTTP {r.status_code}: {r.text[:200]}")
            break
        batch = r.json()
        rows.extend(batch)
        if len(batch) < page_size:
            break
        offset += page_size
        print(f"  fetched {len(rows):,}…", end="\r", flush=True)
    print(f"  total: {len(rows):,}        ")
    return rows

# ── 1. All cap51-* Fina Codes in Bible ───────────────────────────────────────
print("=" * 80)
print("1. cap51-* ENTRIES IN BIBLE")
print("=" * 80)
r1 = get("Meama Products Bible", {
    "select": "Fina Code,Naming GEO,Intensity level",
    "Fina Code": "like.cap51-*",
    "order": "Fina Code",
    "limit": 100,
})
print(f"HTTP {r1.status_code}")
if r1.status_code < 400:
    rows1 = r1.json()
    print(f"\n{'Fina Code':<25} {'Naming GEO':<40} {'Intensity'}")
    print("-" * 70)
    for r in rows1:
        print(f"  {str(r.get('Fina Code','')):<25} {str(r.get('Naming GEO','')):<40} {r.get('Intensity level','')}")
    print(f"\n→ {len(rows1)} rows")
else:
    print(f"Error: {r1.text[:300]}")

# ── 2. cap37 long-format fallback check ──────────────────────────────────────
print("\n" + "=" * 80)
print("2. cap37 LONG-FORMAT IN BIBLE: cap37-1009, cap37-1013, cap37-1007, cap37-1008, cap37-1012, cap37-1015")
print("=" * 80)
targets = "cap37-1009,cap37-1013,cap37-1007,cap37-1008,cap37-1012,cap37-1015"
r2 = get("Meama Products Bible", {
    "select": "Fina Code,Naming GEO,Intensity level",
    "Fina Code": f"in.({targets})",
    "limit": 20,
})
print(f"HTTP {r2.status_code}")
if r2.status_code < 400:
    rows2 = r2.json()
    if rows2:
        print(f"\n{'Fina Code':<20} {'Naming GEO':<40} {'Intensity'}")
        print("-" * 65)
        for r in rows2:
            print(f"  {str(r.get('Fina Code','')):<20} {str(r.get('Naming GEO','')):<40} {r.get('Intensity level','')}")
    else:
        print("  → 0 rows (none of those codes are in the Bible)")
    print(f"\n→ {len(rows2)} of 6 target codes found")
else:
    print(f"Error: {r2.text[:300]}")

# ── 3. Unmatched short cap51-* SKUs from retail orders ───────────────────────
print("\n" + "=" * 80)
print("3. UNMATCHED SHORT cap51-* SKUs FROM RETAIL ORDERS (len<=8)")
print("=" * 80)

# Get Bible codes for matching
bible_codes = {r["Fina Code"] for r in get("Meama Products Bible", {"select": "Fina Code", "limit": 200}).json() if r.get("Fina Code")}

# Get retail order IDs
print("Fetching retail order IDs…")
retail_orders = paginate("meama_georgia_orders", {
    "select": "shopify_order_id",
    "source": "in.(web,pos)",
    "financial_status": "neq.voided",
    "cancelled_at": "is.null",
})
retail_ids = {r["shopify_order_id"] for r in retail_orders}
print(f"  Retail orders: {len(retail_ids):,}")

# Get cap51-* items from order_items (short SKUs only — len<=8 means cap51-XX)
print("Fetching cap51-* order_items…")
cap51_items = paginate("meama_georgia_order_items", {
    "select": "shopify_order_id,sku,title",
    "sku": "like.cap51-*",
})

# Filter to retail + not in bible + len<=8
results: dict[tuple, int] = {}
for row in cap51_items:
    sku = row.get("sku", "") or ""
    if (row["shopify_order_id"] in retail_ids
            and len(sku) <= 8
            and sku not in bible_codes):
        key = (sku, (row.get("title") or "").strip())
        results[key] = results.get(key, 0) + 1

top = sorted(results.items(), key=lambda x: -x[1])[:20]
print(f"\n{'sku':<15} {'cnt':>8}  {'title'}")
print("-" * 70)
for (sku, title), cnt in top:
    print(f"  {sku:<15} {cnt:>8}   {title[:50]}")
print(f"\n→ {len(results)} distinct short cap51-* SKUs unmatched in retail orders")

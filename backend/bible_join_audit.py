"""
Bible join quality check for retail orders — read-only.
"""
import io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

import httpx
from collections import defaultdict

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
    print(f"  total fetched: {len(rows):,}        ")
    return rows

# ── 1. Retail match rate (web + pos only) ───────────────────────────────────
print("=" * 80)
print("1. RETAIL MATCH RATE (web+pos, not voided, not cancelled)")
print("=" * 80)

# Step A: get all retail order IDs
print("Fetching retail order IDs (source=web or pos, active)…")
retail_orders = paginate("meama_georgia_orders", {
    "select": "shopify_order_id",
    "source": "in.(web,pos)",
    "financial_status": "neq.voided",
    "cancelled_at": "is.null",
})
retail_ids = {r["shopify_order_id"] for r in retail_orders}
print(f"  Retail orders: {len(retail_ids):,}")

# Step B: Bible Fina Codes
print("Fetching Bible Fina Codes…")
bible_rows = get("Meama Products Bible", {"select": "Fina Code", "limit": 1000}).json()
bible_codes = {r["Fina Code"] for r in bible_rows if r.get("Fina Code")}
print(f"  Bible codes: {len(bible_codes)}")

# Step C: order items — need sku + order_id
# Paginate in chunks and filter to retail orders
print("Fetching order_items (sku + shopify_order_id)…")
all_items = paginate("meama_georgia_order_items", {
    "select": "shopify_order_id,sku",
    "sku": "not.is.null",
})

retail_items = [r for r in all_items if r["shopify_order_id"] in retail_ids and r["sku"]]
matched      = sum(1 for r in retail_items if r["sku"] in bible_codes)
total_retail = len(retail_items)
match_pct    = round(matched / total_retail * 100, 1) if total_retail else 0
unmatched    = total_retail - matched

print(f"\n{'retail_items':<30} {total_retail:>10,}")
print(f"{'matched':<30} {matched:>10,}")
print(f"{'unmatched':<30} {unmatched:>10,}")
print(f"{'match_pct':<30} {match_pct:>9}%")

# ── 2. cap51-11, cap37-09, cap37-13 LIKE matches ────────────────────────────
print("\n" + "=" * 80)
print("2. LIKE MATCHES: cap51-11%, cap37-09%, cap37-13%")
print("=" * 80)

r2 = get("Meama Products Bible", {
    "select": "Fina Code,Naming GEO,Intensity level",
    "or": '("Fina Code".like.cap51-11*,"Fina Code".like.cap37-09*,"Fina Code".like.cap37-13*)',
    "limit": 20,
})
print(f"HTTP {r2.status_code}")
if r2.status_code < 400:
    rows2 = r2.json()
    if rows2:
        print(f"\n{'Fina Code':<25} {'Naming GEO':<35} {'Intensity'}")
        print("-" * 65)
        for r in rows2:
            print(f"  {str(r.get('Fina Code','')):<25} {str(r.get('Naming GEO','')):<35} {r.get('Intensity level','')}")
    else:
        print("  → 0 rows returned (no LIKE matches in Bible)")
else:
    print(f"Error: {r2.text[:300]}")
    # Fallback: check manually from bible_codes
    print("\nFallback — manual prefix scan of all Fina Codes:")
    prefixes = ["cap51-11", "cap37-09", "cap37-13"]
    for p in prefixes:
        hits = [c for c in bible_codes if c and c.startswith(p)]
        print(f"  {p}*  →  {hits if hits else 'NO MATCH'}")

# ── 3. Flavor Profile sample ─────────────────────────────────────────────────
print("\n" + "=" * 80)
print("3. FLAVOR PROFILE SAMPLE")
print("=" * 80)
r3 = get("Meama Products Bible", {
    "select": "Fina Code,Naming ENG,Flavor Profile,Beverage Type,Collection,Intensity level",
    "Flavor Profile": "not.is.null",
    "limit": 10,
})
print(f"HTTP {r3.status_code}")
if r3.status_code < 400:
    rows3 = r3.json()
    print(f"\n{len(rows3)} rows")
    for row in rows3:
        print(f"\n  Fina Code : {row.get('Fina Code')}")
        print(f"  Naming ENG: {row.get('Naming ENG')}")
        print(f"  Flavor    : {row.get('Flavor Profile')}")
        print(f"  Bev Type  : {row.get('Beverage Type')}")
        print(f"  Collection: {row.get('Collection')}")
        print(f"  Intensity : {row.get('Intensity level')}")
else:
    print(f"Error: {r3.text[:300]}")

# ── 4. Intensity by Beverage Type ────────────────────────────────────────────
print("\n" + "=" * 80)
print("4. INTENSITY BY BEVERAGE TYPE")
print("=" * 80)
r4 = get("Meama Products Bible", {
    "select": "Beverage Type,Intensity level",
    "limit": 2000,
})
print(f"HTTP {r4.status_code}")
if r4.status_code < 400:
    rows4 = r4.json()
    groups = defaultdict(list)
    for row in rows4:
        btype = row.get("Beverage Type") or "(null)"
        intens = row.get("Intensity level")
        if intens is not None:
            groups[btype].append(float(intens))

    results = []
    for btype, vals in groups.items():
        results.append((
            btype,
            round(sum(vals) / len(vals), 1),
            min(vals),
            max(vals),
            len(vals),
        ))
    results.sort(key=lambda x: -x[1])

    print(f"\n{'Beverage Type':<30} {'avg_intensity':>13} {'min_i':>6} {'max_i':>6} {'products':>9}")
    print("-" * 70)
    for btype, avg, mn, mx, cnt in results:
        print(f"  {btype:<30} {avg:>13} {mn:>6} {mx:>6} {cnt:>9}")
else:
    print(f"Error: {r4.text[:300]}")

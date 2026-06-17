"""
Step A verification: identify system/test accounts before writing the exclusion predicate.
No changes made — read-only PostgREST queries.
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

def get(path, params):
    return httpx.get(f"{BASE}/{path}", headers=H, params=params, timeout=30)

print("=" * 80)
print("EXCLUSION CANDIDATES — system/test/guest accounts")
print("=" * 80)

# PostgREST OR filter with grouped AND conditions
r = get("portfolio_customers", {
    "select": "shopify_customer_id,full_name,email,order_count,total_spend,aov,channel",
    "or": "(email.in.(meamaguest@gmail.com,ds@meama.ge),full_name.ilike.*dropper*,and(order_count.gt.200,aov.lt.5),and(total_spend.eq.0,order_count.gt.20))",
    "order": "order_count.desc",
    "limit": 50,
})
print(f"\nHTTP {r.status_code}")
if r.status_code >= 400:
    print(f"Error: {r.text[:500]}")
    # Fallback: try without AND grouping
    print("\nFallback — email filter only:")
    r2 = get("portfolio_customers", {
        "select": "shopify_customer_id,full_name,email,order_count,total_spend,aov,channel",
        "email": "in.(meamaguest@gmail.com,ds@meama.ge)",
        "order": "order_count.desc",
        "limit": 20,
    })
    print(f"HTTP {r2.status_code}")
    rows = r2.json() if r2.status_code < 400 else []
else:
    rows = r.json()

print(f"\nFound {len(rows)} candidates:")
print(f"\n{'ID':<15} {'Name':<28} {'Email':<36} {'Orders':>8} {'Spend':>8} {'AOV':>7} {'Channel'}")
print("-" * 110)
for row in rows:
    nm = str(row.get("full_name") or "")[:27]
    em = str(row.get("email") or "[null]")[:35]
    print(
        f"{row['shopify_customer_id']:<15} {nm:<28} {em:<36} "
        f"{row.get('order_count', 0):>8} {row.get('total_spend', 0):>8.0f} "
        f"{row.get('aov', 0):>7.1f} {row.get('channel', '')}"
    )

# Also verify: order_count > 200 AND aov < 5 — second filter
print("\n--- High-order / low-AOV accounts (order_count>200, aov<5) ---")
r3 = get("portfolio_customers", {
    "select": "shopify_customer_id,full_name,email,order_count,total_spend,aov,channel",
    "order_count": "gt.200",
    "aov": "lt.5",
    "order": "order_count.desc",
    "limit": 20,
})
rows3 = r3.json() if r3.status_code < 400 else []
print(f"Found {len(rows3)}:")
for row in rows3:
    nm = str(row.get("full_name") or "")[:27]
    em = str(row.get("email") or "[null]")[:35]
    print(f"  {row['shopify_customer_id']:<15} {nm:<28} {em:<36} orders={row.get('order_count',0)} aov={row.get('aov',0):.1f}")

# zero-spend / high-order
print("\n--- Zero-spend / high-order accounts (spend=0, orders>20) ---")
r4 = get("portfolio_customers", {
    "select": "shopify_customer_id,full_name,email,order_count,total_spend,aov,channel",
    "total_spend": "eq.0",
    "order_count": "gt.20",
    "order": "order_count.desc",
    "limit": 20,
})
rows4 = r4.json() if r4.status_code < 400 else []
print(f"Found {len(rows4)}:")
for row in rows4:
    nm = str(row.get("full_name") or "")[:27]
    em = str(row.get("email") or "[null]")[:35]
    print(f"  {row['shopify_customer_id']:<15} {nm:<28} {em:<36} orders={row.get('order_count',0)} spend={row.get('total_spend',0)}")

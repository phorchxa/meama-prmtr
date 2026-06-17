"""
Step 1: Apply updated 0004_portfolio_view.sql + verify new columns.

IMPORTANT — DDL cannot run via PostgREST (no raw SQL endpoint).
DO THIS FIRST in Supabase SQL Editor:
  1. Open https://supabase.com/dashboard/project/oquuapdsleffspiwmlzs/sql/new
  2. Copy the full content of supabase/migrations/0004_portfolio_view.sql
  3. Paste and run (takes ~30-90s)
  4. Run: SELECT refresh_portfolio_customers();

Then run this script to verify the columns exist and paste the output.
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

def get(table, params, timeout=30):
    return httpx.get(f"{BASE}/{table}", headers=H, params=params, timeout=timeout)

print("=" * 70)
print("VERIFICATION — portfolio_customers new columns")
print("=" * 70)

# 1. Try to call refresh via RPC
print("\nCalling refresh_portfolio_customers() via RPC...")
r_refresh = httpx.post(
    f"{BASE}/rpc/refresh_portfolio_customers",
    headers={**H, "Content-Type": "application/json"},
    json={},
    timeout=300,
)
print(f"  HTTP {r_refresh.status_code}: {r_refresh.text[:100]}")

# 2. Verify new columns exist (query one row, check fields)
print("\nChecking new columns exist in matview...")
r_check = get("portfolio_customers", {
    "select": "shopify_customer_id,favorite_intensity,intensity_bucket,top_flavors,beverage_type_preference,bible_match_rate",
    "limit": 1,
})
print(f"  HTTP {r_check.status_code}")
if r_check.status_code < 400:
    rows = r_check.json()
    if rows:
        row = rows[0]
        print(f"\n  Columns present: {list(row.keys())}")
        for col in ["favorite_intensity", "intensity_bucket", "top_flavors", "beverage_type_preference", "bible_match_rate"]:
            val = row.get(col, "MISSING")
            print(f"    {col:<30} = {repr(val)}")
    else:
        print("  No rows returned")
else:
    print(f"  Error — columns may not exist yet: {r_check.text[:300]}")

# 3. Run verification count query
print("\nAggregation check (sample 5000 rows via pagination)...")
r_agg = get("portfolio_customers", {
    "select": "favorite_intensity,intensity_bucket,top_flavors,beverage_type_preference",
    "limit": 5000,
})
if r_agg.status_code < 400:
    rows = r_agg.json()
    total = len(rows)
    has_intensity = sum(1 for r in rows if r.get("favorite_intensity") is not None)
    has_bucket    = sum(1 for r in rows if r.get("intensity_bucket") is not None)
    has_flavors   = sum(1 for r in rows if r.get("top_flavors") is not None)
    has_bev_type  = sum(1 for r in rows if r.get("beverage_type_preference") is not None)

    from collections import Counter
    bucket_counts = Counter(r.get("intensity_bucket") for r in rows if r.get("intensity_bucket"))
    bev_counts    = Counter(r.get("beverage_type_preference") for r in rows if r.get("beverage_type_preference"))
    intensities   = [r["favorite_intensity"] for r in rows if r.get("favorite_intensity") is not None]
    avg_i = round(sum(intensities) / len(intensities), 2) if intensities else None

    print(f"\n  sample_rows        {total:>8}")
    print(f"  has_intensity      {has_intensity:>8}  ({round(has_intensity/total*100,1) if total else 0}%)")
    print(f"  has_bucket         {has_bucket:>8}")
    print(f"  has_flavors        {has_flavors:>8}")
    print(f"  has_bev_type       {has_bev_type:>8}")
    print(f"  avg_intensity      {str(avg_i):>8}")
    print(f"\n  intensity_bucket distribution:")
    for k, v in sorted(bucket_counts.items()):
        print(f"    {k:<12} {v:>6}")
    print(f"\n  beverage_type_preference distribution:")
    for k, v in sorted(bev_counts.items(), key=lambda x: -x[1]):
        print(f"    {k:<20} {v:>6}")
else:
    print(f"  Error: {r_agg.status_code} — {r_agg.text[:200]}")

print("\n" + "=" * 70)
print("DONE. Paste the above output back.")
print("=" * 70)

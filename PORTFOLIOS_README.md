# Portfolios page — implementation notes

## What was built

| File | Purpose |
|------|---------|
| `supabase/migrations/0004_portfolio_view.sql` | Materialized view `portfolio_customers` + 7 indexes + `refresh_portfolio_customers()` |
| `backend/app/schemas/portfolios.py` | Pydantic v2 schemas: `PortfolioSummary`, `PortfolioDetail`, `OrderRow` |
| `backend/app/routers/portfolios.py` | FastAPI router — `GET /api/v1/portfolios`, `GET /api/v1/portfolios/{id}` |
| `frontend/src/lib/portfoliosApi.ts` | Typed fetch client calling the FastAPI backend |
| `frontend/src/pages/Portfolios.tsx` | Server-driven grid with search, 4 filters, sort, pagination |
| `frontend/src/pages/PortfolioDetail.tsx` | 360 detail — KPIs, categories, 20-order timeline |

## One-time: create the view in Supabase

Run the migration SQL in the Supabase SQL editor (dashboard → SQL Editor → New query → paste → Run):

```
supabase/migrations/0004_portfolio_view.sql
```

The view uses `INNER JOIN cust_agg` so only customers with ≥1 valid retail order appear.

## Refreshing the view

The view is a snapshot — it does **not** update automatically. Refresh options:

```sql
-- manual (locks briefly)
REFRESH MATERIALIZED VIEW portfolio_customers;

-- from backend job (non-blocking, requires the UNIQUE INDEX to exist)
SELECT refresh_portfolio_customers();
```

The nightly GitHub Actions job (`0 22 * * *` UTC = 02:00 Tbilisi) should call
`refresh_portfolio_customers()` after the ETL completes. Wire it in
`backend/app/jobs/nightly_metrics.py`.

## Running locally

```bash
make dev-backend    # FastAPI :8000
make dev-frontend   # Vite :5173
```

The frontend reads `VITE_API_BASE_URL` (default `http://localhost:8000`). No
Supabase credentials needed in the browser — the backend uses the service-role
key from `.env`.

## What is stubbed / deferred

- **churn_score / rfm_segment** — not in the view; the Claude batch job writes
  these to `customer_metrics` which doesn't exist yet in the live DB.
  The activity bar uses `days_since_last_order` as a proxy.
- **Spend sparkline** — requires month-by-month aggregation; not included in
  the materialized view to keep refresh time acceptable at 96 k customers.
  Add a separate `portfolio_monthly_spend` view if needed.
- **co-purchase pairs** — deferred; implement as a separate
  `GET /api/v1/portfolios/{id}/affinity` endpoint backed by a DuckDB query.
- **Auth enforcement** — the router uses `get_supabase()` but does not yet
  call `require_capability("read_all")`. Add this in Phase 1.

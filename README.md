# MEAMA PRMTR

Commercial CRM platform for **Meama Georgia** (premium coffee brand). Scope is **E-Commerce + Brand Stores** retail only — Vending, B2B, and Collect orders are ingested and tagged but excluded from all retail metrics.

Intelligence is produced by **rule-based SQL/pandas** + **Claude API batch jobs** (`claude-sonnet-4-6`). There are **no ML training libraries** in this project — see [`CLAUDE.md`](./CLAUDE.md) §NO-ML RULE.

---

## Architecture

```
frontend/  React + TypeScript (Vite) · Tailwind · react-router · react-i18next (ka/en)
backend/   FastAPI (Python 3.11+) · Pydantic v2 · uvicorn
pipeline/  pandas + DuckDB ETL (14 CSV sources -> Supabase)
supabase/  PostgreSQL migrations (schema, auth + RLS, dev seed)
.github/   CI + nightly cron (ETL -> metrics -> Claude scoring -> alerts)
```

Deploy target: **Railway** (auto-deploy from `main`). Scheduled jobs: **GitHub Actions** cron `0 22 * * *` UTC = 02:00 Asia/Tbilisi.

---

## Prerequisites

- Python **3.11+** (repo developed on 3.12)
- Node **20+** and npm
- A Supabase project (URL + anon key + service-role key)
- API credentials for Anthropic, Telegram, Meta Marketing, Shopify (see `.env.example`)

---

## 1. Environment setup

```bash
cp .env.example .env
# fill in Supabase / Anthropic / Telegram / Meta / Shopify values
```

`VITE_*` vars are exposed to the browser — only put the **anon** key there. The **service-role** key stays backend-only.

## 2. Install

```bash
make install      # backend (editable, with dev extras) + frontend npm install
```

## 3. Apply database migrations

Run in order against your Supabase project (SQL editor or `supabase` CLI):

```
supabase/migrations/0001_core.sql        # tables, enums, indexes
supabase/migrations/0002_auth_rls.sql    # user_roles, get_user_role(), RLS policies
supabase/migrations/0003_seed_dev.sql    # tiny synthetic dev seed
```

With the Supabase CLI:

```bash
supabase db push    # or: psql "$SUPABASE_DB_URL" -f supabase/migrations/0001_core.sql ...
```

## 4. Run locally

```bash
make dev-backend    # FastAPI on http://localhost:8000  (docs at /docs, health at /health)
make dev-frontend   # Vite on http://localhost:5173
```

## 5. Test

```bash
make test           # pytest — includes promo-calculator math coverage
make lint           # ruff
```

## 6. ETL

Drop the 14 source CSVs into `pipeline/data/raw/` (gitignored), then:

```bash
python pipeline/run_etl.py --help     # list registered loaders / sources
make etl                              # CSV -> DuckDB staging -> Supabase upsert (+ sync_log)
```

> The loader registry currently has **TODO stubs** for all 14 sources. Real column schemas are filled in during Phase 1 against the actual CSVs — do not invent column names.

---

## Deploy (Railway)

1. Create a Railway project, connect this repo, set **auto-deploy from `main`**.
2. Add a service for `backend/` — start command comes from `backend/railway.json` (`uvicorn app.main:app --host 0.0.0.0 --port $PORT`).
3. Add all backend env vars from `.env.example` to the Railway service.
4. The frontend (`frontend/`) builds with `npm run build` and serves `dist/` (Railway static or a separate service).

## Nightly job

`.github/workflows/nightly.yml` runs at `0 22 * * *` UTC (02:00 Tbilisi):
ETL → recompute `customer_metrics` → Claude batch scoring (`churn_score` / `cluster_tag` / `upsell_tag`) → evaluate alert rules → Telegram. Steps are stubbed in this scaffold and wired in Phase 1+.

---

## Conventions

See [`CLAUDE.md`](./CLAUDE.md) for the full set: currency (GEL vs USD), Asia/Tbilisi time, Meama design tokens, inline-SVG charts only, no `localStorage`, PII-safe Claude calls, and alert/sync-log discipline.

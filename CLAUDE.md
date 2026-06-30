# CLAUDE.md — MEAMA PRMTR

Commercial CRM for **Meama Georgia** (premium coffee). Scope: **E-Commerce + Brand Stores only**. Vending / B2B / Collect orders are stored but tagged and excluded from every retail metric.

## The 10 modules
1. Command Overview (KPIs) — `/`
2. Customer 360 — `/customers`, `/customers/:id`
3. Product Intelligence — `/products`
4. Stock — `/stock`
5. Campaign Intelligence (+ promo calculator) — `/campaigns`
6. Ads (Meta) — `/ads`
7. Reports — `/reports`
8. Alerts — `/alerts`
9. Action Queue — `/actions`
10. Login (Supabase Auth) — `/login`

## Tech stack (LOCKED — do not substitute)
- Frontend: React + TS (Vite), Tailwind, react-router, react-i18next (ka + en)
- Backend: FastAPI (Python 3.11+), Pydantic v2, uvicorn
- DB: Supabase (Postgres), RLS on every table, Supabase Auth (invite-only, role-based)
- AI: Anthropic Python SDK, model `claude-sonnet-4-6`, LangGraph for multi-step campaign workflows
- ETL: Python + pandas + DuckDB (14 CSV sources, ~121K orders history)
- Notifications: Telegram Bot API. Ads: Meta Marketing API (System User token)
- Deploy: Railway (auto-deploy from main). Schedule: GitHub Actions cron `0 22 * * *` UTC = 02:00 Asia/Tbilisi

## ⛔ NO-ML RULE (critical)
Do **NOT** install scikit-learn, xgboost, HDBSCAN, or any ML training library. All "intelligence" is either:
1. **Rule-based SQL/pandas** — RFM quintiles, status flags, reorder prediction, affinity counts.
2. **Claude API batch jobs** — `cluster_tag`, `churn_score` (0.0–1.0), `upsell_tag` (bool), campaign suggestions, draft copy. These read anonymized/aggregated features, call `claude-sonnet-4-6` with strict-JSON prompts, and write back to `customer_metrics` / `ai_insights`.
`churn_score`, `cluster_tag`, `upsell_tag` are **Claude output, never a trained model**.

## Business rules (single source of truth: `backend/app/business_rules.py`)
- MARGIN_FLOOR = 0.40 (NET of VAT) ; MIN_PRICE_MULTIPLIER = 1.6667 ; MAX_DISCOUNT = 0.25 (advisory guideline, NOT a hard block)
- B2B_CAP_DISCOUNT_UNDER/OVER = 0.25/0.30 @ 500-cap threshold ; B2B_ACCESSORY_DISCOUNT = 0.15 (machines = ecom)
- CHURN_DAYS = 90 (lost) ; AT_RISK = 45–89 days
- LOW_STOCK_WEEKS = 2 ; REORDER_POINT_DAYS = 14
- ROAS_ALERT_THRESHOLD = 2.0 ; CANCEL_SPIKE = 15% / 24h ; REFUND_SHARE_ALERT = 5% ; CHURN_SCORE_ALERT = 0.7
- RETAIL_CHANNELS = ("ecom", "brand_store") — every metric filters to these
- NO_DISCOUNT_SEGMENTS = ("champion","capsule_loyalist","flavour_explorer") — early access only, never discounts
- AOV_EXCLUDES_ZERO_SPEND = True ; LTV_REGISTERED_ONLY = True
- Promo calc (net of VAT): `net_margin = (P/1.18 − COGS)/(P/1.18)`; `min_safe_price = COGS × 1.6667 × 1.18`; `max_safe_discount = 1 − (min_safe_price / full_price)` (uncapped — can exceed 25%); the binding block is `net_margin < 40%`, not the discount %.

## Conventions (enforce everywhere)
- **Currency:** order data is GEL (₾); Meta Ads data is USD ($). Never mix.
- **Time:** display in Asia/Tbilisi (GMT+4); locale `ka-GE`; numeric UI uses `tabular-nums`.
- **Design tokens:** brown `#3E1F00`, gold `#C8963E`, cream `#FAF3E0`, charcoal `#1C1C1E`, green `#2D6A4F` (positive), red `#C0392B` (negative/critical), blue `#2C3E7A` (info/Meta), muted `#6B6B6B`. Font Inter, DejaVu Sans fallback for Georgian.
- **Charts:** inline SVG only — NO Chart.js / Recharts / D3.
- **No `localStorage`/`sessionStorage`** — session via Supabase, UI state in React.
- **Claude calls:** never send raw PII (email/phone/name) — use customer IDs + anonymized features; always strict JSON, strip markdown fences before parse, handle parse failure; persist every insight to `ai_insights`.
- **Alerts:** write to `alerts` before sending; respect per-type cooldown; Telegram uses severity emoji (🚨/⚠️/ℹ️) + ka-GE GMT+4 timestamps.
- **Integrations:** every sync writes a `sync_log` row — silent failures forbidden.
- **Security:** never expose the service-role key to the frontend; financial tables (orders, margins) are admin+analyst only.

## Roles
`admin` (all) · `analyst` (read all, reports/insights) · `marketing` (customers/campaigns/ads, no financials) · `viewer` (dashboards only).

## Repo map
```
backend/   FastAPI app (routers, schemas, services, jobs, business_rules.py)
frontend/  Vite React app (pages, components, i18n, theme)
pipeline/  ETL (etl/load|transform|push, run_etl.py) — 14 CSV sources
supabase/  migrations 0001_core / 0002_auth_rls / 0003_seed_dev
.github/   ci.yml + nightly.yml (cron 0 22 * * *)
```

## Run
```
make install        # backend + frontend deps
make dev-backend    # uvicorn :8000  (/health, /docs)
make dev-frontend   # vite :5173
make test           # pytest (promo calculator covered)
make etl            # CSV -> DuckDB -> Supabase
```

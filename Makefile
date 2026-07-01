# ============================================================
# MEAMA PRMTR — developer shortcuts
# ============================================================
.PHONY: help install dev-backend dev-frontend lint test etl seed fmt

help:
	@echo "MEAMA PRMTR — make targets:"
	@echo "  install       install backend + frontend deps"
	@echo "  dev-backend   run FastAPI (uvicorn, no-reload) on :8002"
	@echo "  dev-frontend  run Vite dev server on :5173"
	@echo "  lint          ruff check backend"
	@echo "  fmt           ruff format backend"
	@echo "  test          pytest backend"
	@echo "  etl           run the ETL pipeline (CSV -> DuckDB -> Supabase)"
	@echo "  seed          print instructions to apply dev seed migration"

install:
	cd backend && python3 -m pip install -e ".[dev]"
	cd frontend && npm install

dev-backend:
	cd backend && python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8002

dev-frontend:
	cd frontend && npm run dev

lint:
	cd backend && ruff check app pipeline 2>/dev/null || ruff check app

fmt:
	cd backend && ruff format app

test:
	cd backend && pytest -q

etl:
	python3 pipeline/run_etl.py

seed:
	@echo "Apply migrations in order via Supabase SQL editor or supabase CLI:"
	@echo "  supabase/migrations/0001_core.sql"
	@echo "  supabase/migrations/0002_auth_rls.sql"
	@echo "  supabase/migrations/0003_seed_dev.sql"

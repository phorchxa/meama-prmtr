"""MEAMA PRMTR — FastAPI application factory."""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from typing import TYPE_CHECKING

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .routers import (
    actions,
    ads,
    alerts,
    campaigns,
    customers,
    kpi,
    overview,
    portfolios,
    products,
    reports,
    sessions,
    stock,
)
from .schemas.common import Health

if TYPE_CHECKING:
    from apscheduler.schedulers.asyncio import AsyncIOScheduler

logger = logging.getLogger(__name__)

API_PREFIX = "/api/v1"


def _build_scheduler() -> AsyncIOScheduler | None:
    """Create and configure the APScheduler instance. Returns None if not installed."""
    try:
        from apscheduler.schedulers.asyncio import AsyncIOScheduler
    except ImportError:
        logger.warning("apscheduler not installed — background jobs disabled")
        return None

    from .jobs.geoip_resolver import run_geo_resolver
    from .jobs.winback_trigger import run_winback_trigger

    settings = get_settings()
    scheduler = AsyncIOScheduler(timezone="Asia/Tbilisi")

    scheduler.add_job(
        run_winback_trigger,
        trigger="interval",
        minutes=5,
        id="winback_trigger",
        replace_existing=True,
        misfire_grace_time=60,
        coalesce=True,
    )
    scheduler.add_job(
        run_geo_resolver,
        trigger="interval",
        minutes=10,
        id="geo_resolver",
        replace_existing=True,
        misfire_grace_time=120,
        coalesce=True,
    )

    logger.info(
        "scheduler configured: winback every 5min, geo_resolver every 10min "
        "(winback_funnel_stage>=%d quiet=%dmin cooldown=%dh target=%s)",
        settings.winback_funnel_stage_min,
        settings.winback_quiet_minutes,
        settings.winback_cooldown_hours,
        settings.winback_target_statuses,
    )
    return scheduler


@asynccontextmanager
async def _lifespan(app: FastAPI):
    scheduler = _build_scheduler()
    if scheduler:
        scheduler.start()
    try:
        yield
    finally:
        if scheduler and scheduler.running:
            scheduler.shutdown(wait=False)


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="MEAMA PRMTR API",
        version="0.1.0",
        description="CRM for Meama Georgia — e-commerce + brand stores retail.",
        lifespan=_lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/health", response_model=Health, tags=["meta"])
    async def health() -> Health:
        return Health(
            environment=settings.environment,
            time=datetime.now(UTC),
        )

    for module in (
        overview,
        customers,
        portfolios,
        products,
        stock,
        campaigns,
        ads,
        reports,
        alerts,
        actions,
        sessions,
        kpi,
    ):
        app.include_router(module.router, prefix=API_PREFIX)

    return app


app = create_app()

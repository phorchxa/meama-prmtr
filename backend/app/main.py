"""MEAMA PRMTR — FastAPI application factory."""
from __future__ import annotations

from datetime import UTC, datetime

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .routers import (
    actions,
    ads,
    alerts,
    campaigns,
    customers,
    overview,
    portfolios,
    products,
    reports,
    stock,
)
from .schemas.common import Health

API_PREFIX = "/api/v1"


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="MEAMA PRMTR API",
        version="0.1.0",
        description="CRM for Meama Georgia — e-commerce + brand stores retail.",
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
    ):
        app.include_router(module.router, prefix=API_PREFIX)

    return app


app = create_app()

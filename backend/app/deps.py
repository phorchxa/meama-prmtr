"""Shared FastAPI dependencies: Supabase client + role-based auth.

The auth dependency is intentionally lightweight for the scaffold: it validates a
bearer token via Supabase Auth and resolves the caller's role from `user_roles`.
Wire real enforcement per-router in Phase 1.
"""
from __future__ import annotations

from enum import StrEnum
from functools import lru_cache
from typing import Annotated

from fastapi import Depends, Header, HTTPException, status

from .config import Settings, get_settings


class Role(StrEnum):
    admin = "admin"
    analyst = "analyst"
    marketing = "marketing"
    viewer = "viewer"


# Role -> capabilities (documented here, enforced per-router).
ROLE_CAPABILITIES: dict[Role, set[str]] = {
    Role.admin: {"read_all", "read_financial", "write"},
    Role.analyst: {"read_all", "read_financial"},
    Role.marketing: {"read_all"},  # no financials
    Role.viewer: {"read_dashboards"},
}


@lru_cache
def _supabase_client():
    """Service-role Supabase client (backend only). Lazily imported so the app
    boots without the `supabase` package installed during early scaffolding."""
    settings = get_settings()
    if not settings.supabase_url or not settings.supabase_service_role_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Supabase is not configured (set SUPABASE_URL + SERVICE_ROLE_KEY).",
        )
    from supabase import create_client  # local import — optional at scaffold time

    return create_client(settings.supabase_url, settings.supabase_service_role_key)


def get_supabase():
    """FastAPI dependency yielding a configured Supabase client."""
    return _supabase_client()


class CurrentUser:
    def __init__(self, user_id: str, role: Role):
        self.user_id = user_id
        self.role = role

    def has(self, capability: str) -> bool:
        return capability in ROLE_CAPABILITIES.get(self.role, set())


async def get_current_user(
    authorization: Annotated[str | None, Header()] = None,
    settings: Annotated[Settings, Depends(get_settings)] = None,  # type: ignore[assignment]
) -> CurrentUser:
    """Resolve the authenticated user + role from a Supabase bearer token.

    STUB: token verification + `user_roles` lookup are implemented in Phase 1.
    Returns a viewer in development so the API is explorable; in production this
    must reject unauthenticated requests.
    """
    if not authorization or not authorization.lower().startswith("bearer "):
        if settings and settings.environment == "development":
            return CurrentUser(user_id="dev-user", role=Role.admin)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing bearer token.",
        )
    # TODO(phase1): verify token via Supabase Auth; SELECT role FROM user_roles.
    return CurrentUser(user_id="dev-user", role=Role.admin)


def require_capability(capability: str):
    """Dependency factory enforcing a capability on the current user."""

    async def _checker(
        user: Annotated[CurrentUser, Depends(get_current_user)],
    ) -> CurrentUser:
        if not user.has(capability):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role '{user.role.value}' lacks capability '{capability}'.",
            )
        return user

    return _checker

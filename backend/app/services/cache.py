"""Shared stale-while-revalidate cache for expensive read endpoints.

A serverless instance stays warm across many requests, so recomputing an
expensive Supabase/RPC aggregation on every call wastes the instance's own
warm lifetime — and blocks the caller for however long that computation
takes. SWRCache fixes that: once any request has populated an entry, every
later request gets it back immediately, even if it's stale, while a fresh
copy is computed in the background. Only the very first call for a given
key (nothing cached yet — e.g. right after a cold start) blocks.
"""
from __future__ import annotations

import asyncio
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Generic, TypeVar

T = TypeVar("T")


@dataclass
class _Entry(Generic[T]):
    data: T | None = None
    ts: float = 0.0
    refreshing: bool = False


class SWRCache(Generic[T]):
    def __init__(self, ttl: float):
        self.ttl = ttl
        self._entries: dict[str, _Entry[T]] = {}

    async def get(self, key: str, compute: Callable[[], Awaitable[T]]) -> T:
        entry = self._entries.setdefault(key, _Entry())

        if entry.data is None:
            entry.data = await compute()
            entry.ts = time.time()
            return entry.data

        if (time.time() - entry.ts) >= self.ttl and not entry.refreshing:
            entry.refreshing = True

            async def _refresh() -> None:
                try:
                    entry.data = await compute()
                    entry.ts = time.time()
                finally:
                    entry.refreshing = False

            asyncio.create_task(_refresh())

        return entry.data

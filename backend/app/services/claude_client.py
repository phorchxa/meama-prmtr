"""Anthropic Claude wrapper — strict-JSON helper with fence stripping + retry.

PII rule: callers MUST pass anonymized/aggregated features only (customer IDs,
counts, scores) — never raw emails, phones, or full names. Every generated
insight should be persisted to `ai_insights` by the caller.
"""
from __future__ import annotations

import json
import re
from typing import Any

from ..config import get_settings

_FENCE_RE = re.compile(r"^\s*```(?:json)?\s*|\s*```\s*$", re.IGNORECASE)


def strip_fences(text: str) -> str:
    """Remove leading/trailing markdown code fences before JSON parsing."""
    text = text.strip()
    text = _FENCE_RE.sub("", text)
    return text.strip()


def parse_json_response(text: str) -> Any:
    """Parse a Claude text response as JSON, tolerating code fences.

    Raises json.JSONDecodeError on failure — callers must handle it (never let a
    parse failure pass silently).
    """
    return json.loads(strip_fences(text))


class ClaudeClient:
    """Thin wrapper around the Anthropic SDK for strict-JSON batch jobs."""

    def __init__(self, api_key: str | None = None, model: str | None = None):
        settings = get_settings()
        self._api_key = api_key or settings.anthropic_api_key
        self.model = model or settings.anthropic_model  # claude-sonnet-4-6
        self._client = None

    def _ensure_client(self):
        if self._client is None:
            from anthropic import Anthropic  # local import — optional at scaffold time

            self._client = Anthropic(api_key=self._api_key)
        return self._client

    def complete_json(
        self,
        prompt: str,
        *,
        system: str | None = None,
        max_tokens: int = 1024,
        max_retries: int = 2,
    ) -> Any:
        """Call Claude, expect a JSON document back, parse it.

        STUB: real SDK call + retry/backoff implemented in Phase 1. The
        fence-stripping + JSON parsing path (`parse_json_response`) is real and
        unit-testable today.
        """
        # TODO(phase1): client = self._ensure_client(); loop with retry/backoff:
        #   resp = client.messages.create(model=self.model, system=system,
        #       max_tokens=max_tokens, messages=[{"role": "user", "content": prompt}])
        #   return parse_json_response(resp.content[0].text)
        raise NotImplementedError(
            "ClaudeClient.complete_json is stubbed — implemented in Phase 1."
        )

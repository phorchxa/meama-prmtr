"""Vercel ASGI entry point — routes all /api/* requests to the FastAPI app."""
import os
import sys

# Resolve backend/ relative to this file so the `app` package is importable.
_here = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(_here, "..", "backend"))

from app.main import app  # noqa: F401, E402 — Vercel picks up `app` from this module

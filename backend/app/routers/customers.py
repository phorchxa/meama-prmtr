"""02 Customer 360 — list, search, detail."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from ..schemas.common import Page
from ..schemas.customers import CustomerDetail, CustomerSummary

router = APIRouter(prefix="/customers", tags=["customers"])


@router.get("", response_model=Page[CustomerSummary])
async def list_customers(
    q: str | None = None,
    status: str | None = None,
    segment: str | None = None,
    page: int = 1,
    page_size: int = 50,
) -> Page[CustomerSummary]:
    """List/search customers. STUB: returns an empty page in the correct shape."""
    return Page[CustomerSummary](items=[], total=0, page=page, page_size=page_size)


@router.get("/{customer_id}", response_model=CustomerDetail)
async def get_customer(customer_id: str) -> CustomerDetail:
    """Customer 360 detail. STUB: 404 until backed by data in Phase 1."""
    raise HTTPException(status_code=404, detail="Customer not found (scaffold stub).")

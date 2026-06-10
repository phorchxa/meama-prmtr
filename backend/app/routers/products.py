"""03 Product Intelligence."""
from __future__ import annotations

from fastapi import APIRouter

from ..schemas.products import ProductIntelligenceResponse

router = APIRouter(prefix="/products", tags=["products"])


@router.get("", response_model=ProductIntelligenceResponse)
async def get_product_intelligence() -> ProductIntelligenceResponse:
    """Top products + affinity pairs. STUB: empty shape."""
    return ProductIntelligenceResponse(top_products=[], affinities=[])

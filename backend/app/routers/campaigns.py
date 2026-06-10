"""05 Campaign Intelligence + promo calculator (real arithmetic)."""
from __future__ import annotations

from fastapi import APIRouter

from ..business_rules import (
    MARGIN_FLOOR,
    MAX_DISCOUNT,
    max_safe_discount,
    min_safe_price,
)
from ..schemas.campaigns import (
    CampaignSummary,
    PromoCalcLine,
    PromoCalcRequest,
    PromoCalcResponse,
)

router = APIRouter(prefix="/campaigns", tags=["campaigns"])


@router.get("", response_model=list[CampaignSummary])
async def list_campaigns() -> list[CampaignSummary]:
    """List campaigns. STUB: empty until backed by data in Phase 1."""
    return []


@router.post("/promo-calculator", response_model=PromoCalcResponse)
async def promo_calculator(req: PromoCalcRequest) -> PromoCalcResponse:
    """Compute per-SKU promo safety. Pure arithmetic — fully implemented.

    For each SKU:
      discounted_price = full_price * (1 - discount_pct)
      effective_margin = (discounted_price - cogs) / discounted_price
      min_safe_price   = cogs * 1.6667
      max_safe_discount= 1 - (min_safe_price / full_price), clamped to [0, 0.25]
    A line is BLOCKED (status "red") when:
      discount_pct > MAX_DISCOUNT (25%), OR
      effective_margin < MARGIN_FLOOR (40%), OR
      discounted_price < min_safe_price.
    """
    lines: list[PromoCalcLine] = []
    for item in req.sku_list:
        discounted_price = item.full_price * (1.0 - req.discount_pct)
        msp = min_safe_price(item.cogs)
        msd = max_safe_discount(item.full_price, item.cogs)

        effective_margin = (
            (discounted_price - item.cogs) / discounted_price
            if discounted_price > 0
            else 0.0
        )

        reasons: list[str] = []
        if req.discount_pct > MAX_DISCOUNT:
            reasons.append(
                f"discount {req.discount_pct:.0%} exceeds hard cap {MAX_DISCOUNT:.0%}"
            )
        if effective_margin < MARGIN_FLOOR:
            reasons.append(
                f"margin {effective_margin:.1%} below floor {MARGIN_FLOOR:.0%}"
            )
        if discounted_price < msp:
            reasons.append(
                f"price ₾{discounted_price:.2f} below min safe ₾{msp:.2f}"
            )

        blocked = len(reasons) > 0
        lines.append(
            PromoCalcLine(
                sku=item.sku,
                full_price=round(item.full_price, 2),
                cogs=round(item.cogs, 2),
                discounted_price=round(discounted_price, 2),
                min_safe_price=round(msp, 2),
                max_safe_discount=round(msd, 4),
                effective_margin=round(effective_margin, 4),
                status="red" if blocked else "green",
                blocked=blocked,
                reasons=reasons,
            )
        )

    return PromoCalcResponse(
        discount_pct=req.discount_pct,
        blocked=any(line.blocked for line in lines),
        lines=lines,
    )

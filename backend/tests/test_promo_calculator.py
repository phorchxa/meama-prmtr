"""Promo calculator math — the one piece of real business logic in the scaffold."""
from fastapi.testclient import TestClient

from app.business_rules import MARGIN_FLOOR, MAX_DISCOUNT
from app.main import app

client = TestClient(app)
URL = "/api/v1/campaigns/promo-calculator"


def _calc(sku_list, discount_pct):
    resp = client.post(URL, json={"sku_list": sku_list, "discount_pct": discount_pct})
    assert resp.status_code == 200, resp.text
    return resp.json()


def test_safe_discount_is_green():
    # Net-of-VAT (18%). full_price 100, cogs 30, 25% off -> discounted 75.
    # net = 75/1.18 = 63.56; margin = (63.56-30)/63.56 = 52.8% >= 40% -> green.
    # min_safe = 30 * 1.6667 * 1.18 = 59.0 (gross).
    body = _calc([{"sku": "CAP-001", "full_price": 100.0, "cogs": 30.0}], 0.25)
    line = body["lines"][0]
    assert line["status"] == "green"
    assert line["blocked"] is False
    assert body["blocked"] is False
    assert abs(line["min_safe_price"] - 59.0) < 0.05  # 30 * 1.6667 * 1.18
    assert abs(line["effective_margin"] - 0.528) < 0.005
    assert line["effective_margin"] >= MARGIN_FLOOR


def test_discount_over_25pct_allowed_when_margin_holds():
    # 25% is not a hard cap: a deeper discount is allowed while the net margin
    # floor holds. 30% off ₾100 with ₾30 COGS -> ₾70; net (70/1.18-30)/(70/1.18)
    # = 49.4% >= 40%, so it stays green.
    body = _calc([{"sku": "CAP-002", "full_price": 100.0, "cogs": 30.0}], 0.30)
    line = body["lines"][0]
    assert line["blocked"] is False
    assert line["status"] == "green"
    assert body["blocked"] is False


def test_margin_floor_breach_blocks():
    # full_price 100, cogs 65, 20% off -> 80. net (80/1.18-65)/(80/1.18) = 4.1% < 40%.
    body = _calc([{"sku": "CAP-003", "full_price": 100.0, "cogs": 65.0}], 0.20)
    line = body["lines"][0]
    assert line["blocked"] is True
    assert line["effective_margin"] < MARGIN_FLOOR
    assert any("floor" in r for r in line["reasons"])


def test_max_safe_discount_not_capped_at_25pct():
    # Low cogs -> true margin-floor ceiling far exceeds 25%; it must NOT be clamped.
    # min_safe = 5 * 1.6667 * 1.18 = 9.83; max_safe_discount = 1 - 9.83/100 = 0.902.
    body = _calc([{"sku": "CAP-004", "full_price": 100.0, "cogs": 5.0}], 0.10)
    line = body["lines"][0]
    assert line["max_safe_discount"] > MAX_DISCOUNT
    assert abs(line["max_safe_discount"] - 0.902) < 0.01


def test_mixed_basket_blocks_whole():
    body = _calc(
        [
            {"sku": "OK", "full_price": 100.0, "cogs": 30.0},
            {"sku": "BAD", "full_price": 100.0, "cogs": 65.0},
        ],
        0.20,
    )
    assert body["blocked"] is True
    statuses = {line["sku"]: line["status"] for line in body["lines"]}
    assert statuses["OK"] == "green"
    assert statuses["BAD"] == "red"

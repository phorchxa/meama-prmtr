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
    # full_price 100, cogs 30 -> min_safe_price 50.001, margin at 20% off: (80-30)/80 = 62.5%
    body = _calc([{"sku": "CAP-001", "full_price": 100.0, "cogs": 30.0}], 0.20)
    line = body["lines"][0]
    assert line["status"] == "green"
    assert line["blocked"] is False
    assert body["blocked"] is False
    assert abs(line["min_safe_price"] - 50.0) < 0.05  # 30 * 1.6667
    assert line["effective_margin"] >= MARGIN_FLOOR


def test_discount_over_cap_blocks():
    body = _calc([{"sku": "CAP-002", "full_price": 100.0, "cogs": 30.0}], 0.30)
    line = body["lines"][0]
    assert line["blocked"] is True
    assert line["status"] == "red"
    assert body["blocked"] is True
    assert any("cap" in r for r in line["reasons"])


def test_margin_floor_breach_blocks():
    # full_price 100, cogs 65 -> at 20% off: (80-65)/80 = 18.75% < 40%
    body = _calc([{"sku": "CAP-003", "full_price": 100.0, "cogs": 65.0}], 0.20)
    line = body["lines"][0]
    assert line["blocked"] is True
    assert line["effective_margin"] < MARGIN_FLOOR
    assert any("floor" in r for r in line["reasons"])


def test_max_safe_discount_clamped_to_cap():
    # very low cogs -> raw max safe discount would exceed cap; must clamp to 25%
    body = _calc([{"sku": "CAP-004", "full_price": 100.0, "cogs": 5.0}], 0.10)
    line = body["lines"][0]
    assert line["max_safe_discount"] <= MAX_DISCOUNT + 1e-9


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

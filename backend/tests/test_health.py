from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_ok():
    resp = client.get("/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert body["service"] == "meama-prmtr-backend"


def test_all_routers_registered():
    """Every module router must expose at least its list endpoint."""
    schema = client.get("/openapi.json").json()
    paths = schema["paths"]
    for prefix in (
        "/api/v1/overview",
        "/api/v1/customers",
        "/api/v1/products",
        "/api/v1/stock",
        "/api/v1/campaigns",
        "/api/v1/ads",
        "/api/v1/reports",
        "/api/v1/alerts",
        "/api/v1/actions",
    ):
        assert any(p.startswith(prefix) for p in paths), f"missing router: {prefix}"

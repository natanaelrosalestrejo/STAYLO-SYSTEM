"""
Smoke tests: reports + receptionist room scope (requires_module).
Receptionist has rooms but not reports per DEFAULT_ROLE_PERMISSIONS — do not assert /reports/dashboard for maria.
Requires a running API; set REACT_APP_BACKEND_URL (e.g. http://localhost:8000) or tests are skipped.
"""
import os

import pytest
import requests

_raw = os.environ.get("REACT_APP_BACKEND_URL", "").strip()
BASE_URL = _raw.rstrip("/") if _raw else ""

pytestmark = pytest.mark.skipif(
    not BASE_URL,
    reason="Set REACT_APP_BACKEND_URL to run integration tests (e.g. http://localhost:8000)",
)


def _login(email: str, password: str):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def test_receptionist_scoped_rooms_canonical_demo_count():
    """Receptionist: GET /rooms (require_module rooms), scoped to assigned hotel — 40 rooms in official demo."""
    token = _login("maria@hotel.com", "recep123")
    h = {"Authorization": f"Bearer {token}"}
    r = requests.get(f"{BASE_URL}/api/rooms", headers=h)
    assert r.status_code == 200, r.text
    rooms = r.json()
    assert len(rooms) == 40


def test_receptionist_reports_dashboard_forbidden_without_reports_module():
    token = _login("maria@hotel.com", "recep123")
    h = {"Authorization": f"Bearer {token}"}
    r = requests.get(f"{BASE_URL}/api/reports/dashboard", headers=h)
    assert r.status_code == 403


def test_reports_dashboard_admin_has_keys():
    token = _login("admin@hotel.com", "admin123")
    h = {"Authorization": f"Bearer {token}"}
    d = requests.get(f"{BASE_URL}/api/reports/dashboard", headers=h).json()
    for k in ("total_rooms", "occupied_rooms", "available_rooms", "occupancy_rate", "total_revenue"):
        assert k in d

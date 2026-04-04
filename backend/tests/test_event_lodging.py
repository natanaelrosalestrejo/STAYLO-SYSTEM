"""
Backend tests for initial Event + Lodging integration.
Scope: smoke tests only, to validate new endpoints exist and respect role/scope.
"""
import os

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")


def _login(email: str, password: str) -> str | None:
  r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password})
  if r.status_code == 200:
    data = r.json()
    return data.get("access_token") or data.get("token")
  return None


@pytest.fixture(scope="module")
def admin_token():
  # Use platform_admin: has scope for all properties (events in garden), can call lodging setup
  token = _login("platform@almasystem.com", "platform123")
  if not token:
    pytest.skip("Platform admin login failed")
  return token


@pytest.fixture(scope="module")
def admin_headers(admin_token):
  return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


class TestEventLodgingIntegration:
  """Minimal smoke tests for event lodging endpoints."""

  def test_setup_and_get_lodging_for_existing_event(self, admin_headers):
    # Get any existing event booking (seeded demo data is expected)
    r = requests.get(f"{BASE_URL}/api/event-bookings", headers=admin_headers)
    assert r.status_code == 200
    bookings = r.json()
    if not bookings:
      pytest.skip("No event bookings available to test event lodging")
    event = bookings[0]
    event_id = event["id"]

    # Basic lodging setup with integration disabled (should not error)
    setup_payload = {
      "lodging_integration_enabled": False,
      "special_rooms": [],
      "guest_block_count": 0,
    }
    r2 = requests.post(
      f"{BASE_URL}/api/event-bookings/{event_id}/lodging/setup",
      json=setup_payload,
      headers=admin_headers,
    )
    assert r2.status_code in [200, 201], f"Unexpected status: {r2.status_code} {r2.text}"

    # Fetch lodging data
    r3 = requests.get(
      f"{BASE_URL}/api/event-bookings/{event_id}/lodging",
      headers=admin_headers,
    )
    assert r3.status_code == 200
    data = r3.json()
    assert data["event_id"] == event_id
    assert "lodging_integration_enabled" in data
    assert "summary" in data


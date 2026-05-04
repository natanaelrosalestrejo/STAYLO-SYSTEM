"""
Integration tests for /api/corporate/dashboard.
Scope: tenant isolation, role guards, response shape, aggregation correctness.
Requires a running API; set REACT_APP_BACKEND_URL or tests are skipped.
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").strip().rstrip("/")

pytestmark = pytest.mark.skipif(
    not BASE_URL,
    reason="Set REACT_APP_BACKEND_URL to run (e.g. http://localhost:8000)",
)

DEMO_PROPERTY_IDS = {"alma_hotel", "garden_margati", "garden_alma"}


def _login(email: str, password: str) -> str:
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def _dashboard(token: str) -> requests.Response:
    return requests.get(
        f"{BASE_URL}/api/corporate/dashboard",
        headers={"Authorization": f"Bearer {token}"},
    )


# ── Auth & Role Guards ──────────────────────────────────────────────────────

def test_unauthenticated_returns_401():
    r = requests.get(f"{BASE_URL}/api/corporate/dashboard")
    assert r.status_code == 401


def test_receptionist_returns_403():
    r = _dashboard(_login("maria@hotel.com", "recep123"))
    assert r.status_code == 403


def test_housekeeping_returns_403():
    r = _dashboard(_login("carlos@hotel.com", "house123"))
    assert r.status_code == 403


def test_manager_can_access():
    r = _dashboard(_login("admin@hotel.com", "admin123"))
    assert r.status_code == 200, r.text


def test_owner_can_access():
    r = _dashboard(_login("owner@hotel.com", "owner123"))
    assert r.status_code == 200, r.text


# ── Response Shape ──────────────────────────────────────────────────────────

class TestResponseShape:
    @pytest.fixture(scope="class")
    def data(self):
        return _dashboard(_login("admin@hotel.com", "admin123")).json()

    def test_top_level_sections_present(self, data):
        for key in ("hotel", "event_gardens", "group", "revenue_intelligence",
                    "property_ranking", "comparison_chart", "pending_breakdown",
                    "upcoming_events", "lodging_summary", "scope"):
            assert key in data, f"Missing section: {key}"

    def test_hotel_section_keys(self, data):
        for key in ("property_name", "revenue_this_month", "revenue_total",
                    "occupancy_rate", "total_rooms", "occupied_rooms",
                    "pending_payments", "performance_score", "expected_revenue"):
            assert key in data["hotel"], f"Missing hotel key: {key}"

    def test_event_gardens_section_keys(self, data):
        for key in ("property_name", "revenue_this_month", "revenue_total",
                    "bookings_total", "pending_payments", "upcoming_events",
                    "performance_score", "expected_revenue"):
            assert key in data["event_gardens"], f"Missing event_gardens key: {key}"

    def test_group_section_keys(self, data):
        for key in ("total_revenue_this_month", "total_revenue_all_time",
                    "revenue_growth_pct", "total_staff",
                    "today_arrivals", "today_departures"):
            assert key in data["group"], f"Missing group key: {key}"

    def test_pending_breakdown_keys(self, data):
        for key in ("total_pending_amount", "hotel_pending_amount", "event_pending_amount"):
            assert key in data["pending_breakdown"], f"Missing pending_breakdown key: {key}"


# ── Tenant Scope ────────────────────────────────────────────────────────────

class TestTenantScope:
    @pytest.fixture(scope="class")
    def data(self):
        return _dashboard(_login("admin@hotel.com", "admin123")).json()

    def test_scope_contains_only_demo_properties(self, data):
        scope_ids = set(data["scope"]["property_ids"])
        assert scope_ids == DEMO_PROPERTY_IDS, f"Scope leaked: {scope_ids}"

    def test_scope_count_matches_demo_setup(self, data):
        assert len(data["scope"]["property_ids"]) == 3

    def test_property_ranking_uses_canonical_ids(self, data):
        for item in data["property_ranking"]:
            assert item["rank_id"] in ("hotel", "garden")


# ── Aggregation Correctness ─────────────────────────────────────────────────

class TestAggregation:
    @pytest.fixture(scope="class")
    def data(self):
        return _dashboard(_login("admin@hotel.com", "admin123")).json()

    def test_hotel_rooms_canonical_count(self, data):
        assert data["hotel"]["total_rooms"] == 40

    def test_hotel_rooms_occupied_plus_available_lte_total(self, data):
        h = data["hotel"]
        assert h["occupied_rooms"] + h["available_rooms"] <= h["total_rooms"]

    def test_occupancy_rate_is_valid_percentage(self, data):
        rate = data["hotel"]["occupancy_rate"]
        assert 0.0 <= rate <= 100.0, f"Occupancy rate out of bounds: {rate}"

    def test_revenue_values_non_negative(self, data):
        assert data["hotel"]["revenue_this_month"] >= 0
        assert data["hotel"]["revenue_total"] >= 0
        assert data["event_gardens"]["revenue_this_month"] >= 0
        assert data["group"]["total_revenue_this_month"] >= 0

    def test_group_monthly_revenue_equals_sum_of_parts(self, data):
        expected = data["hotel"]["revenue_this_month"] + data["event_gardens"]["revenue_this_month"]
        assert data["group"]["total_revenue_this_month"] == expected

    def test_pending_breakdown_total_equals_sum(self, data):
        pb = data["pending_breakdown"]
        assert abs(pb["total_pending_amount"] - pb["hotel_pending_amount"] - pb["event_pending_amount"]) < 0.01

    def test_source_breakdown_covers_all_channels(self, data):
        sources = {s["source"] for s in data["revenue_intelligence"]["source_breakdown"]}
        assert sources == {"web", "reception", "whatsapp", "other"}

    def test_property_ranking_has_both_types(self, data):
        types = {item["type"] for item in data["property_ranking"]}
        assert "hotel" in types and "event_garden" in types

    def test_performance_scores_bounded(self, data):
        for score in (data["hotel"]["performance_score"], data["event_gardens"]["performance_score"]):
            assert 0 <= score <= 100, f"Score out of bounds: {score}"

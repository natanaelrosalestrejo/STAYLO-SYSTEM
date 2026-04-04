"""Tests for multi-property features: properties, event-spaces, event-bookings, corporate dashboard"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

@pytest.fixture
def auth_token():
    res = requests.post(f"{BASE_URL}/api/auth/login", json={"email": "admin@hotel.com", "password": "admin123"})
    assert res.status_code == 200
    return res.json()["access_token"]

@pytest.fixture
def headers(auth_token):
    return {"Authorization": f"Bearer {auth_token}"}

class TestProperties:
    """Tests for /api/properties"""

    def test_get_properties_returns_canonical_demo_count(self, headers):
        res = requests.get(f"{BASE_URL}/api/properties", headers=headers)
        assert res.status_code == 200
        data = res.json()
        assert isinstance(data, list)
        # Canonical demo: 1 hotel + 2 event gardens (seeds/run.py + reset_staylo_demo.py)
        assert len(data) == 3

    def test_properties_have_required_fields(self, headers):
        res = requests.get(f"{BASE_URL}/api/properties", headers=headers)
        data = res.json()
        for p in data:
            assert 'id' in p
            assert 'name' in p
            assert 'type' in p
            assert 'status' in p

    def test_properties_include_hotel_and_garden(self, headers):
        res = requests.get(f"{BASE_URL}/api/properties", headers=headers)
        data = res.json()
        types = [p['type'] for p in data]
        assert 'hotel' in types
        assert 'event_garden' in types


class TestEventSpaces:
    """Tests for /api/event-spaces"""

    def test_get_event_spaces_returns_canonical_demo_count(self, headers):
        res = requests.get(f"{BASE_URL}/api/event-spaces", headers=headers)
        assert res.status_code == 200
        data = res.json()
        assert isinstance(data, list)
        assert len(data) == 4

    def test_event_spaces_have_required_fields(self, headers):
        res = requests.get(f"{BASE_URL}/api/event-spaces", headers=headers)
        data = res.json()
        for s in data:
            assert 'id' in s
            assert 'space_name' in s
            assert 'capacity' in s


class TestEventBookings:
    """Tests for /api/event-bookings"""

    def test_get_event_bookings_returns_three(self, headers):
        res = requests.get(f"{BASE_URL}/api/event-bookings", headers=headers)
        assert res.status_code == 200
        data = res.json()
        assert isinstance(data, list)
        assert len(data) >= 3

    def test_event_bookings_have_demo_clients(self, headers):
        res = requests.get(f"{BASE_URL}/api/event-bookings", headers=headers)
        data = res.json()
        names = [b['client_name'] for b in data]
        assert any('Rodríguez' in n or 'Rodriguez' in n for n in names)

    def test_create_event_booking(self, headers):
        # First get a space id
        spaces_res = requests.get(f"{BASE_URL}/api/event-spaces", headers=headers)
        space_id = spaces_res.json()[0]['id']

        payload = {
            "event_space_id": space_id,
            "client_name": "TEST_Evento Cliente",
            "client_email": "test@test.com",
            "client_phone": "+52 55 0000 0001",
            "event_date": "2026-12-01",
            "event_type": "wedding",
            "attendees": 50,
            "total_price": 20000,
            "booking_status": "confirmed",
            "notes": "Test event",
            "reservation_source": "reception",
            "property_id": ""
        }
        res = requests.post(f"{BASE_URL}/api/event-bookings", json=payload, headers=headers)
        assert res.status_code in [200, 201]
        created = res.json()
        assert 'id' in created
        # Cleanup
        booking_id = created['id']
        requests.delete(f"{BASE_URL}/api/event-bookings/{booking_id}", headers=headers)


class TestCorporateDashboard:
    """Tests for /api/corporate/dashboard"""

    def test_corporate_dashboard_status(self, headers):
        res = requests.get(f"{BASE_URL}/api/corporate/dashboard", headers=headers)
        assert res.status_code == 200

    def test_corporate_dashboard_has_required_keys(self, headers):
        res = requests.get(f"{BASE_URL}/api/corporate/dashboard", headers=headers)
        data = res.json()
        assert 'hotel' in data
        assert 'event_gardens' in data
        assert 'group' in data
        assert 'comparison_chart' in data
        assert 'properties' in data

    def test_corporate_dashboard_group_metrics(self, headers):
        res = requests.get(f"{BASE_URL}/api/corporate/dashboard", headers=headers)
        data = res.json()
        group = data['group']
        assert 'total_revenue_this_month' in group
        assert 'total_revenue_all_time' in group
        assert 'total_staff' in group
        assert 'today_arrivals' in group
        assert 'today_departures' in group
        assert 'pending_payments' in group

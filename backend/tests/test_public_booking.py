"""Tests for public booking endpoints and room data"""
import pytest
import requests
import os
from datetime import date, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')

today = date.today()
check_in = (today + timedelta(days=30)).isoformat()
check_out = (today + timedelta(days=32)).isoformat()

class TestPublicAvailability:
    """GET /api/public/availability"""

    def test_availability_returns_200(self):
        r = requests.get(f"{BASE_URL}/api/public/availability", params={"check_in": check_in, "check_out": check_out, "adults": 2})
        assert r.status_code == 200, f"Got {r.status_code}: {r.text}"

    def test_availability_returns_room_types(self):
        r = requests.get(f"{BASE_URL}/api/public/availability", params={"check_in": check_in, "check_out": check_out, "adults": 2})
        data = r.json()
        types = [d["type"] for d in data]
        assert "junior_suite" in types
        assert "double" in types

    def test_availability_prices_in_mxn(self):
        r = requests.get(f"{BASE_URL}/api/public/availability", params={"check_in": check_in, "check_out": check_out, "adults": 2})
        data = r.json()
        for room in data:
            assert room["price_per_night"] > 0
            # MXN prices should be reasonable (1000+ per night)
            assert room["price_per_night"] >= 1000, f"Price too low for MXN: {room['price_per_night']}"

    def test_availability_has_available_rooms(self):
        r = requests.get(f"{BASE_URL}/api/public/availability", params={"check_in": check_in, "check_out": check_out, "adults": 2})
        data = r.json()
        total_available = sum(d["available_count"] for d in data)
        assert total_available > 0, "No available rooms for future dates"

    def test_availability_invalid_dates(self):
        r = requests.get(f"{BASE_URL}/api/public/availability", params={"check_in": check_out, "check_out": check_in, "adults": 2})
        assert r.status_code == 400


class TestRoomsData:
    """Verify room structure: 40 rooms, Junior Suites at 5,15,25,35"""

    def test_admin_login(self):
        r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": "admin@hotel.com", "password": "admin123"})
        assert r.status_code == 200
        assert "access_token" in r.json()

    def test_total_40_rooms(self):
        token = requests.post(f"{BASE_URL}/api/auth/login", json={"email": "admin@hotel.com", "password": "admin123"}).json()["access_token"]
        r = requests.get(f"{BASE_URL}/api/rooms", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 200
        rooms = r.json()
        assert len(rooms) == 40, f"Expected 40 rooms, got {len(rooms)}"

    def test_junior_suites_at_rooms_5_15_25_35(self):
        token = requests.post(f"{BASE_URL}/api/auth/login", json={"email": "admin@hotel.com", "password": "admin123"}).json()["access_token"]
        r = requests.get(f"{BASE_URL}/api/rooms", headers={"Authorization": f"Bearer {token}"})
        rooms = r.json()
        room_map = {int(rm["number"]): rm["type"] for rm in rooms if rm["number"].isdigit()}
        for num in [5, 15, 25, 35]:
            assert room_map.get(num) == "junior_suite", f"Room {num} is {room_map.get(num)}, expected junior_suite"

    def test_rooms_have_dollar_currency(self):
        # Rooms should use MXN pricing (price >= 1000)
        token = requests.post(f"{BASE_URL}/api/auth/login", json={"email": "admin@hotel.com", "password": "admin123"}).json()["access_token"]
        r = requests.get(f"{BASE_URL}/api/rooms", headers={"Authorization": f"Bearer {token}"})
        rooms = r.json()
        for rm in rooms:
            assert rm["price_per_night"] >= 1000, f"Room {rm['number']} price {rm['price_per_night']} seems too low for MXN"


class TestPublicBookingCreate:
    """POST /api/public/booking/create"""

    def test_create_booking_hotel_payment(self):
        payload = {
            "check_in_date": check_in,
            "check_out_date": check_out,
            "adults": 2,
            "children": 0,
            "room_type": "double",
            "first_name": "TEST_Juan",
            "last_name": "Pérez",
            "email": "test_booking@example.com",
            "phone": "5551234567",
            "id_number": "ABC123",
            "special_requests": "",
            "extras": {"desayuno": False, "early_checkin": False, "late_checkout": False}
        }
        r = requests.post(f"{BASE_URL}/api/public/booking/create", json=payload)
        assert r.status_code == 200, f"Got {r.status_code}: {r.text}"
        data = r.json()
        assert "booking_ref" in data
        assert "room_number" in data
        assert "total_amount" in data
        assert data["nights"] == 2

    def test_create_booking_with_extras(self):
        ci2 = (today + timedelta(days=60)).isoformat()
        co2 = (today + timedelta(days=63)).isoformat()
        payload = {
            "check_in_date": ci2,
            "check_out_date": co2,
            "adults": 2,
            "children": 0,
            "room_type": "junior_suite",
            "first_name": "TEST_Maria",
            "last_name": "García",
            "email": "test_extras@example.com",
            "phone": "5559876543",
            "id_number": "XYZ789",
            "special_requests": "Vista al jardín",
            "extras": {"desayuno": True, "early_checkin": True, "late_checkout": False}
        }
        r = requests.post(f"{BASE_URL}/api/public/booking/create", json=payload)
        assert r.status_code == 200, f"Got {r.status_code}: {r.text}"
        data = r.json()
        # junior_suite 2500/night * 3 nights = 7500 + desayuno 200*2*3=1200 + early_checkin 300 = 9000
        assert data["total_amount"] > 7500

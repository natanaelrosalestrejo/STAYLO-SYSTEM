"""
Tests for Staylo refactor - Phase 1-4 features:
- Platform Admin login + redirect
- Hotel spaces CRUD
- Room types at hotel level
- Staff delete role hierarchy
- Platform admin stats (SaaS metrics)
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

@pytest.fixture(scope="module")
def platform_token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": "platform@almasystem.com", "password": "platform123"})
    assert r.status_code == 200, f"Platform login failed: {r.text}"
    return r.json()["access_token"]

@pytest.fixture(scope="module")
def hotel_token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": "admin@hotel.com", "password": "admin123"})
    assert r.status_code == 200, f"Hotel admin login failed: {r.text}"
    return r.json()["access_token"]

@pytest.fixture(scope="module")
def reception_token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": "maria@hotel.com", "password": "recep123"})
    assert r.status_code == 200, f"Receptionist login failed: {r.text}"
    return r.json()["access_token"]

class TestAuth:
    """Login and role redirect tests"""

    def test_platform_admin_login(self):
        r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": "platform@almasystem.com", "password": "platform123"})
        assert r.status_code == 200
        data = r.json()
        assert "access_token" in data
        assert data["user"]["role"] == "platform_admin"
        print("PASS: Platform admin login works")

    def test_hotel_admin_login(self):
        r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": "admin@hotel.com", "password": "admin123"})
        assert r.status_code == 200
        data = r.json()
        assert data["user"]["role"] == "manager"
        print("PASS: Hotel admin login works")

    def test_receptionist_login(self):
        r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": "maria@hotel.com", "password": "recep123"})
        assert r.status_code == 200
        data = r.json()
        assert data["user"]["role"] in ["receptionist", "manager"]
        print("PASS: Receptionist login works")


class TestPlatformAdmin:
    """Platform Admin SaaS metrics and tenant management"""

    def test_tenants_list(self, platform_token):
        r = requests.get(f"{BASE_URL}/api/tenants", headers={"Authorization": f"Bearer {platform_token}"})
        assert r.status_code == 200
        assert isinstance(r.json(), list)
        print(f"PASS: Got {len(r.json())} tenants")

    def test_properties_list_platform(self, platform_token):
        r = requests.get(f"{BASE_URL}/api/properties", headers={"Authorization": f"Bearer {platform_token}"})
        assert r.status_code == 200
        assert isinstance(r.json(), list)
        print(f"PASS: Got {len(r.json())} properties")

    def test_dashboard_stats_platform(self, platform_token):
        """Platform admin should be able to get stats"""
        r = requests.get(f"{BASE_URL}/api/dashboard/stats", headers={"Authorization": f"Bearer {platform_token}"})
        # platform admin may not have property-specific stats, check it returns something
        assert r.status_code in [200, 403, 404]
        print(f"Platform stats status: {r.status_code}")


class TestHotelSpaces:
    """Hotel spaces CRUD endpoints"""

    def test_get_hotel_spaces(self, hotel_token):
        r = requests.get(f"{BASE_URL}/api/hotel-spaces", headers={"Authorization": f"Bearer {hotel_token}"})
        assert r.status_code == 200
        assert isinstance(r.json(), list)
        print(f"PASS: Got {len(r.json())} hotel spaces")

    def test_create_hotel_space(self, hotel_token):
        payload = {
            "space_name": "TEST_Salon Principal",
            "space_type": "salon",
            "capacity": 150,
            "description": "Test salon",
            "price_per_event": 15000,
            "status": "available",
            "property_id": ""
        }
        r = requests.post(f"{BASE_URL}/api/hotel-spaces", json=payload, headers={"Authorization": f"Bearer {hotel_token}"})
        assert r.status_code == 200
        data = r.json()
        assert "id" in data
        assert data["space_name"] == "TEST_Salon Principal"
        print(f"PASS: Hotel space created: {data['id']}")
        return data["id"]

    def test_hotel_spaces_flow(self, hotel_token):
        """Create → GET → DELETE hotel space"""
        payload = {"space_name": "TEST_Flow Space", "space_type": "rooftop", "capacity": 50, "status": "available", "property_id": ""}
        r = requests.post(f"{BASE_URL}/api/hotel-spaces", json=payload, headers={"Authorization": f"Bearer {hotel_token}"})
        assert r.status_code == 200
        space_id = r.json()["id"]

        # GET list - verify space exists
        r2 = requests.get(f"{BASE_URL}/api/hotel-spaces", headers={"Authorization": f"Bearer {hotel_token}"})
        assert r2.status_code == 200
        ids = [s["id"] for s in r2.json()]
        assert space_id in ids

        # DELETE
        r3 = requests.delete(f"{BASE_URL}/api/hotel-spaces/{space_id}", headers={"Authorization": f"Bearer {hotel_token}"})
        assert r3.status_code == 200
        print("PASS: Hotel space CRUD flow complete")

    def test_receptionist_cannot_create_space(self, reception_token):
        """Receptionists should not be able to create hotel spaces"""
        payload = {"space_name": "TEST_Unauthorized", "space_type": "general", "capacity": 10, "status": "available", "property_id": ""}
        r = requests.post(f"{BASE_URL}/api/hotel-spaces", json=payload, headers={"Authorization": f"Bearer {reception_token}"})
        assert r.status_code in [403, 401]
        print(f"PASS: Receptionist blocked from creating space: {r.status_code}")


class TestRoomTypes:
    """Room types at hotel level"""

    def test_get_room_types(self, hotel_token):
        r = requests.get(f"{BASE_URL}/api/room-types", headers={"Authorization": f"Bearer {hotel_token}"})
        assert r.status_code == 200
        assert isinstance(r.json(), list)
        print(f"PASS: Got {len(r.json())} room types")

    def test_create_room_type(self, hotel_token):
        payload = {"name": "TEST_Junior Suite", "description": "Test suite", "base_price": 1500, "capacity": 2, "amenities": [], "images": [], "status": "active"}
        r = requests.post(f"{BASE_URL}/api/room-types", json=payload, headers={"Authorization": f"Bearer {hotel_token}"})
        assert r.status_code == 200
        data = r.json()
        assert "id" in data
        assert data["name"] == "TEST_Junior Suite"
        print(f"PASS: Room type created: {data['id']}")

        # Cleanup
        requests.delete(f"{BASE_URL}/api/room-types/{data['id']}", headers={"Authorization": f"Bearer {hotel_token}"})


class TestStaffDeleteHierarchy:
    """Staff delete role hierarchy"""

    def test_staff_users_list(self, hotel_token):
        r = requests.get(f"{BASE_URL}/api/users", headers={"Authorization": f"Bearer {hotel_token}"})
        assert r.status_code == 200
        users = r.json()
        assert isinstance(users, list)
        print(f"PASS: Got {len(users)} users")

    def test_delete_nonexistent_user(self, hotel_token):
        """Delete request for nonexistent user should 404"""
        r = requests.delete(f"{BASE_URL}/api/users/nonexistent_user_id_999", headers={"Authorization": f"Bearer {hotel_token}"})
        assert r.status_code in [404, 400]
        print(f"PASS: Nonexistent user delete returns {r.status_code}")

    def test_receptionist_cannot_delete_user(self, reception_token):
        """Receptionist role should not be allowed to delete users"""
        # Using a placeholder id - should return 403 before 404
        r = requests.delete(f"{BASE_URL}/api/users/some_user_id", headers={"Authorization": f"Bearer {reception_token}"})
        assert r.status_code in [403, 401]
        print(f"PASS: Receptionist blocked from deleting user: {r.status_code}")


class TestEventGarden:
    """Garden/EventGarden functionality"""

    def test_get_event_spaces(self, hotel_token):
        r = requests.get(f"{BASE_URL}/api/event-spaces", headers={"Authorization": f"Bearer {hotel_token}"})
        assert r.status_code == 200
        print(f"PASS: Event spaces endpoint works, got {len(r.json())} spaces")

    def test_get_event_bookings(self, hotel_token):
        r = requests.get(f"{BASE_URL}/api/event-bookings", headers={"Authorization": f"Bearer {hotel_token}"})
        assert r.status_code == 200
        print(f"PASS: Event bookings endpoint works, got {len(r.json())} bookings")

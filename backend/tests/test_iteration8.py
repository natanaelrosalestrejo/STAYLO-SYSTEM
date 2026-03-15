"""Backend tests for iteration 8: Rooms CRUD, Staff/owner role, Role Permissions, Public Booking fix"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": "admin@hotel.com", "password": "admin123"})
    assert r.status_code == 200
    return r.json()["access_token"]

@pytest.fixture(scope="module")
def platform_token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": "platform@almasystem.com", "password": "platform123"})
    assert r.status_code == 200
    return r.json()["access_token"]

@pytest.fixture(scope="module")
def owner_token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": "owner@hotel.com", "password": "owner123"})
    assert r.status_code == 200
    return r.json()["access_token"]

class TestRoomsCRUD:
    """Test Rooms CRUD operations"""
    created_room_id = None

    def test_create_room(self, admin_token):
        # Clean up room TEST999 from a previous run so create does not get 400 and count stays 40 for other tests
        headers = {"Authorization": f"Bearer {admin_token}"}
        list_r = requests.get(f"{BASE_URL}/api/rooms", headers=headers)
        if list_r.status_code == 200:
            for room in list_r.json():
                if room.get("number") == "TEST999":
                    requests.delete(f"{BASE_URL}/api/rooms/{room['id']}", headers=headers)
                    break
        r = requests.post(f"{BASE_URL}/api/rooms",
            json={"number": "TEST999", "type": "suite", "floor": 4, "price_per_night": 2500, "capacity": 2, "amenities": ["WiFi"]},
            headers=headers)
        assert r.status_code == 200
        data = r.json()
        assert data["number"] == "TEST999"
        assert data["type"] == "suite"
        TestRoomsCRUD.created_room_id = data["id"]
        print(f"Created room id: {data['id']}")

    def test_get_rooms(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/rooms", headers={"Authorization": f"Bearer {admin_token}"})
        assert r.status_code == 200
        rooms = r.json()
        assert isinstance(rooms, list)
        numbers = [rm["number"] for rm in rooms]
        assert "TEST999" in numbers
        print(f"Total rooms: {len(rooms)}")

    def test_edit_room(self, admin_token):
        room_id = TestRoomsCRUD.created_room_id
        r = requests.put(f"{BASE_URL}/api/rooms/{room_id}",
            json={"number": "TEST999", "type": "suite", "floor": 4, "price_per_night": 3000, "capacity": 3, "amenities": ["WiFi", "TV"]},
            headers={"Authorization": f"Bearer {admin_token}"})
        assert r.status_code == 200
        data = r.json()
        assert data["price_per_night"] == 3000
        print("Room edit successful")

    def test_delete_room(self, admin_token):
        room_id = TestRoomsCRUD.created_room_id
        r = requests.delete(f"{BASE_URL}/api/rooms/{room_id}",
            headers={"Authorization": f"Bearer {admin_token}"})
        assert r.status_code == 200
        print("Room delete successful")


class TestStaffOwnerRole:
    """Test platform_admin can create owner role"""
    created_user_id = None

    def test_platform_admin_create_owner(self, platform_token):
        r = requests.post(f"{BASE_URL}/api/users",
            json={"name": "TEST Owner User", "email": "test_owner_iter8@hotel.com", "password": "test123", "role": "owner"},
            headers={"Authorization": f"Bearer {platform_token}"})
        assert r.status_code in [200, 201]
        data = r.json()
        assert data["role"] == "owner"
        TestStaffOwnerRole.created_user_id = data["id"]
        print(f"Created owner user: {data['id']}")

    def test_cleanup_owner_user(self, platform_token):
        if TestStaffOwnerRole.created_user_id:
            r = requests.delete(f"{BASE_URL}/api/users/{TestStaffOwnerRole.created_user_id}",
                headers={"Authorization": f"Bearer {platform_token}"})
            print(f"Cleanup user: {r.status_code}")


class TestRolePermissions:
    """Test role permissions CRUD"""

    def test_get_role_permissions(self, platform_token):
        r = requests.get(f"{BASE_URL}/api/role-permissions",
            headers={"Authorization": f"Bearer {platform_token}"})
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, dict)
        assert len(data) > 0
        print(f"Role permissions roles: {list(data.keys())}")

    def test_update_role_permissions(self, platform_token):
        r = requests.put(f"{BASE_URL}/api/role-permissions/receptionist",
            json={"modules": ["reservations", "guests"]},
            headers={"Authorization": f"Bearer {platform_token}"})
        assert r.status_code == 200
        print("Role permissions updated")


class TestPublicBooking:
    """Test public booking endpoint with check_in_date fix"""

    def test_public_booking_hotel_payment(self):
        from datetime import date, timedelta
        today = date.today()
        check_in = (today + timedelta(days=30)).isoformat()
        check_out = (today + timedelta(days=32)).isoformat()
        r = requests.post(f"{BASE_URL}/api/public/booking/create", json={
            "first_name": "Test",
            "last_name": "Guest",
            "email": "testguest@test.com",
            "phone": "1234567890",
            "room_type": "double",
            "adults": 2,
            "children": 0,
            "check_in_date": check_in,
            "check_out_date": check_out,
            "payment_method": "hotel",
            "special_requests": ""
        })
        print(f"Public booking status: {r.status_code}, response: {r.text[:200]}")
        assert r.status_code == 200
        data = r.json()
        assert "booking_ref" in data or "id" in data

    def test_lookup_booking(self):
        # First create booking, then look it up
        from datetime import date, timedelta
        today = date.today()
        check_in = (today + timedelta(days=35)).isoformat()
        check_out = (today + timedelta(days=37)).isoformat()
        r = requests.post(f"{BASE_URL}/api/public/booking/create", json={
            "first_name": "Lookup",
            "last_name": "Test",
            "email": "lookuptest@test.com",
            "phone": "9876543210",
            "room_type": "double",
            "adults": 1,
            "children": 0,
            "check_in_date": check_in,
            "check_out_date": check_out,
            "payment_method": "hotel",
            "special_requests": ""
        })
        if r.status_code == 200:
            booking_ref = r.json().get("booking_ref")
            if booking_ref:
                lr = requests.get(f"{BASE_URL}/api/public/booking/lookup?booking_ref={booking_ref}&email=lookuptest@test.com")
                print(f"Lookup status: {lr.status_code}")
                assert lr.status_code == 200


class TestCorporateDashboard:
    """Test corporate dashboard metrics"""

    def test_corporate_stats_has_best_hotel(self, owner_token):
        r = requests.get(f"{BASE_URL}/api/corporate/dashboard",
            headers={"Authorization": f"Bearer {owner_token}"})
        assert r.status_code == 200
        data = r.json()
        ri = data.get("revenue_intelligence", {})
        print(f"Corporate RI keys: {list(ri.keys())}")
        assert "best_hotel" in ri
        assert "best_garden" in ri
        print(f"best_hotel: {ri['best_hotel']['name']}, best_garden: {ri['best_garden']['name']}")

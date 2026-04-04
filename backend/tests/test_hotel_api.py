"""
Hotel Management System - Backend API Tests
Tests: Auth, Rooms, Guests, Reservations, Messages, Tasks, Reports
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# ====================== AUTH ======================

class TestAuth:
    """Authentication endpoint tests"""

    def test_admin_login(self):
        r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": "admin@hotel.com", "password": "admin123"})
        assert r.status_code == 200
        data = r.json()
        assert "access_token" in data
        assert data["user"]["role"] == "admin"
        print("PASS: Admin login OK")

    def test_receptionist_login(self):
        r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": "maria@hotel.com", "password": "recep123"})
        assert r.status_code == 200
        data = r.json()
        assert data["user"]["role"] == "receptionist"
        print("PASS: Receptionist login OK")

    def test_housekeeping_login(self):
        r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": "carlos@hotel.com", "password": "house123"})
        assert r.status_code == 200
        data = r.json()
        assert data["user"]["role"] == "housekeeping"
        print("PASS: Housekeeping login OK")

    def test_invalid_login(self):
        r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": "wrong@test.com", "password": "wrong"})
        assert r.status_code == 401
        print("PASS: Invalid login returns 401")

    def test_auth_me(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/auth/me", headers={"Authorization": f"Bearer {admin_token}"})
        assert r.status_code == 200
        assert r.json()["role"] == "admin"
        print("PASS: /auth/me returns user info")


class TestRooms:
    """Room CRUD tests"""

    def test_get_rooms(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/rooms", headers={"Authorization": f"Bearer {admin_token}"})
        assert r.status_code == 200
        rooms = r.json()
        assert len(rooms) >= 15
        assert "number" in rooms[0]
        print(f"PASS: Got {len(rooms)} rooms")

    def test_update_room_status(self, admin_token):
        # Get a room first
        r = requests.get(f"{BASE_URL}/api/rooms", headers={"Authorization": f"Bearer {admin_token}"})
        rooms = r.json()
        room_id = rooms[0]["id"]
        # Update status
        r2 = requests.patch(f"{BASE_URL}/api/rooms/{room_id}/status",
                            json={"status": "maintenance"},
                            headers={"Authorization": f"Bearer {admin_token}"})
        assert r2.status_code == 200
        assert r2.json()["status"] == "maintenance"
        # Restore
        requests.patch(f"{BASE_URL}/api/rooms/{room_id}/status",
                       json={"status": rooms[0]["status"]},
                       headers={"Authorization": f"Bearer {admin_token}"})
        print("PASS: Room status update OK")


class TestGuests:
    """Guest CRUD tests"""

    def test_get_guests(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/guests", headers={"Authorization": f"Bearer {admin_token}"})
        assert r.status_code == 200
        guests = r.json()
        assert len(guests) >= 4
        print(f"PASS: Got {len(guests)} guests")

    def test_create_and_delete_guest(self, admin_token):
        headers = {"Authorization": f"Bearer {admin_token}"}
        payload = {"first_name": "TEST_John", "last_name": "Doe", "email": "test_john@test.com"}
        r = requests.post(f"{BASE_URL}/api/guests", json=payload, headers=headers)
        assert r.status_code == 200
        guest = r.json()
        assert guest["first_name"] == "TEST_John"
        # Delete
        r2 = requests.delete(f"{BASE_URL}/api/guests/{guest['id']}", headers=headers)
        assert r2.status_code == 200
        print("PASS: Create and delete guest OK")


class TestReservations:
    """Reservation tests"""

    def test_get_reservations(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/reservations", headers={"Authorization": f"Bearer {admin_token}"})
        assert r.status_code == 200
        assert len(r.json()) >= 4
        print(f"PASS: Got {len(r.json())} reservations")

    def test_checkin_requires_admin_or_receptionist(self, housekeeping_token, admin_token):
        # Housekeeping has no "reservations" module — cannot list reservations (module guard).
        r = requests.get(f"{BASE_URL}/api/reservations", headers={"Authorization": f"Bearer {housekeeping_token}"})
        assert r.status_code == 403

        res = requests.get(f"{BASE_URL}/api/reservations", headers={"Authorization": f"Bearer {admin_token}"}).json()
        if res:
            r2 = requests.patch(
                f"{BASE_URL}/api/reservations/{res[0]['id']}/checkin",
                headers={"Authorization": f"Bearer {housekeeping_token}"},
            )
            assert r2.status_code == 403
            print("PASS: Housekeeping forbidden from checkin")


class TestTasks:
    """Task tests"""

    def test_get_tasks(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/tasks", headers={"Authorization": f"Bearer {admin_token}"})
        assert r.status_code == 200
        assert len(r.json()) >= 3
        print(f"PASS: Got {len(r.json())} tasks")

    def test_create_and_update_task(self, admin_token):
        headers = {"Authorization": f"Bearer {admin_token}"}
        payload = {"title": "TEST_Task", "priority": "low", "category": "general"}
        r = requests.post(f"{BASE_URL}/api/tasks", json=payload, headers=headers)
        assert r.status_code == 200
        task = r.json()
        assert task["title"] == "TEST_Task"
        # Update status
        r2 = requests.patch(f"{BASE_URL}/api/tasks/{task['id']}/status",
                            json={"status": "completed"}, headers=headers)
        assert r2.status_code == 200
        assert r2.json()["status"] == "completed"
        # Delete
        requests.delete(f"{BASE_URL}/api/tasks/{task['id']}", headers=headers)
        print("PASS: Task create/update/delete OK")


class TestMessages:
    """Message tests"""

    def test_get_messages(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/messages", headers={"Authorization": f"Bearer {admin_token}"})
        assert r.status_code == 200
        print(f"PASS: Got {len(r.json())} messages")

    def test_unread_count(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/messages/unread-count", headers={"Authorization": f"Bearer {admin_token}"})
        assert r.status_code == 200
        assert "count" in r.json()
        print("PASS: Unread count OK")


class TestReports:
    """Reports tests"""

    def test_dashboard_stats(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/reports/dashboard", headers={"Authorization": f"Bearer {admin_token}"})
        assert r.status_code == 200
        data = r.json()
        assert "total_rooms" in data
        assert "occupied_rooms" in data
        assert "available_rooms" in data
        assert "today_checkins" in data
        assert "pending_tasks" in data
        print(f"PASS: Dashboard stats OK - {data}")

    def test_occupancy_report(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/reports/occupancy", headers={"Authorization": f"Bearer {admin_token}"})
        assert r.status_code == 200
        data = r.json()
        assert "monthly" in data
        assert "room_types" in data
        print("PASS: Occupancy report OK")


class TestStaff:
    """Staff management tests"""

    def test_get_users_admin(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/users", headers={"Authorization": f"Bearer {admin_token}"})
        assert r.status_code == 200
        assert len(r.json()) >= 4
        print(f"PASS: Got {len(r.json())} users")

    def test_create_user_admin_only(self, admin_token, receptionist_token):
        # Admin can create
        headers = {"Authorization": f"Bearer {admin_token}"}
        payload = {"name": "TEST_Staff", "email": "test_staff_xyz@hotel.com",
                   "password": "test123", "role": "housekeeping"}
        r = requests.post(f"{BASE_URL}/api/users", json=payload, headers=headers)
        assert r.status_code == 200
        user = r.json()
        # Receptionist cannot create
        headers2 = {"Authorization": f"Bearer {receptionist_token}"}
        r2 = requests.post(f"{BASE_URL}/api/users", json={"name": "X", "email": "x2@x.com",
                           "password": "x", "role": "housekeeping"}, headers=headers2)
        assert r2.status_code == 403
        # Cleanup
        requests.delete(f"{BASE_URL}/api/users/{user['id']}", headers=headers)
        print("PASS: Only admin can create users")


# ====================== FIXTURES ======================

@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": "admin@hotel.com", "password": "admin123"})
    if r.status_code != 200:
        pytest.skip("Admin login failed")
    return r.json()["access_token"]

@pytest.fixture(scope="module")
def receptionist_token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": "maria@hotel.com", "password": "recep123"})
    if r.status_code != 200:
        pytest.skip("Receptionist login failed")
    return r.json()["access_token"]

@pytest.fixture(scope="module")
def housekeeping_token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": "carlos@hotel.com", "password": "house123"})
    if r.status_code != 200:
        pytest.skip("Housekeeping login failed")
    return r.json()["access_token"]

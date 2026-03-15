"""Iteration 9: Role/permission tests - Staff roles, hotel_admin restrictions, custom_permissions"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

def get_token(email, password):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, f"Login failed: {r.text}"
    return r.json()["access_token"]

@pytest.fixture(scope="module")
def platform_token():
    return get_token("platform@almasystem.com", "platform123")

@pytest.fixture(scope="module")
def admin_token():
    return get_token("admin@hotel.com", "admin123")

# Track created users for cleanup
created_user_ids = []

class TestRoleHierarchy:
    """Test role-based creation restrictions"""

    def test_platform_admin_can_create_platform_admin(self, platform_token):
        r = requests.post(f"{BASE_URL}/api/users",
            json={"name": "TEST_PA", "email": "test_pa_iter9@test.com", "password": "test123", "role": "platform_admin"},
            headers={"Authorization": f"Bearer {platform_token}"})
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        data = r.json()
        assert data["role"] == "platform_admin"
        created_user_ids.append(data["id"])

    def test_platform_admin_can_create_owner(self, platform_token):
        r = requests.post(f"{BASE_URL}/api/users",
            json={"name": "TEST_Owner", "email": "test_owner_iter9@test.com", "password": "test123", "role": "owner"},
            headers={"Authorization": f"Bearer {platform_token}"})
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        data = r.json()
        assert data["role"] == "owner"
        created_user_ids.append(data["id"])

    def test_hotel_admin_cannot_create_owner(self, admin_token):
        """Hotel admin should get 403 when trying to create owner"""
        r = requests.post(f"{BASE_URL}/api/users",
            json={"name": "TEST_OwnerViaAdmin", "email": "test_owner_via_admin@test.com", "password": "test123", "role": "owner"},
            headers={"Authorization": f"Bearer {admin_token}"})
        assert r.status_code == 403, f"Expected 403 (forbidden), got {r.status_code}: {r.text}"

    def test_hotel_admin_cannot_create_platform_admin(self, admin_token):
        r = requests.post(f"{BASE_URL}/api/users",
            json={"name": "TEST_PA_Via_Admin", "email": "test_pa_via_admin@test.com", "password": "test123", "role": "platform_admin"},
            headers={"Authorization": f"Bearer {admin_token}"})
        assert r.status_code == 403, f"Expected 403, got {r.status_code}: {r.text}"

    def test_hotel_admin_can_create_receptionist(self, admin_token):
        r = requests.post(f"{BASE_URL}/api/users",
            json={"name": "TEST_Receptionist", "email": "test_recept_iter9@test.com", "password": "test123", "role": "receptionist"},
            headers={"Authorization": f"Bearer {admin_token}"})
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        created_user_ids.append(r.json()["id"])


class TestCustomPermissions:
    """Test per-user custom_permissions"""

    def test_create_user_with_custom_permissions(self, platform_token):
        r = requests.post(f"{BASE_URL}/api/users",
            json={
                "name": "TEST_CustomPerms",
                "email": "test_cp_iter9@test.com",
                "password": "test123",
                "role": "admin",
                "custom_permissions": ["dashboard", "reservations", "rooms"]
            },
            headers={"Authorization": f"Bearer {platform_token}"})
        assert r.status_code == 200, f"{r.status_code}: {r.text}"
        data = r.json()
        assert data.get("custom_permissions") == ["dashboard", "reservations", "rooms"]
        created_user_ids.append(data["id"])

    def test_update_user_custom_permissions(self, platform_token):
        # Create user first
        r = requests.post(f"{BASE_URL}/api/users",
            json={"name": "TEST_UpdateCP", "email": "test_updatecp_iter9@test.com", "password": "test123", "role": "admin"},
            headers={"Authorization": f"Bearer {platform_token}"})
        assert r.status_code == 200
        uid = r.json()["id"]
        created_user_ids.append(uid)

        # Update with custom_permissions
        r2 = requests.put(f"{BASE_URL}/api/users/{uid}",
            json={"custom_permissions": ["dashboard", "tasks"]},
            headers={"Authorization": f"Bearer {platform_token}"})
        assert r2.status_code == 200, f"{r2.status_code}: {r2.text}"
        data = r2.json()
        assert data.get("custom_permissions") == ["dashboard", "tasks"]

    def test_update_user_reset_custom_permissions(self, platform_token):
        # Create user with custom_permissions
        r = requests.post(f"{BASE_URL}/api/users",
            json={"name": "TEST_ResetCP", "email": "test_resetcp_iter9@test.com", "password": "test123",
                  "role": "admin", "custom_permissions": ["dashboard"]},
            headers={"Authorization": f"Bearer {platform_token}"})
        assert r.status_code == 200
        uid = r.json()["id"]
        created_user_ids.append(uid)

        # Reset to null
        r2 = requests.put(f"{BASE_URL}/api/users/{uid}",
            json={"custom_permissions": None},
            headers={"Authorization": f"Bearer {platform_token}"})
        assert r2.status_code == 200
        data = r2.json()
        assert data.get("custom_permissions") is None


@pytest.fixture(scope="module", autouse=True)
def cleanup(platform_token):
    yield
    for uid in created_user_ids:
        requests.delete(f"{BASE_URL}/api/users/{uid}",
            headers={"Authorization": f"Bearer {platform_token}"})
    print(f"Cleaned up {len(created_user_ids)} test users")

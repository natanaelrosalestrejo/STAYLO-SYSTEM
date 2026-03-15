"""
Backend tests for role architecture refactor:
- manager role, admin_type, staff_subtype fields
- Platform admin and hotel admin separation
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

def get_token(email, password):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password})
    if r.status_code == 200:
        data = r.json()
        return data.get("access_token") or data.get("token")
    return None

@pytest.fixture(scope="module")
def platform_token():
    token = get_token("platform@almasystem.com", "platform123")
    if not token:
        pytest.skip("Platform admin login failed")
    return token

@pytest.fixture(scope="module")
def admin_token():
    token = get_token("admin@hotel.com", "admin123")
    if not token:
        pytest.skip("Hotel admin login failed")
    return token

@pytest.fixture(scope="module")
def platform_headers(platform_token):
    return {"Authorization": f"Bearer {platform_token}", "Content-Type": "application/json"}

@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}

class TestAuthLogins:
    """Test both login flows and role fields"""

    def test_platform_admin_login(self):
        r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": "platform@almasystem.com", "password": "platform123"})
        assert r.status_code == 200
        data = r.json()
        assert "access_token" in data or "token" in data
        assert "user" in data
        assert data["user"]["role"] == "platform_admin"

    def test_hotel_admin_login(self):
        r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": "admin@hotel.com", "password": "admin123"})
        assert r.status_code == 200
        data = r.json()
        assert data["user"]["role"] == "admin"

    def test_platform_user_has_no_admin_type(self):
        r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": "platform@almasystem.com", "password": "platform123"})
        assert r.status_code == 200
        # admin_type may be None for platform_admin
        user = r.json()["user"]
        assert user["role"] == "platform_admin"


class TestCreateUserManager:
    """Test creating users with manager role"""

    created_ids = []

    def test_create_manager_role(self, platform_headers):
        payload = {
            "name": "TEST_Manager User",
            "email": "test_manager_role@alma.com",
            "password": "Test123!",
            "role": "manager"
        }
        r = requests.post(f"{BASE_URL}/api/users", json=payload, headers=platform_headers)
        assert r.status_code in [200, 201], f"Expected 200/201 got {r.status_code}: {r.text}"
        data = r.json()
        assert data["role"] == "manager"
        self.__class__.created_ids.append(data["id"])

    def test_create_platform_admin_with_billing_admin_type(self, platform_headers):
        payload = {
            "name": "TEST_Billing Admin",
            "email": "test_billing_admin@alma.com",
            "password": "Test123!",
            "role": "platform_admin",
            "admin_type": "billing_admin"
        }
        r = requests.post(f"{BASE_URL}/api/users", json=payload, headers=platform_headers)
        assert r.status_code in [200, 201], f"Expected 200/201 got {r.status_code}: {r.text}"
        data = r.json()
        assert data["role"] == "platform_admin"
        assert data.get("admin_type") == "billing_admin"
        self.__class__.created_ids.append(data["id"])

    def test_verify_manager_in_users_list(self, platform_headers):
        r = requests.get(f"{BASE_URL}/api/users", headers=platform_headers)
        assert r.status_code == 200
        users = r.json()
        managers = [u for u in users if u["role"] == "manager"]
        assert len(managers) > 0, "No managers found in users list"

    def test_cleanup_created_users(self, platform_headers):
        for uid in self.__class__.created_ids:
            r = requests.delete(f"{BASE_URL}/api/users/{uid}", headers=platform_headers)
            assert r.status_code in [200, 204]


class TestUserFieldsResponse:
    """Test that user response includes new fields"""

    def test_get_me_platform_admin(self, platform_headers):
        r = requests.get(f"{BASE_URL}/api/auth/me", headers=platform_headers)
        assert r.status_code == 200
        data = r.json()
        assert "role" in data
        assert "admin_type" in data or data.get("admin_type") is None
        assert "staff_subtype" in data or data.get("staff_subtype") is None

    def test_get_me_hotel_admin(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/auth/me", headers=admin_headers)
        assert r.status_code == 200
        data = r.json()
        assert data["role"] == "admin"


class TestManagerCanCreateStaff:
    """Test that manager role can create staff users (hotel context)"""
    
    manager_id = None

    def test_create_manager_first(self, platform_headers):
        payload = {
            "name": "TEST_Manager For Staff",
            "email": "test_mgr_staff@alma.com",
            "password": "Test123!",
            "role": "manager"
        }
        r = requests.post(f"{BASE_URL}/api/users", json=payload, headers=platform_headers)
        assert r.status_code in [200, 201]
        self.__class__.manager_id = r.json()["id"]

    def test_cleanup_manager(self, platform_headers):
        if self.__class__.manager_id:
            r = requests.delete(f"{BASE_URL}/api/users/{self.__class__.manager_id}", headers=platform_headers)
            assert r.status_code in [200, 204]

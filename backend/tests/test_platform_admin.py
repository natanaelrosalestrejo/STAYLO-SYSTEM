"""Platform Admin SaaS endpoints test suite"""
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
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": "admin@hotel.com", "password": "admin123"})
    assert r.status_code == 200, f"Admin login failed: {r.text}"
    return r.json()["access_token"]

@pytest.fixture(scope="module")
def platform_client(platform_token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {platform_token}"})
    return s

@pytest.fixture(scope="module")
def admin_client(admin_token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {admin_token}"})
    return s

# ── Auth & Security ──────────────────────────────────────────────

class TestAuthSecurity:
    def test_platform_login_success(self):
        r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": "platform@almasystem.com", "password": "platform123"})
        assert r.status_code == 200
        data = r.json()
        assert "access_token" in data
        assert data["user"]["role"] == "platform_admin"
        print("PASS: platform_admin login OK, role=platform_admin")

    def test_platform_stats_requires_platform_admin(self, platform_client):
        r = platform_client.get(f"{BASE_URL}/api/platform/stats")
        assert r.status_code == 200
        data = r.json()
        assert "tenants" in data
        assert "properties" in data
        print(f"PASS: /api/platform/stats returns stats: {data}")

    def test_admin_cannot_access_platform_stats(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/platform/stats")
        assert r.status_code == 403, f"Expected 403 but got {r.status_code}"
        print("PASS: hotel admin gets 403 on /api/platform/stats")

    def test_unauthenticated_cannot_access_platform_stats(self):
        r = requests.get(f"{BASE_URL}/api/platform/stats")
        assert r.status_code in [401, 403]
        print("PASS: unauthenticated gets 401/403 on /api/platform/stats")

# ── Tenants CRUD ─────────────────────────────────────────────────

class TestTenantsCRUD:
    created_id = None

    def test_list_tenants(self, platform_client):
        r = platform_client.get(f"{BASE_URL}/api/tenants")
        assert r.status_code == 200
        assert isinstance(r.json(), list)
        print(f"PASS: list tenants, count={len(r.json())}")

    def test_create_tenant(self, platform_client):
        r = platform_client.post(f"{BASE_URL}/api/tenants", json={
            "name": "TEST_Test Corp", "plan": "premium",
            "contact_email": "test@corp.com", "status": "active"
        })
        assert r.status_code == 200
        data = r.json()
        assert data["name"] == "TEST_Test Corp"
        TestTenantsCRUD.created_id = data["id"]
        print(f"PASS: tenant created id={data['id']}")

    def test_get_created_tenant(self, platform_client):
        assert TestTenantsCRUD.created_id
        r = platform_client.get(f"{BASE_URL}/api/tenants/{TestTenantsCRUD.created_id}")
        assert r.status_code == 200
        assert r.json()["name"] == "TEST_Test Corp"
        print("PASS: get tenant by id OK")

    def test_update_tenant_plan(self, platform_client):
        assert TestTenantsCRUD.created_id
        r = platform_client.patch(f"{BASE_URL}/api/tenants/{TestTenantsCRUD.created_id}", json={"plan": "enterprise"})
        assert r.status_code == 200
        assert r.json()["plan"] == "enterprise"
        print("PASS: tenant plan updated to enterprise")

    def test_admin_cannot_create_tenant(self, admin_client):
        r = admin_client.post(f"{BASE_URL}/api/tenants", json={"name": "Hack Corp", "plan": "standard"})
        assert r.status_code == 403
        print("PASS: admin gets 403 creating tenant")

# ── Room Types ────────────────────────────────────────────────────

class TestRoomTypes:
    created_id = None

    def test_list_room_types(self, platform_client):
        r = platform_client.get(f"{BASE_URL}/api/room-types")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        print(f"PASS: room types count={len(data)}, names={[rt['name'] for rt in data]}")

    def test_create_room_type(self, platform_client):
        r = platform_client.post(f"{BASE_URL}/api/room-types", json={
            "name": "TEST_Suite Presidencial", "base_price": 5000,
            "capacity": 4, "amenities": [], "images": []
        })
        assert r.status_code == 200
        data = r.json()
        assert data["name"] == "TEST_Suite Presidencial"
        TestRoomTypes.created_id = data["id"]
        print(f"PASS: room type created id={data['id']}")

    def test_delete_room_type(self, platform_client):
        assert TestRoomTypes.created_id
        r = platform_client.delete(f"{BASE_URL}/api/room-types/{TestRoomTypes.created_id}")
        assert r.status_code == 200
        print("PASS: room type deleted")

# ── Amenities ─────────────────────────────────────────────────────

class TestAmenities:
    created_id = None

    def test_list_amenities(self, platform_client):
        r = platform_client.get(f"{BASE_URL}/api/amenities")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        print(f"PASS: amenities count={len(data)}")

    def test_create_amenity(self, platform_client):
        r = platform_client.post(f"{BASE_URL}/api/amenities", json={
            "name": "TEST_Piscina Infinita", "category": "service", "icon": "🏊"
        })
        assert r.status_code == 200
        data = r.json()
        assert data["name"] == "TEST_Piscina Infinita"
        TestAmenities.created_id = data["id"]
        print(f"PASS: amenity created id={data['id']}")

    def test_delete_amenity(self, platform_client):
        assert TestAmenities.created_id
        r = platform_client.delete(f"{BASE_URL}/api/amenities/{TestAmenities.created_id}")
        assert r.status_code == 200
        print("PASS: amenity deleted")

# ── Properties Feature Toggles ────────────────────────────────────

class TestPropertyFeatures:
    def test_list_properties(self, platform_client):
        r = platform_client.get(f"{BASE_URL}/api/properties")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        print(f"PASS: properties count={len(data)}")

    def test_patch_property_features(self, platform_client):
        r = platform_client.get(f"{BASE_URL}/api/properties")
        props = r.json()
        if not props:
            pytest.skip("No properties to test")
        prop_id = props[0]["id"]
        r2 = platform_client.patch(f"{BASE_URL}/api/properties/{prop_id}/features",
            json={"features": {"inbox": True, "tasks": True, "reports": False, "online_booking": True,
                               "public_catalog": True, "payments": False, "analytics_dashboard": False}})
        assert r2.status_code == 200
        print(f"PASS: property features patched for {prop_id}")

# ── Platform Onboarding ───────────────────────────────────────────

class TestPlatformOnboarding:
    def test_onboard_hotel(self, platform_client):
        r = platform_client.post(f"{BASE_URL}/api/platform/onboard", json={
            "property_type": "hotel", "name": "TEST_Hotel Onboarding",
            "description": "Test hotel", "address": "Test Address",
            "rooms": [{"number": "T01", "room_type_id": "", "floor": 1}],
            "users": []
        })
        assert r.status_code == 200
        data = r.json()
        assert "property_id" in data or "id" in data or "property" in data
        print(f"PASS: onboarding OK: {data}")

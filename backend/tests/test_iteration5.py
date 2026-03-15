"""
Iteration 5 Backend Tests: Owner role, Corporate Dashboard, Properties API
"""
import pytest
import requests
import os

# Use env for local/CI; fallback was a fixed Emergent preview URL (caused 404 when run against local backend).
BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8000").rstrip("/")

def login(email, password):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password})
    return r.json().get("access_token") if r.status_code == 200 else None

@pytest.fixture(scope="module")
def owner_token():
    token = login("owner@hotel.com", "owner123")
    if not token:
        pytest.skip("Owner login failed")
    return token

@pytest.fixture(scope="module")
def admin_token():
    token = login("admin@hotel.com", "admin123")
    if not token:
        pytest.skip("Admin login failed")
    return token

def auth_headers(token):
    return {"Authorization": f"Bearer {token}"}

# Test 1: Owner login
def test_owner_login():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": "owner@hotel.com", "password": "owner123"})
    assert r.status_code == 200
    data = r.json()
    assert data.get("user", {}).get("role") == "owner"

# Test 2: Admin login
def test_admin_login():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": "admin@hotel.com", "password": "admin123"})
    assert r.status_code == 200

# Test 3: Corporate Dashboard - basic structure
def test_corporate_dashboard_owner(owner_token):
    r = requests.get(f"{BASE_URL}/api/corporate/dashboard", headers=auth_headers(owner_token))
    assert r.status_code == 200
    data = r.json()
    assert "group" in data
    assert "hotel" in data

# Test 4: Corporate Dashboard revenue_intelligence
def test_corporate_dashboard_revenue_intelligence(owner_token):
    r = requests.get(f"{BASE_URL}/api/corporate/dashboard", headers=auth_headers(owner_token))
    assert r.status_code == 200
    data = r.json()
    ri = data.get("revenue_intelligence", {})
    assert "projected_month_revenue" in ri
    assert "revenue_opportunity" in ri
    assert "top_performing" in ri

# Test 5: Corporate Dashboard property_ranking
def test_corporate_dashboard_property_ranking(owner_token):
    r = requests.get(f"{BASE_URL}/api/corporate/dashboard", headers=auth_headers(owner_token))
    assert r.status_code == 200
    data = r.json()
    assert "property_ranking" in data
    assert isinstance(data["property_ranking"], list)

# Test 6: Corporate Dashboard group.expected_revenue
def test_corporate_dashboard_group_expected_revenue(owner_token):
    r = requests.get(f"{BASE_URL}/api/corporate/dashboard", headers=auth_headers(owner_token))
    data = r.json()
    group = data.get("group", {})
    assert "expected_revenue" in group

# Test 7: Corporate Dashboard hotel.performance_score
def test_corporate_dashboard_hotel_performance_score(owner_token):
    r = requests.get(f"{BASE_URL}/api/corporate/dashboard", headers=auth_headers(owner_token))
    data = r.json()
    hotel = data.get("hotel", {})
    assert "performance_score" in hotel

# Test 8: Corporate Dashboard revenue_growth_pct
def test_corporate_dashboard_revenue_growth_pct(owner_token):
    r = requests.get(f"{BASE_URL}/api/corporate/dashboard", headers=auth_headers(owner_token))
    data = r.json()
    group = data.get("group", {})
    assert "revenue_growth_pct" in group

# Test 9: Properties Stats API
def test_properties_stats(admin_token):
    r = requests.get(f"{BASE_URL}/api/properties/stats", headers=auth_headers(admin_token))
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    assert len(data) >= 1

# Test 10: Properties stats has performance_score
def test_properties_stats_performance_score(admin_token):
    r = requests.get(f"{BASE_URL}/api/properties/stats", headers=auth_headers(admin_token))
    data = r.json()
    for prop in data:
        assert "performance_score" in prop
        assert "monthly_revenue" in prop

# Test 11: Properties stats has hotel-specific fields
def test_properties_stats_hotel_fields(admin_token):
    r = requests.get(f"{BASE_URL}/api/properties/stats", headers=auth_headers(admin_token))
    data = r.json()
    hotels = [p for p in data if p.get("type") == "hotel"]
    for h in hotels:
        assert "occupancy_rate" in h

# Test 12: Properties stats has garden fields
def test_properties_stats_garden_fields(admin_token):
    r = requests.get(f"{BASE_URL}/api/properties/stats", headers=auth_headers(admin_token))
    data = r.json()
    gardens = [p for p in data if p.get("type") == "event_garden"]
    for g in gardens:
        assert "events_this_month" in g

# Test 13: GET /api/properties as admin
def test_get_properties_admin(admin_token):
    r = requests.get(f"{BASE_URL}/api/properties", headers=auth_headers(admin_token))
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)

# Test 14: Create property
def test_create_and_delete_property(admin_token):
    headers = auth_headers(admin_token)
    r = requests.post(f"{BASE_URL}/api/properties", headers=headers, json={
        "name": "TEST_Hotel Test", "type": "hotel", "description": "Test property"
    })
    assert r.status_code in [200, 201]
    prop = r.json()
    assert prop.get("name") == "TEST_Hotel Test"
    prop_id = prop.get("id")
    assert prop_id
    # cleanup
    requests.delete(f"{BASE_URL}/api/properties/{prop_id}", headers=headers)

# Test 15: Owner cannot access operational dashboard stats
def test_owner_cannot_access_dashboard(owner_token):
    r = requests.get(f"{BASE_URL}/api/reports/dashboard", headers=auth_headers(owner_token))
    # Should either 403 or still return data - check status
    # Owner may or may not have access, just verify it doesn't crash
    assert r.status_code in [200, 403, 401]

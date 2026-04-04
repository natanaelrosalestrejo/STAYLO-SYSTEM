"""
Module guard behavior (auth.ensure_user_has_module / require_module path).
Uses asyncio.run to avoid pytest-asyncio dependency.
"""
import asyncio
import os
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest
import requests
from fastapi import HTTPException

from auth import ensure_user_has_any_module, ensure_user_has_module
from models import UserModel


def _user(**kw):
    base = {
        "id": "u1",
        "name": "N",
        "email": "e@test.com",
        "password_hash": "x",
        "role": "receptionist",
        "is_active": True,
        "avatar_color": "#fff",
        "created_at": "2020-01-01T00:00:00+00:00",
        "tenant_id": "t1",
    }
    base.update(kw)
    return UserModel(**base)


def test_auth_router_login_and_me_use_same_resolver():
    """Phase A: both endpoints must attach modules via resolve_effective_modules_for_user."""
    auth_py = Path(__file__).resolve().parent.parent / "routers" / "auth.py"
    text = auth_py.read_text(encoding="utf-8")
    assert "resolve_effective_modules_for_user" in text
    assert 'user_payload["modules"]' in text
    assert 'payload["modules"]' in text
    assert text.count("resolve_effective_modules_for_user") >= 2


def test_ensure_module_allows_when_present():
    async def run():
        with patch("auth.resolve_effective_modules_for_user", new_callable=AsyncMock) as m:
            m.return_value = ["inbox", "dashboard"]
            await ensure_user_has_module(_user(), "inbox")
            m.assert_awaited_once()

    asyncio.run(run())


def test_ensure_module_denies_when_missing():
    async def run():
        with patch("auth.resolve_effective_modules_for_user", new_callable=AsyncMock) as m:
            m.return_value = ["dashboard"]
            with pytest.raises(HTTPException) as ei:
                await ensure_user_has_module(_user(), "inbox")
            assert ei.value.status_code == 403
            assert "inbox" in ei.value.detail

    asyncio.run(run())


def test_platform_admin_skips_resolver_for_module_guard():
    async def run():
        with patch("auth.resolve_effective_modules_for_user", new_callable=AsyncMock) as m:
            await ensure_user_has_module(_user(role="platform_admin"), "inbox")
            m.assert_not_called()

    asyncio.run(run())


def test_ensure_any_module_allows_one_of():
    async def run():
        with patch("auth.resolve_effective_modules_for_user", new_callable=AsyncMock) as m:
            m.return_value = ["garden_lodging_integration"]
            await ensure_user_has_any_module(_user(role="garden_admin"), "jardines", "garden_lodging_integration")

    asyncio.run(run())


def test_ensure_any_module_denies_when_none_match():
    async def run():
        with patch("auth.resolve_effective_modules_for_user", new_callable=AsyncMock) as m:
            m.return_value = ["dashboard"]
            with pytest.raises(HTTPException) as ei:
                await ensure_user_has_any_module(_user(role="admin"), "jardines", "garden_lodging_integration")
            assert ei.value.status_code == 403

    asyncio.run(run())


def test_tenant_disabled_module_denies_reports():
    """Effective list without 'reports' must not pass reports guard."""

    async def run():
        with patch("auth.resolve_effective_modules_for_user", new_callable=AsyncMock) as m:
            m.return_value = ["dashboard", "rooms", "guests"]
            with pytest.raises(HTTPException) as ei:
                await ensure_user_has_module(_user(role="manager"), "reports")
            assert ei.value.status_code == 403

    asyncio.run(run())


def test_manager_financial_view_satisfies_reports_guard():
    async def run():
        with patch("auth.resolve_effective_modules_for_user", new_callable=AsyncMock) as m:
            m.return_value = ["dashboard", "manager_financial_view"]
            await ensure_user_has_module(_user(role="manager"), "reports")

    asyncio.run(run())


def test_reservations_module_denied_when_not_in_effective_list():
    async def run():
        with patch("auth.resolve_effective_modules_for_user", new_callable=AsyncMock) as m:
            m.return_value = ["guests", "dashboard"]
            with pytest.raises(HTTPException) as ei:
                await ensure_user_has_module(_user(role="receptionist"), "reservations")
            assert ei.value.status_code == 403
            assert "reservations" in ei.value.detail

    asyncio.run(run())


def test_guests_module_allowed_for_typical_receptionist_slice():
    async def run():
        with patch("auth.resolve_effective_modules_for_user", new_callable=AsyncMock) as m:
            m.return_value = ["guests", "reservations"]
            await ensure_user_has_module(_user(), "guests")

    asyncio.run(run())


def test_event_context_any_module_accepts_jardines_or_hotel_events():
    async def run():
        with patch("auth.resolve_effective_modules_for_user", new_callable=AsyncMock) as m:
            m.return_value = ["jardines", "dashboard"]
            await ensure_user_has_any_module(_user(role="admin"), "jardines", "hotel-events")
        with patch("auth.resolve_effective_modules_for_user", new_callable=AsyncMock) as m:
            m.return_value = ["hotel-events"]
            await ensure_user_has_any_module(_user(role="admin"), "jardines", "hotel-events")

    asyncio.run(run())


def test_event_context_any_module_denies_when_neither_present():
    async def run():
        with patch("auth.resolve_effective_modules_for_user", new_callable=AsyncMock) as m:
            m.return_value = ["dashboard", "catalog"]
            with pytest.raises(HTTPException):
                await ensure_user_has_any_module(_user(role="receptionist"), "jardines", "hotel-events")

    asyncio.run(run())


def test_corporate_module_denied_when_absent():
    async def run():
        with patch("auth.resolve_effective_modules_for_user", new_callable=AsyncMock) as m:
            m.return_value = ["hotels", "event-gardens", "reports"]
            with pytest.raises(HTTPException) as ei:
                await ensure_user_has_module(_user(role="owner"), "corporate")
            assert ei.value.status_code == 403
            assert "corporate" in ei.value.detail

    asyncio.run(run())


def test_property_stats_any_module_hotels_suffices():
    """Guard for /properties/stats: any of hotels | event-gardens | corporate."""
    async def run():
        with patch("auth.resolve_effective_modules_for_user", new_callable=AsyncMock) as m:
            m.return_value = ["hotels", "reports"]
            await ensure_user_has_any_module(_user(role="owner"), "hotels", "event-gardens", "corporate")

    asyncio.run(run())


def test_property_stats_denied_when_no_strategic_module():
    async def run():
        with patch("auth.resolve_effective_modules_for_user", new_callable=AsyncMock) as m:
            m.return_value = ["properties", "rooms", "dashboard"]
            with pytest.raises(HTTPException):
                await ensure_user_has_any_module(
                    _user(role="admin"),
                    "hotels",
                    "event-gardens",
                    "corporate",
                )

    asyncio.run(run())


def test_rooms_module_denied_when_absent():
    async def run():
        with patch("auth.resolve_effective_modules_for_user", new_callable=AsyncMock) as m:
            m.return_value = ["guests", "reservations"]
            with pytest.raises(HTTPException) as ei:
                await ensure_user_has_module(_user(role="receptionist"), "rooms")
            assert "rooms" in ei.value.detail

    asyncio.run(run())


def test_staff_module_denied_when_absent():
    async def run():
        with patch("auth.resolve_effective_modules_for_user", new_callable=AsyncMock) as m:
            m.return_value = ["dashboard", "inbox"]
            with pytest.raises(HTTPException) as ei:
                await ensure_user_has_module(_user(role="receptionist"), "staff")
            assert "staff" in ei.value.detail

    asyncio.run(run())


def test_properties_crud_module_denied_without_properties():
    async def run():
        with patch("auth.resolve_effective_modules_for_user", new_callable=AsyncMock) as m:
            m.return_value = ["corporate", "hotels", "reports"]
            with pytest.raises(HTTPException) as ei:
                await ensure_user_has_module(_user(role="owner"), "properties")
            assert "properties" in ei.value.detail

    asyncio.run(run())


BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")


@pytest.mark.skipif(not BASE_URL, reason="REACT_APP_BACKEND_URL not set — integration smoke skipped")
def test_login_and_auth_me_modules_consistent_smoke():
    """Phase C: same resolver must yield the same module list for login vs /auth/me."""
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": "admin@hotel.com", "password": "admin123"},
        timeout=30,
    )
    if r.status_code != 200:
        pytest.skip("admin login not available in this environment")
    login_mod = r.json()["user"]["modules"]
    token = r.json()["access_token"]
    r2 = requests.get(
        f"{BASE_URL}/api/auth/me",
        headers={"Authorization": f"Bearer {token}"},
        timeout=30,
    )
    assert r2.status_code == 200
    assert r2.json()["modules"] == login_mod

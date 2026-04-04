"""Unit tests for report property scope helpers and auth.allowed_property_ids_for_reports."""
import asyncio
from unittest.mock import AsyncMock, patch

from auth import _allowed_property_ids, allowed_property_ids_for_reports, assigned_property_ids_for_user
from models import UserModel
from services.reports_scope import reservation_property_match, room_property_match


def _user(**kwargs) -> UserModel:
    base = {
        "id": "u1",
        "name": "Test",
        "email": "t@test.com",
        "password_hash": "x",
        "role": "owner",
        "tenant_id": None,
        "property_id": None,
    }
    base.update(kwargs)
    return UserModel(**base)


def test_reservation_property_match_unscoped():
    assert reservation_property_match(None) == {}


def test_reservation_property_match_scoped():
    assert reservation_property_match(["p1", "p2"]) == {"property_id": {"$in": ["p1", "p2"]}}


def test_room_property_match_scoped():
    assert room_property_match(["a"]) == {"property_id": {"$in": ["a"]}}


def test_assigned_property_ids_priority_list_over_single():
    u = _user(role="manager", property_id="legacy", property_ids=["b", "c"])
    assert assigned_property_ids_for_user(u) == ["b", "c"]


def test_assigned_property_ids_fallback_single():
    u = _user(role="finance", property_id="only", property_ids=None)
    assert assigned_property_ids_for_user(u) == ["only"]


def test_assigned_property_ids_strips_and_dedupes():
    u = _user(role="manager", property_ids=[" x ", "x", "y"])
    assert assigned_property_ids_for_user(u) == ["x", "y"]


def test_allowed_property_ids_platform_admin_unrestricted():
    u = _user(role="platform_admin")
    assert asyncio.run(allowed_property_ids_for_reports(u)) is None


def test_allowed_property_ids_manager_without_property_is_empty():
    u = _user(role="manager", tenant_id="tenant-1", property_id=None)
    assert asyncio.run(allowed_property_ids_for_reports(u)) == []


def test_allowed_property_ids_finance_single_property():
    u = _user(role="finance", tenant_id="tenant-1", property_id="prop-a")
    assert asyncio.run(allowed_property_ids_for_reports(u)) == ["prop-a"]


def test_allowed_property_ids_finance_multi_property_ids():
    u = _user(
        role="finance",
        tenant_id="tenant-1",
        property_id="ignored-when-list-set",
        property_ids=["p1", "p2"],
    )
    assert asyncio.run(allowed_property_ids_for_reports(u)) == ["p1", "p2"]


def test_allowed_property_ids_manager_never_tenant_wide_without_assignment():
    u = _user(role="manager", tenant_id="tenant-1", property_id=None, property_ids=None)
    assert asyncio.run(allowed_property_ids_for_reports(u)) == []


def test_allowed_property_ids_owner_uses_allowed_property_ids_for_tenant_wide():
    """Owner/admin reports scope delegates to _allowed_property_ids (tenant property list)."""
    u = _user(role="owner", tenant_id="tenant-1", property_id=None)
    with patch("auth._allowed_property_ids", new_callable=AsyncMock, return_value=["p1", "p2"]):
        got = asyncio.run(allowed_property_ids_for_reports(u))
    assert sorted(got or []) == ["p1", "p2"]


def test_allowed_property_ids_admin_uses_single_property_when_set():
    u = _user(role="admin", tenant_id="tenant-1", property_id="only-hotel")
    assert asyncio.run(allowed_property_ids_for_reports(u)) == ["only-hotel"]


def test_owner_uses_property_ids_subset_without_tenant_wide_expand():
    u = _user(role="owner", tenant_id="tenant-1", property_ids=["alpha", "beta"])
    got = asyncio.run(_allowed_property_ids(u))
    assert got == ["alpha", "beta"]

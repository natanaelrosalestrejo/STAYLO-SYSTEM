"""Call report handler functions directly with an empty property scope (finance without property_id)."""
import asyncio

from models import UserModel
from routers.reports import dashboard_stats, occupancy_report, revenue_breakdown, revenue_insights


def _finance_no_property():
    return UserModel(
        id="f1",
        name="Finance User",
        email="fin@test.com",
        password_hash="x",
        role="finance",
        tenant_id="tenant-1",
        property_id=None,
    )


def test_finance_without_property_gets_empty_dashboard():
    out = asyncio.run(dashboard_stats(current_user=_finance_no_property()))
    assert out["total_rooms"] == 0
    assert out["total_revenue"] == 0
    assert out["pending_tasks"] == 0
    assert out["total_guests"] == 0


def test_finance_without_property_gets_empty_occupancy():
    out = asyncio.run(occupancy_report(current_user=_finance_no_property()))
    assert out["monthly"] == []
    assert out["room_types"] == []
    assert out["room_statuses"] == []


def test_finance_without_property_gets_empty_insights():
    out = asyncio.run(revenue_insights(current_user=_finance_no_property()))
    assert out["month_revenue"] == 0
    assert out["source_breakdown"] == []


def test_finance_without_property_gets_empty_revenue_breakdown():
    out = asyncio.run(revenue_breakdown(current_user=_finance_no_property()))
    assert out["total_revenue"] == 0
    assert out["events_breakdown"] == []

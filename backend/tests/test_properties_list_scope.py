"""GET /properties list is filtered by _allowed_property_ids (no 'properties' module required)."""
import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

from models import UserModel
from server import list_properties


def _manager_multi():
    return UserModel(
        id="u1",
        name="M",
        email="m@test.com",
        password_hash="x",
        role="manager",
        tenant_id="tenant-1",
        property_id=None,
        property_ids=["alma_hotel", "garden_margati"],
    )


def test_list_properties_scopes_manager_to_assigned():
    async def fake_find(*args, **kwargs):
        m = MagicMock()
        m.to_list = AsyncMock(
            return_value=[
                {"id": "alma_hotel", "name": "Hotel"},
                {"id": "garden_margati", "name": "G"},
                {"id": "other", "name": "X"},
            ]
        )
        return m

    with patch("server.db.properties.find", side_effect=fake_find):
        out = asyncio.run(list_properties(current_user=_manager_multi()))
    assert {p["id"] for p in out} == {"alma_hotel", "garden_margati"}

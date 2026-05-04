import secrets
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends

from auth import hash_password, require_role
from db import db
from models import EventSpaceModel, PropertyModel, UserModel

router = APIRouter()


@router.post("/platform/onboard")
async def onboard_property(data: dict, current_user: UserModel = Depends(require_role("platform_admin"))):
    """Full property onboarding wizard — creates property, rooms/spaces, and team accounts."""
    property_type = data.get("property_type", "hotel")
    name = data.get("name", "Nueva Propiedad")
    tenant_id = data.get("tenant_id")

    prop = PropertyModel(
        name=name,
        type=property_type,
        status="active",
        description=data.get("description"),
        address=data.get("address"),
        tenant_id=tenant_id,
    )
    await db.properties.insert_one(prop.model_dump())

    created_rooms = 0
    created_spaces = 0
    created_users = []

    if property_type == "hotel":
        num_floors = int(data.get("num_floors", 2))
        num_rooms_per_floor = int(data.get("num_rooms_per_floor", 5))
        room_types_config = data.get("room_types_config", [])
        room_number = 101
        for floor in range(1, num_floors + 1):
            for r in range(1, num_rooms_per_floor + 1):
                rt_id = None
                price = 1200.0
                rt_name = "Estándar"
                if room_types_config:
                    rt_conf = room_types_config[(r - 1) % len(room_types_config)]
                    rt_id = rt_conf.get("room_type_id")
                    if rt_id:
                        rt_doc = await db.room_types.find_one({"id": rt_id}, {"_id": 0})
                        if rt_doc:
                            price = rt_doc.get("base_price", price)
                            rt_name = rt_doc.get("name", rt_name)
                room_doc = {
                    "id": str(uuid.uuid4()),
                    "number": str(room_number),
                    "type": rt_name,
                    "floor": floor,
                    "status": "available",
                    "amenities": ["WiFi", "TV", "Baño Privado"],
                    "price_per_night": price,
                    "capacity": 2,
                    "description": f"Habitación {room_number}",
                    "room_type_id": rt_id,
                    "property_id": prop.id,
                    "created_at": datetime.now(timezone.utc).isoformat(),
                }
                await db.rooms.insert_one(room_doc)
                created_rooms += 1
                room_number += 1

    elif property_type == "event_garden":
        for s in data.get("spaces", []):
            space = EventSpaceModel(
                property_id=prop.id,
                space_name=s.get("space_name", "Espacio"),
                capacity=int(s.get("capacity", 100)),
                price_per_event=float(s.get("price_per_event", 10000.0)),
                description=s.get("description"),
                status="available",
            )
            await db.event_spaces.insert_one(space.model_dump())
            created_spaces += 1

    if data.get("owner_email") and data.get("owner_name"):
        if not await db.users.find_one({"email": data["owner_email"]}):
            owner_pwd = secrets.token_urlsafe(12)
            owner_user = UserModel(
                name=data["owner_name"],
                email=data["owner_email"],
                password_hash=hash_password(owner_pwd),
                role="owner",
                department="Dirección",
                avatar_color="#8B5CF6",
                force_password_change=True,
            )
            await db.users.insert_one(owner_user.model_dump())
            created_users.append({"role": "owner", "email": data["owner_email"], "temp_password": owner_pwd})

    if data.get("admin_email") and data.get("admin_name"):
        if not await db.users.find_one({"email": data["admin_email"]}):
            mgr_pwd = secrets.token_urlsafe(12)
            mgr_user = UserModel(
                name=data["admin_name"],
                email=data["admin_email"],
                password_hash=hash_password(mgr_pwd),
                role="manager",
                department="Administración",
                avatar_color="#059669",
                force_password_change=True,
            )
            await db.users.insert_one(mgr_user.model_dump())
            created_users.append({"role": "manager", "email": data["admin_email"], "temp_password": mgr_pwd})

    return {
        "success": True,
        "property_id": prop.id,
        "property_name": prop.name,
        "property_type": property_type,
        "created_rooms": created_rooms,
        "created_spaces": created_spaces,
        "created_users": created_users,
    }

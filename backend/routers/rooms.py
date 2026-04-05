from fastapi import APIRouter, Depends, HTTPException

from auth import require_module, require_role, _allowed_property_ids, _ensure_room_in_scope
from db import db
from models import RoomCreate, RoomModel, RoomUpdate, UserModel

router = APIRouter()


@router.get("/rooms")
async def get_rooms(current_user: UserModel = Depends(require_module("rooms"))):
    allowed = await _allowed_property_ids(current_user)
    if allowed is None:
        q = {}
    elif not allowed:
        q = {"id": "__none__"}
    else:
        q = {"property_id": {"$in": allowed}}
    return await db.rooms.find(q, {"_id": 0}).to_list(1000)


@router.post("/rooms")
async def create_room(data: RoomCreate, current_user: UserModel = Depends(require_module("rooms"))):
    allowed = await _allowed_property_ids(current_user)
    if allowed is not None and not allowed:
        raise HTTPException(status_code=403, detail="No tiene permiso para crear habitaciones en ninguna propiedad")
    if await db.rooms.find_one({"number": data.number}):
        raise HTTPException(status_code=400, detail="Número de habitación ya existe")
    room = RoomModel(**data.model_dump())
    room_doc = room.model_dump()
    if allowed is not None:
        room_doc["property_id"] = current_user.property_id or allowed[0]
    await db.rooms.insert_one(room_doc)
    room_doc.pop("_id", None)  # PyMongo adds _id in place; remove so response is JSON-serializable
    return room_doc


@router.put("/rooms/{room_id}")
async def update_room(
    room_id: str, data: RoomUpdate, current_user: UserModel = Depends(require_module("rooms"))
):
    room = await db.rooms.find_one({"id": room_id}, {"_id": 0})
    if not room:
        raise HTTPException(status_code=404, detail="Habitación no encontrada")
    await _ensure_room_in_scope(room, current_user)
    update_dict = {k: v for k, v in data.model_dump().items() if v is not None}
    result = await db.rooms.find_one_and_update({"id": room_id}, {"$set": update_dict}, return_document=True)
    if not result:
        raise HTTPException(status_code=404, detail="Habitación no encontrada")
    result.pop("_id", None)
    return result


@router.patch("/rooms/{room_id}/status")
async def update_room_status(
    room_id: str, data: dict, current_user: UserModel = Depends(require_module("rooms"))
):
    room = await db.rooms.find_one({"id": room_id}, {"_id": 0})
    if not room:
        raise HTTPException(status_code=404, detail="Habitación no encontrada")
    await _ensure_room_in_scope(room, current_user)
    result = await db.rooms.find_one_and_update(
        {"id": room_id}, {"$set": {"status": data.get("status")}}, return_document=True
    )
    if not result:
        raise HTTPException(status_code=404, detail="Habitación no encontrada")
    result.pop("_id", None)
    return result


@router.delete("/rooms/{room_id}")
async def delete_room(
    room_id: str,
    _: UserModel = Depends(require_module("rooms")),
    current_user: UserModel = Depends(require_role("manager", "platform_admin")),
):
    room = await db.rooms.find_one({"id": room_id}, {"_id": 0})
    if not room:
        raise HTTPException(status_code=404, detail="Habitación no encontrada")
    await _ensure_room_in_scope(room, current_user)
    active = await db.reservations.count_documents(
        {"room_id": room_id, "status": {"$in": ["confirmed", "checked_in"]}}
    )
    if active > 0:
        raise HTTPException(status_code=400, detail="No se puede eliminar: habitación con reservas activas")
    await db.rooms.delete_one({"id": room_id})
    return {"deleted": True}


from fastapi import APIRouter, Depends, HTTPException

from auth import get_current_user, require_role
from db import db
from models import RoomTypeCreate, RoomTypeModel, UserModel

router = APIRouter()


@router.get("/room-types")
async def list_room_types(current_user: UserModel = Depends(get_current_user)):
    return await db.room_types.find({}, {"_id": 0}).to_list(100)


@router.post("/room-types")
async def create_room_type(data: RoomTypeCreate, current_user: UserModel = Depends(require_role("platform_admin", "manager"))):
    rt = RoomTypeModel(**data.model_dump())
    await db.room_types.insert_one(rt.model_dump())
    return rt.model_dump()


@router.patch("/room-types/{rt_id}")
async def update_room_type(rt_id: str, data: dict, current_user: UserModel = Depends(require_role("platform_admin", "manager"))):
    await db.room_types.update_one({"id": rt_id}, {"$set": data})
    rt = await db.room_types.find_one({"id": rt_id}, {"_id": 0})
    if not rt:
        raise HTTPException(status_code=404, detail="Tipo de habitación no encontrado")
    return rt


@router.delete("/room-types/{rt_id}")
async def delete_room_type(rt_id: str, current_user: UserModel = Depends(require_role("platform_admin", "manager"))):
    await db.room_types.delete_one({"id": rt_id})
    return {"deleted": True}

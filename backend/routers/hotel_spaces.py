from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

from auth import require_module, require_role
from db import db
from models import HotelSpaceCreate, HotelSpaceModel, UserModel

router = APIRouter()


@router.get("/hotel-spaces")
async def list_hotel_spaces(
    property_id: Optional[str] = None,
    current_user: UserModel = Depends(require_module("hotel-events")),
):
    q = {"property_id": property_id} if property_id else {}
    spaces = await db.hotel_spaces.find(q, {"_id": 0}).to_list(100)
    return spaces


@router.post("/hotel-spaces")
async def create_hotel_space(
    data: HotelSpaceCreate,
    _: UserModel = Depends(require_module("hotel-events")),
    current_user: UserModel = Depends(require_role("manager")),
):
    space = HotelSpaceModel(**data.model_dump())
    await db.hotel_spaces.insert_one(space.model_dump())
    return space.model_dump()


@router.patch("/hotel-spaces/{space_id}")
async def update_hotel_space(
    space_id: str,
    data: dict,
    _: UserModel = Depends(require_module("hotel-events")),
    current_user: UserModel = Depends(require_role("manager")),
):
    await db.hotel_spaces.update_one({"id": space_id}, {"$set": data})
    s = await db.hotel_spaces.find_one({"id": space_id}, {"_id": 0})
    if not s:
        raise HTTPException(status_code=404, detail="Espacio no encontrado")
    return s


@router.delete("/hotel-spaces/{space_id}")
async def delete_hotel_space(
    space_id: str,
    _: UserModel = Depends(require_module("hotel-events")),
    current_user: UserModel = Depends(require_role("manager")),
):
    await db.hotel_spaces.delete_one({"id": space_id})
    return {"deleted": True}

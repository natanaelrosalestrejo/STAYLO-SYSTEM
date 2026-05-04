from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

from auth import require_module, require_role
from db import db
from models import EventSpaceCreate, EventSpaceModel, UserModel

router = APIRouter()


@router.get("/event-spaces")
async def list_event_spaces(
    property_id: Optional[str] = None,
    current_user: UserModel = Depends(require_module("jardines")),
):
    q = {"property_id": property_id} if property_id else {}
    spaces = await db.event_spaces.find(q, {"_id": 0}).to_list(100)
    return spaces


@router.post("/event-spaces")
async def create_event_space(
    data: EventSpaceCreate,
    _: UserModel = Depends(require_module("jardines")),
    current_user: UserModel = Depends(require_role("manager", "receptionist")),
):
    space = EventSpaceModel(**data.model_dump())
    await db.event_spaces.insert_one(space.model_dump())
    return space.model_dump()


@router.patch("/event-spaces/{space_id}")
async def update_event_space(
    space_id: str,
    data: dict,
    _: UserModel = Depends(require_module("jardines")),
    current_user: UserModel = Depends(require_role("manager", "receptionist")),
):
    await db.event_spaces.update_one({"id": space_id}, {"$set": data})
    s = await db.event_spaces.find_one({"id": space_id}, {"_id": 0})
    if not s:
        raise HTTPException(status_code=404, detail="Espacio no encontrado")
    return s


@router.delete("/event-spaces/{space_id}")
async def delete_event_space(
    space_id: str,
    _: UserModel = Depends(require_module("jardines")),
    current_user: UserModel = Depends(require_role("manager")),
):
    await db.event_spaces.delete_one({"id": space_id})
    return {"deleted": True}

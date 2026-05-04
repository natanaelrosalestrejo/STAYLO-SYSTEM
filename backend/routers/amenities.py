from fastapi import APIRouter, Depends, HTTPException

from auth import get_current_user, require_role
from db import db
from models import AmenityCreate, AmenityModel, UserModel

router = APIRouter()


@router.get("/amenities")
async def list_amenities(current_user: UserModel = Depends(get_current_user)):
    return await db.amenities.find({}, {"_id": 0}).to_list(200)


@router.post("/amenities")
async def create_amenity(data: AmenityCreate, current_user: UserModel = Depends(require_role("platform_admin", "manager"))):
    a = AmenityModel(**data.model_dump())
    if await db.amenities.find_one({"id": a.id}):
        raise HTTPException(status_code=400, detail="Amenidad ya existe")
    await db.amenities.insert_one(a.model_dump())
    return {k: v for k, v in a.model_dump().items() if k != "_id"}


@router.delete("/amenities/{amenity_id}")
async def delete_amenity(amenity_id: str, current_user: UserModel = Depends(require_role("platform_admin"))):
    await db.amenities.delete_one({"id": amenity_id})
    return {"deleted": True}

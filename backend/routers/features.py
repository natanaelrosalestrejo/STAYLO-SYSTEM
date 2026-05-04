from fastapi import APIRouter, Depends, HTTPException

from auth import require_module, require_role
from db import db
from models import UserModel

router = APIRouter()


@router.get("/properties/{prop_id}/features")
async def get_features(prop_id: str, current_user: UserModel = Depends(require_module("properties"))):
    prop = await db.properties.find_one({"id": prop_id}, {"_id": 0, "id": 1, "feature_toggles": 1})
    if prop is None:
        raise HTTPException(status_code=404, detail="Propiedad no encontrada")
    return prop.get(
        "feature_toggles",
        {
            "inbox": True,
            "tasks": True,
            "reports": True,
            "public_catalog": True,
            "online_booking": True,
            "payments": True,
            "analytics_dashboard": True,
        },
    )


@router.patch("/properties/{prop_id}/features")
async def update_features(
    prop_id: str,
    features: dict,
    _: UserModel = Depends(require_module("properties")),
    current_user: UserModel = Depends(require_role("manager", "platform_admin")),
):
    await db.properties.update_one({"id": prop_id}, {"$set": {"feature_toggles": features}})
    return features

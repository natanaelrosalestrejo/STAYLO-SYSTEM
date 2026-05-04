from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from auth import require_role
from db import db
from models import DEFAULT_ROLE_PERMISSIONS, RolePermissionUpdate, UserModel

router = APIRouter()


@router.get("/role-permissions")
async def get_all_role_permissions(current_user: UserModel = Depends(require_role("platform_admin", "manager"))):
    perms = await db.role_permissions.find({}, {"_id": 0}).to_list(20)
    result = dict(DEFAULT_ROLE_PERMISSIONS)
    for p in perms:
        result[p["role"]] = p["modules"]
    return result


@router.put("/role-permissions/{role}")
async def update_role_permissions(
    role: str,
    data: RolePermissionUpdate,
    current_user: UserModel = Depends(require_role("platform_admin")),
):
    if role not in DEFAULT_ROLE_PERMISSIONS:
        raise HTTPException(status_code=400, detail="Rol inválido")
    await db.role_permissions.update_one(
        {"role": role},
        {"$set": {"role": role, "modules": data.modules, "updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
    return {"role": role, "modules": data.modules}

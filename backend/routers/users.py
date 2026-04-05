from typing import Optional
import random

from fastapi import APIRouter, Depends, HTTPException

from auth import hash_password, require_module, require_role
from db import db
from models import UserModel, UserCreate, UserUpdate, UserResponse, DEFAULT_ROLE_PERMISSIONS
from seeds import COLORS

router = APIRouter()

LEGACY_BUSINESS_ADMIN_ROLE = "admin"


# platform_admin may only create strategic tenant roles in this phase (not staff/finance/garden via API).
PLATFORM_ADMIN_CREATABLE = frozenset({"owner", "manager"})
# Manager may only create hotel operational staff (not another manager, not finance, not garden roles).
MANAGER_CREATABLE_STAFF = frozenset(
    {"receptionist", "sales", "housekeeping", "maintenance", "security", "restaurant"}
)
ELEVATED_ROLES = frozenset({"owner", "platform_admin", "manager"})


def _reject_legacy_admin_role(role: Optional[str]) -> None:
    """Block the deprecated business role string after migration to manager."""
    if role == LEGACY_BUSINESS_ADMIN_ROLE:
        raise HTTPException(
            status_code=400,
            detail="El rol 'admin' está deprecado. Use 'manager'.",
        )


def _sanitize_custom_permissions_for_role(role: str, custom_permissions: Optional[list]) -> Optional[list]:
    """Coerce/limit custom_permissions to keep role semantics coherent and avoid self-locking.

    - platform_admin: ignore custom_permissions so they always use role defaults (platform access cannot be lost).
    - staff roles: ignore custom_permissions (they use role defaults and Permisos).
    - owner: keep only strategic/corporate modules.
    - manager: keep only modules defined in DEFAULT_ROLE_PERMISSIONS for manager.
    - other roles: leave as-is.
    """
    if not custom_permissions:
        return None
    if role == "platform_admin":
        return None
    staff_roles = {
        "receptionist",
        "sales",
        "housekeeping",
        "maintenance",
        "security",
        "restaurant",
        "garden_staff",
        "garden_reception",
    }
    if role in staff_roles:
        return None
    if role == "owner":
        allowed = {"corporate", "hotels", "event-gardens", "reports"}
        filtered = [m for m in custom_permissions if m in allowed]
        return filtered or None
    if role == "manager":
        allowed = set(DEFAULT_ROLE_PERMISSIONS.get("manager", [])) | {"manager_financial_view"}
        filtered = [m for m in custom_permissions if m in allowed]
        return filtered or None
    if role == "finance":
        allowed = set(DEFAULT_ROLE_PERMISSIONS.get("finance", []))
        filtered = [m for m in custom_permissions if m in allowed]
        return filtered or None
    return custom_permissions


@router.get("/users")
async def get_users(current_user: UserModel = Depends(require_module("staff"))):
    users = await db.users.find({}, {"_id": 0}).to_list(1000)
    return [UserResponse(**u) for u in users]


def _assert_creatable_role(current_user: UserModel, role: str) -> None:
    """Enforce product rules for who may create which roles."""
    _reject_legacy_admin_role(role)
    if current_user.role == "platform_admin":
        if role not in PLATFORM_ADMIN_CREATABLE:
            raise HTTPException(
                status_code=400,
                detail="Solo se pueden crear propietarios y gerentes operativos desde plataforma.",
            )
        return
    if current_user.role == "manager":
        if role in ELEVATED_ROLES:
            raise HTTPException(status_code=403, detail="No puede crear usuarios con ese rol")
        if role not in MANAGER_CREATABLE_STAFF:
            raise HTTPException(
                status_code=403,
                detail="Solo puede crear personal operativo: recepción, ventas, limpieza, mantenimiento, seguridad o restaurante.",
            )
        return


@router.post("/users")
async def create_user(
    data: UserCreate,
    _: UserModel = Depends(require_module("staff")),
    current_user: UserModel = Depends(require_role("platform_admin", "manager")),
):
    _assert_creatable_role(current_user, data.role)
    if await db.users.find_one({"email": data.email}):
        raise HTTPException(status_code=400, detail="Email ya registrado")
    sanitized_custom = _sanitize_custom_permissions_for_role(data.role, data.custom_permissions)
    user = UserModel(
        name=data.name,
        email=data.email,
        password_hash=hash_password(data.password),
        role=data.role,
        admin_type=data.admin_type,
        staff_subtype=data.staff_subtype,
        department=data.department,
        phone=data.phone,
        custom_permissions=sanitized_custom,
        property_id=data.property_id,
        property_ids=data.property_ids,
        tenant_id=data.tenant_id,
        avatar_color=random.choice(COLORS),
    )
    await db.users.insert_one(user.model_dump())
    return UserResponse(**user.model_dump())


@router.put("/users/{user_id}")
async def update_user(
    user_id: str,
    data: UserUpdate,
    _: UserModel = Depends(require_module("staff")),
    current_user: UserModel = Depends(require_role("platform_admin", "manager")),
):
    existing = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    if current_user.role == "manager" and user_id != current_user.id:
        er = existing.get("role") or ""
        if er not in MANAGER_CREATABLE_STAFF | {"garden_staff", "garden_reception"}:
            raise HTTPException(status_code=403, detail="No puede modificar este usuario")
    dump = data.model_dump()
    # Decide final role after update (defaults to existing role)
    new_role = dump.get("role") or existing.get("role")
    if dump.get("role") is not None:
        _assert_creatable_role(current_user, dump["role"])
    NULLABLE_FIELDS = {
        "custom_permissions",
        "admin_type",
        "staff_subtype",
        "property_id",
        "property_ids",
        "tenant_id",
    }
    update_dict = {k: v for k, v in dump.items() if k not in NULLABLE_FIELDS and k != "password" and v is not None}
    for field in NULLABLE_FIELDS:
        if field in dump:
            # special handling for custom_permissions to keep role semantics coherent
            if field == "custom_permissions":
                update_dict[field] = _sanitize_custom_permissions_for_role(new_role, dump[field])
            else:
                update_dict[field] = dump[field]
    if dump.get("password"):
        update_dict["password_hash"] = hash_password(dump["password"])
    result = await db.users.find_one_and_update({"id": user_id}, {"$set": update_dict}, return_document=True)
    if not result:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    return UserResponse(**result)


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: str,
    _: UserModel = Depends(require_module("staff")),
    current_user: UserModel = Depends(require_role("platform_admin", "manager")),
):
    # Cannot delete yourself
    if current_user.id == user_id:
        raise HTTPException(status_code=400, detail="No puedes eliminarte a ti mismo")
    # Get target user
    target = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not target:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    target_role = target.get("role", "")
    # Platform admin can delete anyone
    if current_user.role == "platform_admin":
        pass
    elif current_user.role == "manager":
        allowed = list(MANAGER_CREATABLE_STAFF) + ["garden_staff", "garden_reception"]
        if target_role not in allowed:
            raise HTTPException(status_code=403, detail="No tienes permiso para eliminar este usuario")
    await db.users.delete_one({"id": user_id})
    return {"message": "Usuario eliminado"}


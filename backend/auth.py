"""
Auth and scope helpers for the STAYLO API.
Extracted from server.py — used by routes for JWT, password hashing, and property/tenant scope checks.
Imports only from config, db, and models to avoid circular imports.
"""
from datetime import datetime, timezone, timedelta
from typing import List, Optional

from fastapi import Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext

from config import ALGORITHM, SECRET_KEY, TOKEN_EXPIRE_MINUTES
from db import db
from models import UserModel
from services.permission_resolution import (
    PLATFORM_ADMIN_ROLE,
    resolve_effective_modules_for_user,
)

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

# Aliases for require_module / ensure_user_has_module: these extra modules satisfy the guard.
_MODULE_SATISFIES: dict[str, tuple[str, ...]] = {
    "reports": ("manager_financial_view",),
}


def verify_password(plain, hashed):
    return pwd_context.verify(plain, hashed)


def hash_password(pw):
    return pwd_context.hash(pw)


def create_token(data: dict):
    to_encode = data.copy()
    to_encode["exp"] = datetime.now(timezone.utc) + timedelta(minutes=TOKEN_EXPIRE_MINUTES)
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


async def get_current_user(token: str = Depends(oauth2_scheme)):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Token inválido")
    except JWTError:
        raise HTTPException(status_code=401, detail="Token inválido")
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="Usuario no encontrado")
    user_obj = UserModel(**user)
    # Tenant suspension check (non-platform users with tenant_id assigned)
    if user_obj.role != "platform_admin" and user_obj.tenant_id:
        tenant = await db.tenants.find_one(
            {"id": user_obj.tenant_id}, {"_id": 0, "tenant_status": 1, "status": 1}
        )
        if tenant and (
            tenant.get("tenant_status") == "Suspendido" or tenant.get("status") == "suspended"
        ):
            raise HTTPException(status_code=403, detail="Cuenta suspendida. Contacte al administrador.")
    return user_obj


def require_role(*roles):
    async def checker(current_user: UserModel = Depends(get_current_user)):
        if current_user.role not in roles:
            raise HTTPException(status_code=403, detail="Sin permisos suficientes")
        return current_user

    return checker


async def ensure_user_has_module(user: UserModel, module_key: str) -> None:
    """Raise 403 if module_key is not in the user's effective modules (RFC v1). platform_admin bypasses."""
    if user.role == PLATFORM_ADMIN_ROLE:
        return
    modules = await resolve_effective_modules_for_user(user)
    extra = _MODULE_SATISFIES.get(module_key, ())
    if module_key not in modules and not any(a in modules for a in extra):
        raise HTTPException(
            status_code=403,
            detail=f"Módulo no habilitado: {module_key}",
        )


async def ensure_user_has_any_module(user: UserModel, *module_keys: str) -> None:
    """Raise 403 unless at least one module_key is in effective modules. platform_admin bypasses."""
    if user.role == PLATFORM_ADMIN_ROLE:
        return
    if not module_keys:
        raise HTTPException(status_code=403, detail="Módulo no habilitado")
    modules = await resolve_effective_modules_for_user(user)

    def _satisfied(key: str) -> bool:
        if key in modules:
            return True
        for alias in _MODULE_SATISFIES.get(key, ()):
            if alias in modules:
                return True
        return False

    if not any(_satisfied(k) for k in module_keys):
        raise HTTPException(
            status_code=403,
            detail="Módulo no habilitado para esta operación",
        )


def require_module(module_key: str):
    """FastAPI dependency: require a single effective module (or platform_admin)."""

    async def dep(current_user: UserModel = Depends(get_current_user)):
        await ensure_user_has_module(current_user, module_key)
        return current_user

    return dep


def require_any_module(*module_keys: str):
    """FastAPI dependency: require at least one of the given effective modules (or platform_admin)."""

    async def dep(current_user: UserModel = Depends(get_current_user)):
        await ensure_user_has_any_module(current_user, *module_keys)
        return current_user

    return dep


def assigned_property_ids_for_user(user: UserModel) -> List[str]:
    """Resolved assigned properties: non-empty property_ids (strip, dedupe, order preserved), else [property_id], else []."""
    out: List[str] = []
    seen: set[str] = set()
    raw_list = user.property_ids if user.property_ids else []
    for raw in raw_list:
        s = (raw or "").strip()
        if s and s not in seen:
            seen.add(s)
            out.append(s)
    if out:
        return out
    if user.property_id:
        s = (user.property_id or "").strip()
        if s:
            return [s]
    return []


async def _allowed_property_ids(current_user: UserModel):
    """Return None for global visibility (platform_admin), else list of property ids the user may access.

    manager/finance: only assigned_property_ids_for_user (never implicit tenant-wide).
    Other roles: assigned list if set; otherwise all properties in tenant when tenant_id is set.
    """
    if current_user.role == PLATFORM_ADMIN_ROLE:
        return None
    assigned = assigned_property_ids_for_user(current_user)
    if current_user.role in ("manager", "finance"):
        return assigned
    if assigned:
        return assigned
    if current_user.tenant_id:
        props = await db.properties.find({"tenant_id": current_user.tenant_id}, {"id": 1}).to_list(100)
        return [p["id"] for p in props]
    return []


async def allowed_property_ids_for_reports(current_user: UserModel) -> Optional[List[str]]:
    """Property scope for /reports/* (financial + operational KPIs).

    - platform_admin → None (unfiltered; entire DB — platform tooling only).
    - manager / finance → assigned_property_ids_for_user only (may be multiple properties).
    - Other roles → same as _allowed_property_ids.
    """
    if current_user.role == PLATFORM_ADMIN_ROLE:
        return None
    if current_user.role in ("manager", "finance"):
        return assigned_property_ids_for_user(current_user)
    return await _allowed_property_ids(current_user)


async def _ensure_room_in_scope(room: dict, current_user: UserModel) -> None:
    """Raise 404 if room is not in current_user's property/tenant scope."""
    allowed = await _allowed_property_ids(current_user)
    if allowed is None:
        return
    if not allowed:
        raise HTTPException(status_code=404, detail="Habitación no encontrada")
    if room.get("property_id") not in allowed:
        raise HTTPException(status_code=404, detail="Habitación no encontrada")


async def _ensure_reservation_in_scope(res: dict, current_user: UserModel) -> None:
    """Raise 404 if reservation is not in current_user's property/tenant scope."""
    allowed = await _allowed_property_ids(current_user)
    if allowed is None:
        return
    if not allowed:
        raise HTTPException(status_code=404, detail="Reserva no encontrada")
    if res.get("property_id") not in allowed:
        raise HTTPException(status_code=404, detail="Reserva no encontrada")


async def _ensure_guest_in_scope(guest_id: str, current_user: UserModel) -> None:
    """Raise 404 if guest is not in scope (no reservation in allowed properties, or has reservations only in other properties)."""
    allowed = await _allowed_property_ids(current_user)
    if allowed is None:
        return
    if not allowed:
        raise HTTPException(status_code=404, detail="Huésped no encontrado")
    n = await db.reservations.count_documents(
        {"guest_id": guest_id, "property_id": {"$in": allowed}}
    )
    if n > 0:
        return
    # Guest has no reservations in allowed properties: allow only if they have no reservations anywhere (orphan), so creator can delete.
    n_global = await db.reservations.count_documents({"guest_id": guest_id})
    if n_global == 0:
        return
    raise HTTPException(status_code=404, detail="Huésped no encontrado")

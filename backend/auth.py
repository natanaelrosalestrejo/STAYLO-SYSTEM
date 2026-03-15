"""
Auth and scope helpers for the STAYLO API.
Extracted from server.py — used by routes for JWT, password hashing, and property/tenant scope checks.
Imports only from config, db, and models to avoid circular imports.
"""
from datetime import datetime, timezone, timedelta

from fastapi import Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext

from config import ALGORITHM, SECRET_KEY, TOKEN_EXPIRE_MINUTES
from db import db
from models import UserModel

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


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


async def _allowed_property_ids(current_user: UserModel):
    """Return None for global visibility (platform_admin), else list of property ids the user may access."""
    if current_user.role == "platform_admin":
        return None
    if current_user.property_id:
        return [current_user.property_id]
    if current_user.tenant_id:
        props = await db.properties.find({"tenant_id": current_user.tenant_id}, {"id": 1}).to_list(100)
        return [p["id"] for p in props]
    return []


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

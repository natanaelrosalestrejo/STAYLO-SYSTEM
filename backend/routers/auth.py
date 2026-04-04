from fastapi import APIRouter, Depends, HTTPException

from auth import create_token, get_current_user, verify_password
from db import db
from models import UserModel, UserResponse, LoginRequest
from services.permission_resolution import resolve_effective_modules_for_user


router = APIRouter()


@router.post("/auth/login")
async def login(data: LoginRequest):
    user = await db.users.find_one({"email": data.email}, {"_id": 0})
    if not user or not verify_password(data.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Email o contraseña incorrectos")
    if not user.get("is_active", True):
        raise HTTPException(status_code=403, detail="Cuenta desactivada")
    user_obj = UserModel(**user)
    token = create_token({"sub": user_obj.id, "role": user_obj.role})
    user_payload = UserResponse(**user_obj.model_dump()).model_dump()
    user_payload["modules"] = await resolve_effective_modules_for_user(user_obj)
    return {"access_token": token, "token_type": "bearer", "user": user_payload}


@router.get("/auth/me")
async def get_me(current_user: UserModel = Depends(get_current_user)):
    payload = UserResponse(**current_user.model_dump()).model_dump()
    payload["modules"] = await resolve_effective_modules_for_user(current_user)
    return payload


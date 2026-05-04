import asyncio
import html as html_lib
import logging
import secrets
from datetime import datetime, timedelta

import resend as _resend
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth import create_token, get_current_user, verify_password, hash_password
from config import FRONTEND_URL, RESEND_API_KEY, SENDER_EMAIL
from db import db
from models import UserModel, UserResponse, LoginRequest
from services.permission_resolution import resolve_effective_modules_for_user

logger = logging.getLogger(__name__)


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


class ChangePasswordRequest(BaseModel):
    new_password: str


class ForgotPasswordRequest(BaseModel):
    email: str


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str


@router.post("/auth/change-password")
async def change_password(
    data: ChangePasswordRequest,
    current_user: UserModel = Depends(get_current_user)
):
    if len(data.new_password) < 8:
        raise HTTPException(status_code=400, detail="La contraseña debe tener al menos 8 caracteres")
    await db.users.update_one(
        {"id": current_user.id},
        {"$set": {"password_hash": hash_password(data.new_password), "force_password_change": False}}
    )
    return {"success": True}


@router.post("/auth/forgot-password")
async def forgot_password(data: ForgotPasswordRequest):
    user = await db.users.find_one(
        {"email": data.email.lower().strip()}, {"_id": 0, "id": 1, "email": 1, "name": 1}
    )
    # Always return 200 — never leak whether email is registered
    if not user:
        return {"sent": True}

    # Invalidate any previous tokens for this user
    await db.password_reset_tokens.delete_many({"user_id": user["id"]})

    token = secrets.token_urlsafe(32)
    expires_at = datetime.utcnow() + timedelta(hours=1)
    await db.password_reset_tokens.insert_one({
        "token": token,
        "user_id": user["id"],
        "email": user["email"],
        "expires_at": expires_at,
    })

    reset_url = f"{FRONTEND_URL}/reset-password?token={token}"

    if RESEND_API_KEY:
        safe_name = html_lib.escape(user.get("name") or user["email"])
        html_body = f"""
        <div style="font-family:'Montserrat',Arial,sans-serif;max-width:600px;margin:0 auto;background:#faf8f3;">
          <div style="background:linear-gradient(135deg,#625746,#917a6a);padding:40px 32px;text-align:center;">
            <p style="color:#d2c7b6;font-size:11px;letter-spacing:0.3em;margin:0 0 8px;">STAYLO</p>
            <h1 style="color:#fcf5e0;font-size:26px;font-weight:300;margin:0;letter-spacing:0.02em;font-family:Georgia,serif;">Recuperación de Contraseña</h1>
          </div>
          <div style="padding:32px;">
            <p style="color:#625746;font-size:15px;margin:0 0 16px;">Hola, <strong>{safe_name}</strong></p>
            <p style="color:#666;font-size:14px;margin:0 0 24px;line-height:1.6;">
              Recibimos una solicitud para restablecer tu contraseña.
              El enlace expira en <strong>1 hora</strong>.
            </p>
            <div style="text-align:center;margin:28px 0;">
              <a href="{reset_url}"
                 style="display:inline-block;background:#625746;color:#fcf5e0;text-decoration:none;
                        padding:14px 32px;border-radius:10px;font-size:14px;font-weight:600;
                        font-family:Montserrat,sans-serif;letter-spacing:0.05em;">
                Restablecer contraseña
              </a>
            </div>
            <p style="color:#999;font-size:12px;line-height:1.6;margin:0 0 8px;">
              Si no solicitaste este cambio, ignora este correo. Tu contraseña actual sigue siendo válida.
            </p>
            <div style="text-align:center;margin-top:24px;padding-top:20px;border-top:1px solid #e8dfd5;">
              <p style="color:#c8b8a8;font-size:11px;letter-spacing:0.1em;margin:0;">© 2025 STAYLO · Todos los derechos reservados</p>
            </div>
          </div>
        </div>"""
        try:
            await asyncio.to_thread(
                _resend.Emails.send,
                {"from": SENDER_EMAIL, "to": [user["email"]],
                 "subject": "Restablecer contraseña — STAYLO", "html": html_body}
            )
        except Exception as e:
            logger.error(f"Password reset email error: {e}")
    else:
        logger.info(f"[DEV] Password reset URL for {user['email']}: {reset_url}")

    return {"sent": True}


@router.post("/auth/reset-password")
async def reset_password(data: ResetPasswordRequest):
    if len(data.new_password) < 8:
        raise HTTPException(status_code=400, detail="La contraseña debe tener al menos 8 caracteres")

    record = await db.password_reset_tokens.find_one({"token": data.token})
    if not record or record["expires_at"] < datetime.utcnow():
        if record:
            await db.password_reset_tokens.delete_one({"token": data.token})
        raise HTTPException(status_code=400, detail="El enlace es inválido o ya expiró")

    await db.users.update_one(
        {"id": record["user_id"]},
        {"$set": {"password_hash": hash_password(data.new_password), "force_password_change": False}}
    )
    await db.password_reset_tokens.delete_one({"token": data.token})
    return {"success": True}


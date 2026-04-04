"""
Messages API routes: inbox, unread count, create, mark read.
"""
import uuid

from fastapi import APIRouter, Depends, HTTPException

from auth import require_module
from db import db
from models import MessageCreate, MessageModel, UserModel

router = APIRouter()


@router.get("/messages/unread-count")
async def unread_count(current_user: UserModel = Depends(require_module("inbox"))):
    count = await db.messages.count_documents(
        {"receiver_id": current_user.id, "is_read": False}
    )
    return {"count": count}


@router.get("/messages")
async def get_messages(current_user: UserModel = Depends(require_module("inbox"))):
    msgs = await db.messages.find(
        {"$or": [{"sender_id": current_user.id}, {"receiver_id": current_user.id}]},
        {"_id": 0},
    ).sort("created_at", -1).to_list(1000)
    return msgs


@router.post("/messages")
async def create_message(
    data: MessageCreate, current_user: UserModel = Depends(require_module("inbox"))
):
    receiver_name = None
    receiver = await db.users.find_one({"id": data.receiver_id})
    if receiver:
        receiver_name = receiver["name"]
    else:
        guest = await db.guests.find_one({"id": data.receiver_id})
        if guest:
            receiver_name = f"{guest['first_name']} {guest['last_name']}"
    if not receiver_name:
        raise HTTPException(status_code=404, detail="Destinatario no encontrado")
    message = MessageModel(
        thread_id=data.thread_id or str(uuid.uuid4()),
        sender_id=current_user.id,
        sender_name=current_user.name,
        receiver_id=data.receiver_id,
        receiver_name=receiver_name,
        subject=data.subject,
        content=data.content,
        message_type=data.message_type,
        is_reply=data.parent_id is not None,
        parent_id=data.parent_id,
    )
    await db.messages.insert_one(message.model_dump())
    return message.model_dump()


@router.patch("/messages/{msg_id}/read")
async def mark_read(msg_id: str, current_user: UserModel = Depends(require_module("inbox"))):
    await db.messages.update_one({"id": msg_id}, {"$set": {"is_read": True}})
    return {"message": "Marcado como leído"}

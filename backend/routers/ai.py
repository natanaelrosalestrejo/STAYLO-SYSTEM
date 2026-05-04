import json
import logging
import re
import uuid

from fastapi import APIRouter, Depends, HTTPException

from auth import get_current_user
from config import EMERGENT_LLM_KEY
from models import UserModel

logger = logging.getLogger(__name__)

router = APIRouter()

try:
    from emergentintegrations.llm.chat import LlmChat, UserMessage
except ImportError:
    LlmChat = None  # type: ignore
    UserMessage = None  # type: ignore


@router.post("/ai/suggest-reply")
async def suggest_reply(data: dict, current_user: UserModel = Depends(get_current_user)):
    if not EMERGENT_LLM_KEY or LlmChat is None or UserMessage is None:
        raise HTTPException(status_code=503, detail="AI no disponible (configurar EMERGENT_LLM_KEY o instalar emergentintegrations)")
    chat = (
        LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=str(uuid.uuid4()),
            system_message="Eres asistente profesional de hotel. Genera respuestas cortas y profesionales en español. Solo devuelve el texto de la respuesta.",
        ).with_model("openai", "gpt-4.1")
    )
    response = await chat.send_message(UserMessage(text=f"Genera una respuesta profesional para: '{data.get('message', '')}'"))
    return {"suggestion": response}


@router.post("/ai/summarize")
async def summarize(data: dict, current_user: UserModel = Depends(get_current_user)):
    if not EMERGENT_LLM_KEY or LlmChat is None or UserMessage is None:
        raise HTTPException(status_code=503, detail="AI no disponible (configurar EMERGENT_LLM_KEY o instalar emergentintegrations)")
    msgs_text = "\n".join([f"- {m}" for m in data.get("messages", [])])
    chat = (
        LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=str(uuid.uuid4()),
            system_message="Eres asistente de hotel. Resume conversaciones de forma concisa en español.",
        ).with_model("openai", "gpt-4.1")
    )
    response = await chat.send_message(UserMessage(text=f"Resume en 2-3 oraciones:\n{msgs_text}"))
    return {"summary": response}


@router.post("/ai/task-suggestion")
async def task_suggestion(data: dict, current_user: UserModel = Depends(get_current_user)):
    if not EMERGENT_LLM_KEY or LlmChat is None or UserMessage is None:
        raise HTTPException(status_code=503, detail="AI no disponible (configurar EMERGENT_LLM_KEY o instalar emergentintegrations)")
    chat = (
        LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=str(uuid.uuid4()),
            system_message="Eres gestor de hotel. Genera tareas en JSON válido con: title, description, priority (low/medium/high/urgent), category (housekeeping/maintenance/reception/general). Solo JSON.",
        ).with_model("openai", "gpt-4.1")
    )
    response = await chat.send_message(UserMessage(text=f"Tarea para: '{data.get('issue', '')}'"))
    try:
        match = re.search(r"\{.*\}", response, re.DOTALL)
        if match:
            return json.loads(match.group())
    except Exception as e:
        logger.warning(f"AI task-suggestion: no se pudo parsear JSON de la respuesta: {e}")
    return {"title": data.get("issue", "Nueva tarea"), "description": response, "priority": "medium", "category": "general"}

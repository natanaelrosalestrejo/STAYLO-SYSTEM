from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, Request
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from starlette.middleware.cors import CORSMiddleware
from typing import List, Optional, Dict
from datetime import datetime, timezone, timedelta
import logging, uuid, json, re, random, asyncio, secrets, html
from pathlib import Path
import resend

from auth import (
    get_current_user,
    require_any_module,
    require_module,
    require_role,
    assigned_property_ids_for_user,
    _allowed_property_ids,
    _ensure_guest_in_scope,
    _ensure_reservation_in_scope,
    _ensure_room_in_scope,
)

# Optional: emergentintegrations (LLM + Stripe) — only available in Emergent; app runs locally without it.
try:
    from emergentintegrations.llm.chat import LlmChat, UserMessage
except ImportError:
    LlmChat = None  # type: ignore
    UserMessage = None  # type: ignore

try:
    from emergentintegrations.payments.stripe.checkout import StripeCheckout, CheckoutSessionRequest
except ImportError:
    StripeCheckout = None  # type: ignore
    CheckoutSessionRequest = None  # type: ignore

if LlmChat is None or StripeCheckout is None:
    logging.getLogger(__name__).info(
        "emergentintegrations not installed: AI and Stripe checkout endpoints will return 503 when called. "
        "Install emergentintegrations in Emergent for full functionality."
    )

from config import (
    CORS_ORIGINS_LIST,
    EMERGENT_LLM_KEY,
    EXTRAS_CATALOG,
    HOTEL_NOTIFICATION_EMAIL,
    RESEND_API_KEY,
    SENDER_EMAIL,
    STRIPE_API_KEY,
    STRIPE_WEBHOOK_SECRET,
)
from db import client, db
from models import (
    DEFAULT_ROLE_PERMISSIONS,
    AmenityCreate,
    AmenityModel,
    EventBookingCreate,
    EventBookingModel,
    EventSpaceCreate,
    EventSpaceModel,
    ExtrasRequest,
    GuestCreate,
    GuestModel,
    HotelSpaceCreate,
    HotelSpaceModel,
    LoginRequest,
    MessageCreate,
    MessageModel,
    PendingBookingModel,
    PaymentTransactionModel,
    PropertyCreate,
    PropertyModel,
    PublicBookingCreate,
    ReservationModel,
    RolePermissionUpdate,
    RoomCreate,
    RoomModel,
    RoomUpdate,
    RoomTypeCreate,
    RoomTypeModel,
    TaskCreate,
    TaskModel,
    TenantCreate,
    TenantModel,
    UserCreate,
    UserModel,
    UserResponse,
    UserUpdate,
)
from routers import messages_router, tasks_router, users_router, auth_router, rooms_router, guests_router, event_lodging_router, reservations_router, reports_router
from routers.reservations import _ensure_hotel_room_inventory_for_booking
from seeds import COLORS, DEMO_PROPERTY_ID, run_all
from services.scoring import calculate_garden_score, calculate_hotel_score

# Email security: API key must come ONLY from environment variable — never hardcoded
if RESEND_API_KEY:
    resend.api_key = RESEND_API_KEY
    logging.info("Resend email service initialized. Key rotation: update RESEND_API_KEY env var to revoke/replace.")
else:
    logging.warning("RESEND_API_KEY not set. Email sending disabled. Reservation creation will still succeed.")

app = FastAPI()
limiter = Limiter(key_func=get_remote_address)
api_router = APIRouter(prefix="/api")

# ====================== ROUTES ======================

# --- AI ---
@api_router.post("/ai/suggest-reply")
async def suggest_reply(data: dict, current_user: UserModel = Depends(get_current_user)):
    if not EMERGENT_LLM_KEY or LlmChat is None or UserMessage is None:
        raise HTTPException(status_code=503, detail="AI no disponible (configurar EMERGENT_LLM_KEY o instalar emergentintegrations)")
    chat = LlmChat(api_key=EMERGENT_LLM_KEY, session_id=str(uuid.uuid4()),
                   system_message="Eres asistente profesional de hotel. Genera respuestas cortas y profesionales en español. Solo devuelve el texto de la respuesta."
                   ).with_model("openai", "gpt-4.1")
    response = await chat.send_message(UserMessage(text=f"Genera una respuesta profesional para: '{data.get('message', '')}'"))
    return {"suggestion": response}

@api_router.post("/ai/summarize")
async def summarize(data: dict, current_user: UserModel = Depends(get_current_user)):
    if not EMERGENT_LLM_KEY or LlmChat is None or UserMessage is None:
        raise HTTPException(status_code=503, detail="AI no disponible (configurar EMERGENT_LLM_KEY o instalar emergentintegrations)")
    msgs_text = "\n".join([f"- {m}" for m in data.get("messages", [])])
    chat = LlmChat(api_key=EMERGENT_LLM_KEY, session_id=str(uuid.uuid4()),
                   system_message="Eres asistente de hotel. Resume conversaciones de forma concisa en español."
                   ).with_model("openai", "gpt-4.1")
    response = await chat.send_message(UserMessage(text=f"Resume en 2-3 oraciones:\n{msgs_text}"))
    return {"summary": response}

@api_router.post("/ai/task-suggestion")
async def task_suggestion(data: dict, current_user: UserModel = Depends(get_current_user)):
    if not EMERGENT_LLM_KEY or LlmChat is None or UserMessage is None:
        raise HTTPException(status_code=503, detail="AI no disponible (configurar EMERGENT_LLM_KEY o instalar emergentintegrations)")
    chat = LlmChat(api_key=EMERGENT_LLM_KEY, session_id=str(uuid.uuid4()),
                   system_message="Eres gestor de hotel. Genera tareas en JSON válido con: title, description, priority (low/medium/high/urgent), category (housekeeping/maintenance/reception/general). Solo JSON."
                   ).with_model("openai", "gpt-4.1")
    response = await chat.send_message(UserMessage(text=f"Tarea para: '{data.get('issue', '')}'"))
    try:
        match = re.search(r'\{.*\}', response, re.DOTALL)
        if match:
            return json.loads(match.group())
    except Exception as e:
        logger.warning(f"AI task-suggestion: no se pudo parsear JSON de la respuesta: {e}")
    return {"title": data.get("issue", "Nueva tarea"), "description": response, "priority": "medium", "category": "general"}

# ====================== PROPERTIES ======================

@api_router.get("/properties")
async def list_properties(current_user: UserModel = Depends(get_current_user)):
    """Lista propiedades visibles según alcance del usuario (tenant / asignadas). No exige módulo 'properties'."""
    props = await db.properties.find({}, {"_id": 0}).to_list(100)
    allowed = await _allowed_property_ids(current_user)
    if allowed is None:
        return props
    idset = set(allowed)
    return [p for p in props if p.get("id") in idset]

@api_router.post("/properties")
async def create_property(
    data: PropertyCreate,
    _: UserModel = Depends(require_module("properties")),
    current_user: UserModel = Depends(require_role("manager", "platform_admin")),
):
    prop = PropertyModel(**data.model_dump())
    await db.properties.insert_one(prop.model_dump())
    return prop.model_dump()

@api_router.patch("/properties/{prop_id}")
async def update_property(
    prop_id: str,
    data: dict,
    _: UserModel = Depends(require_module("properties")),
    current_user: UserModel = Depends(require_role("manager", "platform_admin")),
):
    await db.properties.update_one({"id": prop_id}, {"$set": data})
    p = await db.properties.find_one({"id": prop_id}, {"_id": 0})
    if not p: raise HTTPException(status_code=404, detail="Propiedad no encontrada")
    return p

@api_router.delete("/properties/{prop_id}")
async def delete_property(
    prop_id: str,
    _: UserModel = Depends(require_module("properties")),
    current_user: UserModel = Depends(require_role("manager", "platform_admin")),
):
    active = await db.reservations.count_documents({"property_id": prop_id, "status": {"$in": ["confirmed", "checked_in"]}})
    if active > 0:
        raise HTTPException(status_code=400, detail="No se puede eliminar: la propiedad tiene reservas activas")
    await db.properties.delete_one({"id": prop_id})
    return {"deleted": True}

# ====================== EVENT SPACES ======================

@api_router.get("/event-spaces")
async def list_event_spaces(
    property_id: Optional[str] = None,
    current_user: UserModel = Depends(require_module("jardines")),
):
    q = {"property_id": property_id} if property_id else {}
    spaces = await db.event_spaces.find(q, {"_id": 0}).to_list(100)
    return spaces

@api_router.post("/event-spaces")
async def create_event_space(
    data: EventSpaceCreate,
    _: UserModel = Depends(require_module("jardines")),
    current_user: UserModel = Depends(require_role("manager", "receptionist")),
):
    space = EventSpaceModel(**data.model_dump())
    await db.event_spaces.insert_one(space.model_dump())
    return space.model_dump()

@api_router.patch("/event-spaces/{space_id}")
async def update_event_space(
    space_id: str,
    data: dict,
    _: UserModel = Depends(require_module("jardines")),
    current_user: UserModel = Depends(require_role("manager", "receptionist")),
):
    await db.event_spaces.update_one({"id": space_id}, {"$set": data})
    s = await db.event_spaces.find_one({"id": space_id}, {"_id": 0})
    if not s: raise HTTPException(status_code=404, detail="Espacio no encontrado")
    return s

@api_router.delete("/event-spaces/{space_id}")
async def delete_event_space(
    space_id: str,
    _: UserModel = Depends(require_module("jardines")),
    current_user: UserModel = Depends(require_role("manager")),
):
    await db.event_spaces.delete_one({"id": space_id})
    return {"deleted": True}

# ====================== HOTEL SPACES ======================

@api_router.get("/hotel-spaces")
async def list_hotel_spaces(
    property_id: Optional[str] = None,
    current_user: UserModel = Depends(require_module("hotel-events")),
):
    q = {"property_id": property_id} if property_id else {}
    spaces = await db.hotel_spaces.find(q, {"_id": 0}).to_list(100)
    return spaces

@api_router.post("/hotel-spaces")
async def create_hotel_space(
    data: HotelSpaceCreate,
    _: UserModel = Depends(require_module("hotel-events")),
    current_user: UserModel = Depends(require_role("manager")),
):
    space = HotelSpaceModel(**data.model_dump())
    await db.hotel_spaces.insert_one(space.model_dump())
    return space.model_dump()

@api_router.patch("/hotel-spaces/{space_id}")
async def update_hotel_space(
    space_id: str,
    data: dict,
    _: UserModel = Depends(require_module("hotel-events")),
    current_user: UserModel = Depends(require_role("manager")),
):
    await db.hotel_spaces.update_one({"id": space_id}, {"$set": data})
    s = await db.hotel_spaces.find_one({"id": space_id}, {"_id": 0})
    if not s: raise HTTPException(status_code=404, detail="Espacio no encontrado")
    return s

@api_router.delete("/hotel-spaces/{space_id}")
async def delete_hotel_space(
    space_id: str,
    _: UserModel = Depends(require_module("hotel-events")),
    current_user: UserModel = Depends(require_role("manager")),
):
    await db.hotel_spaces.delete_one({"id": space_id})
    return {"deleted": True}

# ====================== EVENT BOOKINGS ======================

@api_router.get("/event-bookings")
async def list_event_bookings(
    property_id: Optional[str] = None,
    current_user: UserModel = Depends(require_any_module("jardines", "hotel-events")),
):
    q = {"property_id": property_id} if property_id else {}
    bookings = await db.event_bookings.find(q, {"_id": 0}).sort("event_date", -1).to_list(500)
    return bookings

@api_router.post("/event-bookings")
async def create_event_booking(
    data: EventBookingCreate,
    current_user: UserModel = Depends(require_any_module("jardines", "hotel-events")),
):
    space = await db.event_spaces.find_one({"id": data.event_space_id}, {"_id": 0})
    space_name = space["space_name"] if space else "Espacio"
    booking = EventBookingModel(**data.model_dump(), event_space_name=space_name, created_by=current_user.id)
    await db.event_bookings.insert_one(booking.model_dump())
    return booking.model_dump()

@api_router.patch("/event-bookings/{booking_id}/status")
async def update_event_booking_status(
    booking_id: str,
    data: dict,
    current_user: UserModel = Depends(require_any_module("jardines", "hotel-events")),
):
    allowed = {"booking_status", "payment_status", "notes"}
    update = {k: v for k, v in data.items() if k in allowed}
    await db.event_bookings.update_one({"id": booking_id}, {"$set": update})
    b = await db.event_bookings.find_one({"id": booking_id}, {"_id": 0})
    if not b: raise HTTPException(status_code=404, detail="Reserva de evento no encontrada")
    return b

@api_router.delete("/event-bookings/{booking_id}")
async def delete_event_booking(
    booking_id: str,
    _: UserModel = Depends(require_any_module("jardines", "hotel-events")),
    current_user: UserModel = Depends(require_role("manager", "receptionist")),
):
    await db.event_bookings.delete_one({"id": booking_id})
    return {"deleted": True}


async def _corporate_scope_property_ids(current_user: UserModel) -> list[str]:
    """IDs de propiedades del mismo tenant que el usuario (hotel + jardines), para métricas de grupo coherentes."""
    if current_user.tenant_id:
        props = await db.properties.find({"tenant_id": current_user.tenant_id}, {"id": 1}).to_list(100)
        if props:
            return [p["id"] for p in props]
    assigned = assigned_property_ids_for_user(current_user)
    anchor = assigned[0] if assigned else None
    if anchor:
        p = await db.properties.find_one({"id": anchor}, {"_id": 0, "tenant_id": 1})
        if p and p.get("tenant_id"):
            props = await db.properties.find({"tenant_id": p["tenant_id"]}, {"id": 1}).to_list(100)
            if props:
                return [x["id"] for x in props]
        return [anchor]
    props = await db.properties.find({}, {"id": 1}).to_list(200)
    return [p["id"] for p in props]


# ====================== CORPORATE DASHBOARD ======================

@api_router.get("/corporate/dashboard")
async def corporate_dashboard(
    _: UserModel = Depends(require_module("corporate")),
    current_user: UserModel = Depends(require_role("owner", "manager")),
):
    from datetime import date as dt_date, timedelta
    today = dt_date.today()
    today_str = today.isoformat()
    month_start = today.replace(day=1).isoformat()

    # Remaining days in month
    if today.month == 12:
        next_month_first = dt_date(today.year + 1, 1, 1)
    else:
        next_month_first = dt_date(today.year, today.month + 1, 1)
    remaining_days = (next_month_first - today).days
    days_in_month = (next_month_first - today.replace(day=1)).days

    # Last month bounds
    first_day_this_month = today.replace(day=1)
    last_day_last_month = first_day_this_month - timedelta(days=1)
    last_month_start = last_day_last_month.replace(day=1).isoformat()
    last_month_end = first_day_this_month.isoformat()

    scope_ids = await _corporate_scope_property_ids(current_user)
    scope_set = set(scope_ids)
    all_properties = await db.properties.find({}, {"_id": 0}).to_list(100)
    properties = [p for p in all_properties if p["id"] in scope_set]

    hotel_prop_ids = [p["id"] for p in properties if p.get("type") == "hotel"]
    garden_prop_ids = [p["id"] for p in properties if p.get("type") == "event_garden"]

    pq = {"property_id": {"$in": hotel_prop_ids}} if hotel_prop_ids else {"property_id": {"$in": []}}
    rq_hotel = {"status": {"$nin": ["cancelled"]}, "property_id": {"$in": hotel_prop_ids}} if hotel_prop_ids else {"property_id": {"$in": []}}
    eq = {"booking_status": {"$ne": "cancelled"}, "property_id": {"$in": garden_prop_ids}} if garden_prop_ids else {"property_id": {"$in": []}}

    # ====== HOTEL METRICS (solo propiedades tipo hotel; alineado con /properties/stats y vista Hoteles) ======
    hotel_res = await db.reservations.find(rq_hotel, {"_id": 0}).to_list(10000)
    hotel_res_month = [r for r in hotel_res if r.get("check_in_date", "") >= month_start]
    hotel_revenue_month = sum(r.get("total_amount", 0) for r in hotel_res_month)
    hotel_revenue_total = sum(r.get("total_amount", 0) for r in hotel_res)
    hotel_rooms_total = await db.rooms.count_documents(pq)
    hotel_rooms_occupied = await db.rooms.count_documents({**pq, "status": {"$in": ["occupied", "reserved"]}})
    hotel_rooms_available = await db.rooms.count_documents({**pq, "status": "available"})
    hotel_occ_rate = round((hotel_rooms_occupied / hotel_rooms_total * 100) if hotel_rooms_total else 0, 1)
    hotel_pending_pay = await db.reservations.count_documents({
        "payment_status": "pending", "status": {"$in": ["confirmed", "checked_in"]}, "property_id": {"$in": hotel_prop_ids},
    }) if hotel_prop_ids else 0
    total_hotel_res = await db.reservations.count_documents({"property_id": {"$in": hotel_prop_ids}}) if hotel_prop_ids else 0
    cancelled_hotel_res = await db.reservations.count_documents({"status": "cancelled", "property_id": {"$in": hotel_prop_ids}}) if hotel_prop_ids else 0
    hotel_score = calculate_hotel_score(hotel_occ_rate, hotel_pending_pay, total_hotel_res, cancelled_hotel_res)

    # Expected hotel revenue (confirmed not yet checked in)
    expected_hotel_res = await db.reservations.find(
        {"status": "confirmed", "property_id": {"$in": hotel_prop_ids}}, {"_id": 0, "total_amount": 1}
    ).to_list(10000) if hotel_prop_ids else []
    expected_hotel_revenue = sum(r.get("total_amount", 0) for r in expected_hotel_res)

    # Last month hotel revenue
    hotel_last_month = await db.reservations.find(
        {
            "check_in_date": {"$gte": last_month_start, "$lt": last_month_end},
            "status": {"$nin": ["cancelled"]},
            "property_id": {"$in": hotel_prop_ids},
        },
        {"_id": 0, "total_amount": 1},
    ).to_list(1000) if hotel_prop_ids else []
    hotel_last_month_revenue = sum(r.get("total_amount", 0) for r in hotel_last_month)

    # Revenue opportunity for hotel
    rooms_prices = await db.rooms.find(pq, {"_id": 0, "price_per_night": 1}).to_list(1000)
    avg_room_rate = (sum(r.get("price_per_night", 0) for r in rooms_prices) / len(rooms_prices)) if rooms_prices else 1500
    revenue_opportunity = round(hotel_rooms_available * avg_room_rate * remaining_days, 0)

    # ====== EVENT GARDEN METRICS (solo propiedades tipo event_garden; alineado con vista Jardines) ======
    event_bookings = await db.event_bookings.find(eq, {"_id": 0}).to_list(10000)
    event_bookings_month = [b for b in event_bookings if b.get("event_date", "") >= month_start]
    event_revenue_month = sum(b.get("total_price", 0) for b in event_bookings_month)
    event_revenue_total = sum(b.get("total_price", 0) for b in event_bookings)
    event_pending_pay = sum(1 for b in event_bookings if b.get("payment_status") == "pending")
    upcoming_bookings_future = [b for b in event_bookings if b.get("event_date", "") >= today_str]
    expected_event_revenue = sum(b.get("total_price", 0) for b in upcoming_bookings_future)
    garden_score = calculate_garden_score(len(upcoming_bookings_future), event_pending_pay, len(event_bookings))

    # Last month event revenue
    event_last_month = await db.event_bookings.find(
        {
            "event_date": {"$gte": last_month_start, "$lt": last_month_end},
            "booking_status": {"$ne": "cancelled"},
            "property_id": {"$in": garden_prop_ids},
        },
        {"_id": 0, "total_price": 1},
    ).to_list(1000) if garden_prop_ids else []
    event_last_month_revenue = sum(b.get("total_price", 0) for b in event_last_month)

    # ====== GROUP METRICS ======
    total_staff = await db.users.count_documents({"is_active": True})
    total_month_revenue = hotel_revenue_month + event_revenue_month
    total_last_month_revenue = hotel_last_month_revenue + event_last_month_revenue
    expected_total_revenue = expected_hotel_revenue + expected_event_revenue
    today_arrivals = await db.reservations.count_documents({
        "check_in_date": today_str,
        "status": {"$in": ["confirmed", "checked_in"]},
        "property_id": {"$in": hotel_prop_ids},
    }) if hotel_prop_ids else 0
    today_departures = await db.reservations.count_documents({
        "check_out_date": today_str,
        "status": {"$in": ["confirmed", "checked_in"]},
        "property_id": {"$in": hotel_prop_ids},
    }) if hotel_prop_ids else 0

    revenue_growth_pct = 0.0
    if total_last_month_revenue > 0:
        revenue_growth_pct = round((total_month_revenue - total_last_month_revenue) / total_last_month_revenue * 100, 1)
    elif total_month_revenue > 0:
        revenue_growth_pct = 100.0

    projected_month_revenue = round((total_month_revenue / today.day * days_in_month) if today.day > 0 else 0)

    # Property ranking by monthly revenue — names from scoped properties list
    hotel_prop = next((p for p in properties if p.get("type") == "hotel"), None)
    garden_prop = next((p for p in properties if p.get("type") == "event_garden"), None)
    hotel_name = hotel_prop.get("name", "Hotel") if hotel_prop else "Hotel"
    garden_name = garden_prop.get("name", "Jardín") if garden_prop else "Jardín"

    property_ranking = sorted([
        {"rank_id": "hotel", "name": hotel_name, "type": "hotel",
         "monthly_revenue": hotel_revenue_month, "score": hotel_score},
        {"rank_id": "garden", "name": garden_name, "type": "event_garden",
         "monthly_revenue": event_revenue_month, "score": garden_score},
    ], key=lambda x: x["monthly_revenue"], reverse=True)

    # Source breakdown
    sources = await db.reservations.aggregate([
        {"$match": {"status": {"$nin": ["cancelled"]}, "property_id": {"$in": hotel_prop_ids}}},
        {"$group": {"_id": "$reservation_source", "count": {"$sum": 1}, "revenue": {"$sum": "$total_amount"}}},
    ]).to_list(10)
    source_labels = {"web": "Portal Web", "reception": "Recepción", "whatsapp": "WhatsApp", "other": "Otro"}
    source_map = {s["_id"] or "other": s for s in sources}
    source_breakdown = [
        {
            "source": key,
            "label": source_labels[key],
            "count": source_map.get(key, {}).get("count", 0),
            "revenue": source_map.get(key, {}).get("revenue", 0)
        }
        for key in source_labels
    ]

    # Monthly comparison chart (last 6 months)
    month_labels = {"01":"Ene","02":"Feb","03":"Mar","04":"Abr","05":"May","06":"Jun","07":"Jul","08":"Ago","09":"Sep","10":"Oct","11":"Nov","12":"Dic"}
    monthly_hotel = await db.reservations.aggregate([
        {"$match": {"status": {"$nin": ["cancelled"]}, "property_id": {"$in": hotel_prop_ids}}},
        {"$group": {"_id": {"$substr": ["$check_in_date", 0, 7]}, "revenue": {"$sum": "$total_amount"}, "count": {"$sum": 1}}},
        {"$sort": {"_id": -1}}, {"$limit": 6},
    ]).to_list(6)
    monthly_events = await db.event_bookings.aggregate([
        {"$match": {"booking_status": {"$ne": "cancelled"}, "property_id": {"$in": garden_prop_ids}}},
        {"$group": {"_id": {"$substr": ["$event_date", 0, 7]}, "revenue": {"$sum": "$total_price"}, "count": {"$sum": 1}}},
        {"$sort": {"_id": -1}}, {"$limit": 6},
    ]).to_list(6)
    hotel_monthly_map = {m["_id"]: m for m in monthly_hotel}
    event_monthly_map = {m["_id"]: m for m in monthly_events}
    all_months = sorted(set(list(hotel_monthly_map.keys()) + list(event_monthly_map.keys())), reverse=True)[:6]
    comparison_chart = []
    for month in reversed(all_months):
        label = month_labels.get(month.split("-")[1], month) if "-" in month else month
        comparison_chart.append({
            "month": label,
            "hotel": hotel_monthly_map.get(month, {}).get("revenue", 0),
            "eventos": event_monthly_map.get(month, {}).get("revenue", 0),
        })

    # ----- Additive owner/business-control sections (do not remove keys above) -----
    prop_by_id = {p["id"]: p.get("name", "Propiedad") for p in properties}

    # Pending amounts (MXN): sum of line items with payment_status pending
    hotel_pending_rows = await db.reservations.find(
        {
            "payment_status": "pending",
            "status": {"$in": ["confirmed", "checked_in"]},
            "property_id": {"$in": hotel_prop_ids},
        },
        {"_id": 0, "total_amount": 1},
    ).to_list(10000)
    hotel_pending_amount = float(sum(r.get("total_amount", 0) or 0 for r in hotel_pending_rows))

    event_pending_amount = float(
        sum(
            b.get("total_price", 0) or 0
            for b in event_bookings
            if b.get("payment_status") == "pending" and b.get("booking_status") != "cancelled"
        )
    )
    pending_breakdown = {
        "total_pending_amount": round(hotel_pending_amount + event_pending_amount, 2),
        "hotel_pending_amount": round(hotel_pending_amount, 2),
        "event_pending_amount": round(event_pending_amount, 2),
    }

    # Upcoming events (next 15, not cancelled, on or after today)
    upcoming_sorted = sorted(
        [b for b in event_bookings if b.get("event_date", "") >= today_str],
        key=lambda x: x.get("event_date", ""),
    )[:15]
    upcoming_events_list = []
    for b in upcoming_sorted:
        total_p = float(b.get("total_price", 0) or 0)
        paid = total_p if b.get("payment_status") == "paid" else 0.0
        pending_amt = round(total_p - paid, 2)
        upcoming_events_list.append(
            {
                "id": b.get("id"),
                "property_id": b.get("property_id"),
                "event_name": (b.get("event_space_name") or "Evento").strip(),
                "client_name": b.get("client_name") or "",
                "event_date": b.get("event_date"),
                "total_price": round(total_p, 2),
                "paid_amount": round(paid, 2),
                "pending_amount": pending_amt,
                "property_name": prop_by_id.get(b.get("property_id"), "—"),
            }
        )

    # Lodging linked to events (assignments scoped by room_property_id)
    assign_q = {"room_property_id": {"$in": hotel_prop_ids}}
    all_assign = await db.event_lodging_assignments.find(assign_q, {"_id": 0}).to_list(10000)
    lodging_summary = {
        "total_assignments": len(all_assign),
        "held_count": sum(1 for a in all_assign if a.get("assignment_status") == "held"),
        "reserved_count": sum(1 for a in all_assign if a.get("assignment_status") == "reserved"),
        "released_count": sum(1 for a in all_assign if a.get("assignment_status") == "released"),
        "cancelled_count": sum(1 for a in all_assign if a.get("assignment_status") == "cancelled"),
        "event_related_rooms_count": sum(
            1 for a in all_assign if a.get("assignment_status") in ("held", "reserved")
        ),
        "estimated_lodging_revenue": 0.0,
        "no_assignments_in_scope": len(all_assign) == 0,
    }
    # Proxy estimate: sum(room.price_per_night * nights) for held/reserved; nights from check_in/out or 1
    active_for_est = [
        a
        for a in all_assign
        if a.get("assignment_status") in ("held", "reserved") and a.get("room_id")
    ]
    if active_for_est:
        room_ids_u = list({a["room_id"] for a in active_for_est})
        rooms_lodg = await db.rooms.find(
            {"id": {"$in": room_ids_u}}, {"_id": 0, "id": 1, "price_per_night": 1}
        ).to_list(len(room_ids_u))
        rmap = {r["id"]: float(r.get("price_per_night", 0) or 0) for r in rooms_lodg}
        est_rev = 0.0
        for a in active_for_est:
            pr = rmap.get(a.get("room_id"), 0.0)
            ci = a.get("check_in_date")
            co = a.get("check_out_date")
            nights = 1
            if ci and co:
                try:
                    d1 = dt_date.fromisoformat(str(ci)[:10])
                    d2 = dt_date.fromisoformat(str(co)[:10])
                    nights = max(1, (d2 - d1).days)
                except ValueError:
                    nights = 1
            est_rev += pr * nights
        lodging_summary["estimated_lodging_revenue"] = round(est_rev, 2)

    # Simple deterministic alerts (max 12)
    alerts = []
    HIGH_PENDING_MXN = 50000.0
    if pending_breakdown["total_pending_amount"] >= HIGH_PENDING_MXN:
        alerts.append(
            {
                "type": "high_pending_balance",
                "severity": "warning",
                "message": f"Saldo pendiente de cobro elevado ({pending_breakdown['total_pending_amount']:,.0f} MXN). Revise cobros de hotel y eventos.",
                "ref_id": None,
            }
        )
    for b in sorted(
        [x for x in event_bookings if x.get("booking_status") != "cancelled" and x.get("event_date", "") >= today_str],
        key=lambda x: x.get("event_date", ""),
    )[:20]:
        if b.get("payment_status") == "pending":
            alerts.append(
                {
                    "type": "upcoming_event_pending_payment",
                    "severity": "warning",
                    "message": f"Evento próximo con pago pendiente: {b.get('client_name', 'Cliente')} ({b.get('event_date', '')})",
                    "ref_id": b.get("id"),
                }
            )
        if not b.get("lodging_integration_enabled", False):
            alerts.append(
                {
                    "type": "upcoming_event_no_lodging",
                    "severity": "info",
                    "message": f"Evento próximo sin integración de hospedaje: {b.get('client_name', 'Cliente')} ({b.get('event_date', '')})",
                    "ref_id": b.get("id"),
                }
            )
        if len(alerts) >= 12:
            break

    chart_labels = {
        "hotel": hotel_name,
        "eventos": garden_name,
    }

    return {
        "properties": properties,
        "hotel": {
            "property_name": hotel_name,
            "property_type": "hotel",
            "revenue_this_month": hotel_revenue_month,
            "revenue_total": hotel_revenue_total,
            "reservations_this_month": len(hotel_res_month),
            "reservations_total": len(hotel_res),
            "occupancy_rate": hotel_occ_rate,
            "total_rooms": hotel_rooms_total,
            "occupied_rooms": hotel_rooms_occupied,
            "pending_payments": hotel_pending_pay,
            "performance_score": hotel_score,
            "expected_revenue": expected_hotel_revenue,
        },
        "event_gardens": {
            "property_name": garden_name,
            "property_type": "event_garden",
            "revenue_this_month": event_revenue_month,
            "revenue_total": event_revenue_total,
            "bookings_this_month": len(event_bookings_month),
            "bookings_total": len(event_bookings),
            "pending_payments": event_pending_pay,
            "upcoming_events": len(upcoming_bookings_future),
            "performance_score": garden_score,
            "expected_revenue": expected_event_revenue,
        },
        "group": {
            "total_revenue_this_month": total_month_revenue,
            "total_revenue_all_time": hotel_revenue_total + event_revenue_total,
            "expected_revenue": expected_total_revenue,
            "revenue_growth_pct": revenue_growth_pct,
            "avg_occupancy_rate": hotel_occ_rate,
            "pending_payments": hotel_pending_pay + event_pending_pay,
            "total_staff": total_staff,
            "revenue_opportunity": revenue_opportunity,
            "today_arrivals": today_arrivals,
            "today_departures": today_departures,
        },
        "revenue_intelligence": {
            "projected_month_revenue": projected_month_revenue,
            "revenue_growth_pct": revenue_growth_pct,
            "last_month_revenue": total_last_month_revenue,
            "revenue_opportunity": revenue_opportunity,
            "top_performing": property_ranking[0] if property_ranking else None,
            "best_hotel": {"name": hotel_name, "type": "hotel",
                           "monthly_revenue": hotel_revenue_month, "score": hotel_score},
            "best_garden": {"name": garden_name, "type": "event_garden",
                            "monthly_revenue": event_revenue_month, "score": garden_score},
            "source_breakdown": source_breakdown,
        },
        "property_ranking": property_ranking,
        "comparison_chart": comparison_chart,
        "chart_labels": chart_labels,
        "pending_breakdown": pending_breakdown,
        "upcoming_events": upcoming_events_list,
        "lodging_summary": lodging_summary,
        "alerts": alerts[:12],
        "scope": {"property_ids": scope_ids},
    }

@api_router.get("/properties/stats")
async def properties_stats(
    _: UserModel = Depends(require_any_module("hotels", "event-gardens", "corporate")),
    current_user: UserModel = Depends(require_role("owner", "manager")),
):
    """Per-property aggregated stats for HotelsOverview and EventGardensOverview (mismo alcance que /corporate/dashboard)."""
    from datetime import date as dt_date
    today_str = dt_date.today().isoformat()
    month_start = dt_date.today().replace(day=1).isoformat()

    scope_ids = await _corporate_scope_property_ids(current_user)
    scope_set = set(scope_ids)

    properties = await db.properties.find({}, {"_id": 0}).to_list(100)
    result = []

    for prop in properties:
        if prop["id"] not in scope_set:
            continue
        if prop["type"] == "hotel":
            hpq = {"property_id": prop["id"]}
            total_rooms = await db.rooms.count_documents(hpq)
            occupied_rooms = await db.rooms.count_documents({**hpq, "status": {"$in": ["occupied", "reserved"]}})
            occupancy_rate = round((occupied_rooms / total_rooms * 100) if total_rooms > 0 else 0, 1)
            month_res = await db.reservations.find(
                {
                    "check_in_date": {"$gte": month_start},
                    "status": {"$nin": ["cancelled"]},
                    "property_id": prop["id"],
                },
                {"_id": 0, "total_amount": 1},
            ).to_list(1000)
            monthly_revenue = sum(r.get("total_amount", 0) for r in month_res)
            pending_payments = await db.reservations.count_documents(
                {
                    "payment_status": "pending",
                    "status": {"$in": ["confirmed", "checked_in"]},
                    "property_id": prop["id"],
                }
            )
            total_res = await db.reservations.count_documents({"property_id": prop["id"]})
            cancelled_res = await db.reservations.count_documents({"status": "cancelled", "property_id": prop["id"]})
            score = calculate_hotel_score(occupancy_rate, pending_payments, total_res, cancelled_res)
            result.append({
                "id": prop["id"], "name": prop["name"], "type": "hotel", "status": prop["status"],
                "description": prop.get("description"), "address": prop.get("address"),
                "total_rooms": total_rooms, "occupied_rooms": occupied_rooms,
                "occupancy_rate": occupancy_rate, "monthly_revenue": monthly_revenue,
                "reservations_this_month": len(month_res), "pending_payments": pending_payments,
                "performance_score": score,
            })
        elif prop["type"] == "event_garden":
            bookings = await db.event_bookings.find(
                {"property_id": prop["id"], "booking_status": {"$ne": "cancelled"}},
                {"_id": 0}).to_list(1000)
            month_bookings = [b for b in bookings if b.get("event_date", "") >= month_start]
            monthly_revenue = sum(b.get("total_price", 0) for b in month_bookings)
            upcoming = [b for b in bookings if b.get("event_date", "") >= today_str]
            pending_payments = sum(1 for b in bookings if b.get("payment_status") == "pending")
            score = calculate_garden_score(len(upcoming), pending_payments, len(bookings))
            result.append({
                "id": prop["id"], "name": prop["name"], "type": "event_garden", "status": prop["status"],
                "description": prop.get("description"), "address": prop.get("address"),
                "events_this_month": len(month_bookings), "monthly_revenue": monthly_revenue,
                "upcoming_events": len(upcoming), "pending_payments": pending_payments,
                "total_events": len(bookings), "performance_score": score,
            })
    return result

# ====================== PUBLIC BOOKING ======================

def calculate_extras_total(extras: ExtrasRequest, adults: int, nights: int) -> float:
    total = 0.0
    if extras.desayuno:
        total += EXTRAS_CATALOG["desayuno"]["price_per_person_per_night"] * adults * nights
    if extras.early_checkin:
        total += EXTRAS_CATALOG["early_checkin"]["price_flat"]
    if extras.late_checkout:
        total += EXTRAS_CATALOG["late_checkout"]["price_flat"]
    return total

def build_extras_summary(extras: ExtrasRequest, adults: int, nights: int) -> list:
    items = []
    if extras.desayuno:
        price = EXTRAS_CATALOG["desayuno"]["price_per_person_per_night"] * adults * nights
        items.append({"name": "Desayuno incluido", "price": price})
    if extras.early_checkin:
        items.append({"name": "Early Check-in (desde las 11am)", "price": EXTRAS_CATALOG["early_checkin"]["price_flat"]})
    if extras.late_checkout:
        items.append({"name": "Late Check-out (hasta las 2pm)", "price": EXTRAS_CATALOG["late_checkout"]["price_flat"]})
    return items

async def find_available_room_of_type(room_type: str, check_in: str, check_out: str) -> dict | None:
    rooms_of_type = await db.rooms.find({"type": room_type, "status": {"$in": ["available", "reserved"]}}, {"_id": 0}).to_list(100)
    for room in rooms_of_type:
        overlapping = await db.reservations.count_documents({
            "room_id": room["id"],
            "status": {"$in": ["confirmed", "checked_in"]},
            "check_in_date": {"$lt": check_out},
            "check_out_date": {"$gt": check_in}
        })
        if overlapping == 0:
            return room
    return None



async def send_booking_confirmation_email(booking_data: dict, booking_ref: str):
    if not RESEND_API_KEY:
        return
    extras_html = ""
    if booking_data.get("extras_items"):
        extras_html = "<p style='margin:4px 0;font-size:14px;color:#666;'><strong>Extras:</strong></p><ul style='margin:4px 0;padding-left:18px;'>"
        for e in booking_data["extras_items"]:
            extras_html += f"<li style='font-size:13px;color:#666;'>{html.escape(str(e['name']))} — ${e['price']:,.0f} MXN</li>"
        extras_html += "</ul>"
    type_label = "Junior Suite" if booking_data.get("room_type") == "junior_suite" else "Habitación Doble"
    html_body = f"""
    <div style="font-family:'Montserrat',Arial,sans-serif;max-width:600px;margin:0 auto;background:#faf8f3;padding:0;">
      <div style="background:linear-gradient(135deg,#625746,#917a6a);padding:40px 32px;text-align:center;">
        <p style="color:#d2c7b6;font-size:11px;letter-spacing:0.3em;margin:0 0 8px;">ALMA HOTEL BOUTIQUE</p>
        <h1 style="color:#fcf5e0;font-size:32px;font-weight:300;margin:0;letter-spacing:0.02em;font-family:Georgia,serif;">Reserva Confirmada</h1>
      </div>
      <div style="padding:32px;">
        <p style="color:#625746;font-size:15px;margin:0 0 20px;">Estimado/a <strong>{html.escape(booking_data['first_name'])} {html.escape(booking_data['last_name'])}</strong>,</p>
        <p style="color:#666;font-size:14px;margin:0 0 24px;line-height:1.6;">Nos complace confirmar su reserva. A continuación encontrará el resumen de su estancia:</p>
        <div style="background:#fff;border:1px solid #e8dfd5;border-radius:12px;padding:24px;margin-bottom:20px;">
          <p style="color:#917a6a;font-size:11px;letter-spacing:0.15em;margin:0 0 12px;font-weight:600;">DETALLES DE LA RESERVA</p>
          <table style="width:100%;border-collapse:collapse;">
            <tr><td style="padding:6px 0;color:#666;font-size:13px;">Referencia</td><td style="padding:6px 0;color:#625746;font-size:13px;font-weight:600;text-align:right;">#{html.escape(booking_ref)}</td></tr>
            <tr><td style="padding:6px 0;color:#666;font-size:13px;">Habitación</td><td style="padding:6px 0;color:#625746;font-size:13px;font-weight:600;text-align:right;">{html.escape(str(booking_data.get('room_number','—')))} · {html.escape(type_label)}</td></tr>
            <tr><td style="padding:6px 0;color:#666;font-size:13px;">Check-in</td><td style="padding:6px 0;color:#625746;font-size:13px;font-weight:600;text-align:right;">{html.escape(booking_data['check_in_date'])}</td></tr>
            <tr><td style="padding:6px 0;color:#666;font-size:13px;">Check-out</td><td style="padding:6px 0;color:#625746;font-size:13px;font-weight:600;text-align:right;">{html.escape(booking_data['check_out_date'])}</td></tr>
            <tr><td style="padding:6px 0;color:#666;font-size:13px;">Huéspedes</td><td style="padding:6px 0;color:#625746;font-size:13px;font-weight:600;text-align:right;">{booking_data['adults']} adultos{', '+str(booking_data['children'])+' niños' if booking_data.get('children') else ''}</td></tr>
            <tr style="border-top:1px solid #e8dfd5;"><td style="padding:10px 0 4px;color:#625746;font-size:14px;font-weight:700;">Total</td><td style="padding:10px 0 4px;color:#625746;font-size:16px;font-weight:700;text-align:right;">${booking_data['total_amount']:,.0f} MXN</td></tr>
          </table>
          {extras_html}
        </div>
        <p style="color:#666;font-size:13px;line-height:1.6;margin:0 0 24px;">Para cualquier consulta o solicitud especial, no dude en contactarnos directamente. Será un placer atenderle.</p>
        <div style="text-align:center;margin-top:24px;padding-top:20px;border-top:1px solid #e8dfd5;">
          <p style="color:#c8b8a8;font-size:11px;letter-spacing:0.1em;margin:0;">© 2025 ALMA HOTEL BOUTIQUE · Todos los derechos reservados</p>
        </div>
      </div>
    </div>"""
    try:
        recipients = [booking_data["email"]]
        if HOTEL_NOTIFICATION_EMAIL:
            recipients.append(HOTEL_NOTIFICATION_EMAIL)
        params = {"from": SENDER_EMAIL, "to": recipients, "subject": f"Reserva Confirmada #{booking_ref} — Alma Hotel Boutique", "html": html_body}
        await asyncio.to_thread(resend.Emails.send, params)
    except Exception as e:
        logger.error(f"Email error: {e}")

@api_router.get("/public/booking/lookup")
@limiter.limit("10/minute")
async def lookup_booking(request: Request, booking_ref: str, email: str):
    match = await db.reservations.find_one(
        {"id": {"$regex": f"^{re.escape(booking_ref.lower())}"},
         "guest_name": {"$exists": True}},
        {"_id": 0}
    )
    if not match:
        raise HTTPException(status_code=404, detail="Reserva no encontrada")
    guest = await db.guests.find_one({"id": match["guest_id"]}, {"_id": 0})
    guest_email = guest.get("email", "") if guest else ""
    if guest_email.lower() != email.lower():
        raise HTTPException(status_code=404, detail="No se encontró ninguna reserva con esos datos")
    type_label = "Junior Suite" if match.get("room_type_hint") == "junior_suite" else None
    room = await db.rooms.find_one({"id": match["room_id"]}, {"_id": 0})
    if room:
        type_label = "Junior Suite" if room["type"] == "junior_suite" else "Habitación Doble"
    status_labels = {"confirmed": "Confirmada", "checked_in": "En Hotel", "checked_out": "Finalizada", "cancelled": "Cancelada"}
    payment_labels = {"paid": "Pagado", "pending": "Pendiente (pagar en hotel)"}
    return {
        "booking_ref": booking_ref.upper(),
        "guest_name": match["guest_name"],
        "room_number": match["room_number"],
        "room_type_label": type_label or "Habitación",
        "check_in_date": match["check_in_date"],
        "check_out_date": match["check_out_date"],
        "adults": match["adults"],
        "children": match.get("children", 0),
        "total_amount": match["total_amount"],
        "status": match["status"],
        "status_label": status_labels.get(match["status"], match["status"]),
        "payment_status": match.get("payment_status", "paid"),
        "payment_label": payment_labels.get(match.get("payment_status", "paid"), "—"),
        "notes": match.get("notes", ""),
    }

@api_router.get("/public/availability")
@limiter.limit("20/minute")
async def check_availability(request: Request, check_in: str, check_out: str, adults: int = 2):
    from datetime import date as dt_date
    try:
        ci = dt_date.fromisoformat(check_in)
        co = dt_date.fromisoformat(check_out)
        nights = (co - ci).days
        if nights <= 0:
            raise HTTPException(status_code=400, detail="Fechas inválidas")
    except ValueError:
        raise HTTPException(status_code=400, detail="Formato de fecha inválido")
    results = []
    for rtype, type_label, base_price in [("junior_suite", "Junior Suite", 2500), ("double", "Habitación Doble", 1500)]:
        all_of_type = await db.rooms.find({"type": rtype}, {"_id": 0}).to_list(100)
        available_count = 0
        for room in all_of_type:
            overlapping = await db.reservations.count_documents({
                "room_id": room["id"], "status": {"$in": ["confirmed", "checked_in"]},
                "check_in_date": {"$lt": check_out}, "check_out_date": {"$gt": check_in}
            })
            if overlapping == 0:
                available_count += 1
        results.append({"type": rtype, "label": type_label, "price_per_night": base_price,
                         "total_price": base_price * nights, "nights": nights,
                         "available_count": available_count, "available": available_count > 0})
    return results

@api_router.post("/public/booking/create")
@limiter.limit("5/minute")
async def create_public_booking(request: Request, data: PublicBookingCreate):
    from datetime import date as dt_date
    ci = dt_date.fromisoformat(data.check_in_date)
    co = dt_date.fromisoformat(data.check_out_date)
    nights = (co - ci).days
    if nights <= 0:
        raise HTTPException(status_code=400, detail="Fechas inválidas")
    room = await find_available_room_of_type(data.room_type, data.check_in_date, data.check_out_date)
    if not room:
        raise HTTPException(status_code=409, detail="No hay habitaciones disponibles para esas fechas")
    await _ensure_hotel_room_inventory_for_booking(room)
    room_price = room["price_per_night"] * nights
    extras_total = calculate_extras_total(data.extras, data.adults, nights)
    total_amount = room_price + extras_total
    guest = await db.guests.find_one({"email": data.email}, {"_id": 0})
    if not guest:
        guest_obj = GuestModel(first_name=data.first_name, last_name=data.last_name,
                               email=data.email, phone=data.phone, id_number=data.id_number)
        await db.guests.insert_one(guest_obj.model_dump())
        guest = guest_obj.model_dump()
    system_user = await db.users.find_one({"role": "manager"}, {"_id": 0})
    created_by = system_user["id"] if system_user else "public"
    reservation = ReservationModel(
        guest_id=guest["id"], guest_name=f"{data.first_name} {data.last_name}",
        room_id=room["id"], room_number=room["number"],
        check_in_date=data.check_in_date, check_out_date=data.check_out_date,
        total_amount=total_amount, adults=data.adults, children=data.children,
        notes=data.special_requests or "", created_by=created_by, status="confirmed",
        payment_status="pending" if data.payment_method == "at_hotel" else "paid",
        payment_source="public_portal",
        reservation_source="web",
        event_name=data.event_name or None)
    await db.reservations.insert_one(reservation.model_dump())
    await db.rooms.update_one({"id": room["id"]}, {"$set": {"status": "reserved"}})
    booking_ref = reservation.id[:8].upper()
    extras_items = build_extras_summary(data.extras, data.adults, nights)
    asyncio.create_task(send_booking_confirmation_email({
        "first_name": data.first_name, "last_name": data.last_name,
        "email": data.email, "room_type": data.room_type, "room_number": room["number"],
        "check_in_date": data.check_in_date, "check_out_date": data.check_out_date,
        "adults": data.adults, "children": data.children, "total_amount": total_amount,
        "extras_items": extras_items
    }, booking_ref))
    return {"booking_ref": booking_ref, "reservation_id": reservation.id,
            "room_number": room["number"], "room_type": data.room_type,
            "total_amount": total_amount, "nights": nights, "extras_items": extras_items,
            "check_in_date": data.check_in_date, "check_out_date": data.check_out_date}

@api_router.post("/public/checkout/session")
@limiter.limit("5/minute")
async def create_public_checkout(data: dict, request: Request):
    if StripeCheckout is None or CheckoutSessionRequest is None:
        raise HTTPException(
            status_code=503,
            detail="Stripe checkout no disponible en este entorno. Instale emergentintegrations para habilitar pagos.",
        )
    pending_id = data.get("pending_id")
    pending = await db.pending_bookings.find_one({"id": pending_id}, {"_id": 0})
    if not pending:
        raise HTTPException(status_code=404, detail="Reserva pendiente no encontrada")
    origin_url = data.get("origin_url", str(request.base_url).rstrip("/"))
    success_url = f"{origin_url}/reservar?session_id={{CHECKOUT_SESSION_ID}}"
    cancel_url = f"{origin_url}/reservar?cancelled=1"
    stripe = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=f"{str(request.base_url).rstrip('/')}/api/webhook/stripe")
    session = await stripe.create_checkout_session(CheckoutSessionRequest(
        amount=float(pending["total_amount"]), currency="mxn",
        success_url=success_url, cancel_url=cancel_url,
        metadata={"pending_id": pending_id, "guest_email": pending["email"]}))
    tx = PaymentTransactionModel(session_id=session.session_id, amount=pending["total_amount"],
                                  currency="mxn", payment_status="initiated",
                                  metadata={"pending_id": pending_id})
    await db.payment_transactions.insert_one(tx.model_dump())
    return {"url": session.url, "session_id": session.session_id}

@api_router.post("/public/booking/pending")
async def create_pending_booking(data: PublicBookingCreate):
    from datetime import date as dt_date
    ci = dt_date.fromisoformat(data.check_in_date)
    co = dt_date.fromisoformat(data.check_out_date)
    nights = (co - ci).days
    if nights <= 0:
        raise HTTPException(status_code=400, detail="Fechas inválidas")
    room = await find_available_room_of_type(data.room_type, data.check_in_date, data.check_out_date)
    if not room:
        raise HTTPException(status_code=409, detail="No hay habitaciones disponibles para esas fechas")
    await _ensure_hotel_room_inventory_for_booking(room)
    room_price = room["price_per_night"] * nights
    extras_total = calculate_extras_total(data.extras, data.adults, nights)
    total_amount = room_price + extras_total
    pending = PendingBookingModel(
        check_in_date=data.check_in_date, check_out_date=data.check_out_date,
        adults=data.adults, children=data.children, room_type=data.room_type,
        extras=data.extras.model_dump(), first_name=data.first_name, last_name=data.last_name,
        email=data.email, phone=data.phone, id_number=data.id_number,
        special_requests=data.special_requests, total_amount=total_amount, nights=nights)
    await db.pending_bookings.insert_one(pending.model_dump())
    return {"pending_id": pending.id, "total_amount": total_amount, "nights": nights,
            "room_number": room["number"]}

@api_router.get("/public/checkout/status/{session_id}")
async def get_checkout_status_public(session_id: str, request: Request):
    if StripeCheckout is None:
        raise HTTPException(
            status_code=503,
            detail="Stripe no disponible en este entorno. Instale emergentintegrations para habilitar pagos.",
        )
    tx = await db.payment_transactions.find_one({"session_id": session_id}, {"_id": 0})
    if not tx:
        raise HTTPException(status_code=404, detail="Transacción no encontrada")
    if tx.get("payment_status") == "paid":
        return {"status": "paid", "booking_ref": tx.get("booking_ref"), "reservation_id": tx.get("booking_id")}
    stripe = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=f"{str(request.base_url).rstrip('/')}/api/webhook/stripe")
    checkout_status = await stripe.get_checkout_status(session_id)
    if checkout_status.payment_status == "paid":
        already_done = await db.payment_transactions.find_one({"session_id": session_id, "payment_status": "paid"})
        if already_done:
            return {"status": "paid", "booking_ref": already_done.get("booking_ref"), "reservation_id": already_done.get("booking_id")}
        pending_id = tx["metadata"].get("pending_id")
        pending = await db.pending_bookings.find_one({"id": pending_id}, {"_id": 0})
        if pending:
            room = await find_available_room_of_type(pending["room_type"], pending["check_in_date"], pending["check_out_date"])
            if room:
                await _ensure_hotel_room_inventory_for_booking(room)
                system_user = await db.users.find_one({"role": "manager"}, {"_id": 0})
                created_by = system_user["id"] if system_user else "public"
                guest = await db.guests.find_one({"email": pending["email"]}, {"_id": 0})
                if not guest:
                    guest_obj = GuestModel(first_name=pending["first_name"], last_name=pending["last_name"],
                                           email=pending["email"], phone=pending["phone"], id_number=pending.get("id_number"))
                    await db.guests.insert_one(guest_obj.model_dump())
                    guest = guest_obj.model_dump()
                reservation = ReservationModel(
                    guest_id=guest["id"], guest_name=f"{pending['first_name']} {pending['last_name']}",
                    room_id=room["id"], room_number=room["number"],
                    check_in_date=pending["check_in_date"], check_out_date=pending["check_out_date"],
                    total_amount=pending["total_amount"], adults=pending["adults"], children=pending["children"],
                    notes=pending.get("special_requests") or "", created_by=created_by, status="confirmed")
                await db.reservations.insert_one(reservation.model_dump())
                await db.rooms.update_one({"id": room["id"]}, {"$set": {"status": "reserved"}})
                booking_ref = reservation.id[:8].upper()
                extras_obj = ExtrasRequest(**pending.get("extras", {}))
                extras_items = build_extras_summary(extras_obj, pending["adults"], pending["nights"])
                await db.payment_transactions.update_one({"session_id": session_id},
                    {"$set": {"payment_status": "paid", "booking_id": reservation.id, "booking_ref": booking_ref}})
                asyncio.create_task(send_booking_confirmation_email({
                    "first_name": pending["first_name"], "last_name": pending["last_name"],
                    "email": pending["email"], "room_type": pending["room_type"], "room_number": room["number"],
                    "check_in_date": pending["check_in_date"], "check_out_date": pending["check_out_date"],
                    "adults": pending["adults"], "children": pending["children"],
                    "total_amount": pending["total_amount"], "extras_items": extras_items
                }, booking_ref))
                return {"status": "paid", "booking_ref": booking_ref, "reservation_id": reservation.id}
    await db.payment_transactions.update_one({"session_id": session_id},
        {"$set": {"payment_status": checkout_status.payment_status}})
    return {"status": checkout_status.status, "payment_status": checkout_status.payment_status}

@api_router.post("/webhook/stripe")
async def stripe_webhook(request: Request):
    if StripeCheckout is None:
        # Webhook called but Stripe integration not available (e.g. local dev); acknowledge to avoid Stripe retries
        return {"received": True}
    # Signature verification: body and Stripe-Signature header are passed to the integration library.
    # In production, configure STRIPE_WEBHOOK_SECRET (or the secret your Stripe dashboard shows for this endpoint)
    # so that the library can verify webhook authenticity; the library may read it from env or accept it as an argument.
    body = await request.body()
    stripe = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=f"{str(request.base_url).rstrip('/')}/api/webhook/stripe")
    try:
        event = await stripe.handle_webhook(body, request.headers.get("Stripe-Signature"))
        if event.payment_status == "paid":
            await db.payment_transactions.update_one(
                {"session_id": event.session_id}, {"$set": {"payment_status": "paid"}})
    except Exception as e:
        logger.error(f"Webhook error: {e}")
    return {"received": True}

# ====================== STARTUP ======================

# ====================== SAAS PLATFORM ENDPOINTS ======================

# --- Tenants ---
@api_router.get("/tenants")
async def list_tenants(current_user: UserModel = Depends(require_role("platform_admin", "manager", "owner"))):
    return await db.tenants.find({}, {"_id": 0}).to_list(100)

@api_router.post("/tenants")
async def create_tenant(data: TenantCreate, current_user: UserModel = Depends(require_role("platform_admin"))):
    t = TenantModel(**data.model_dump())
    await db.tenants.insert_one(t.model_dump())
    return t.model_dump()

@api_router.patch("/tenants/{tenant_id}")
async def update_tenant(tenant_id: str, data: dict, current_user: UserModel = Depends(require_role("platform_admin"))):
    await db.tenants.update_one({"id": tenant_id}, {"$set": data})
    t = await db.tenants.find_one({"id": tenant_id}, {"_id": 0})
    if not t: raise HTTPException(status_code=404, detail="Tenant no encontrado")
    return t

@api_router.get("/tenants/{tenant_id}")
async def get_tenant(tenant_id: str, current_user: UserModel = Depends(require_role("platform_admin", "manager", "owner"))):
    t = await db.tenants.find_one({"id": tenant_id}, {"_id": 0})
    if not t: raise HTTPException(status_code=404, detail="Tenant no encontrado")
    return t

@api_router.delete("/tenants/{tenant_id}")
async def delete_tenant(tenant_id: str, current_user: UserModel = Depends(require_role("platform_admin"))):
    # Check if tenant has properties assigned
    props = await db.properties.count_documents({"tenant_id": tenant_id})
    if props > 0:
        raise HTTPException(status_code=400, detail=f"No se puede eliminar: el tenant tiene {props} propiedad(es) asignada(s). Desasígnalas primero.")
    await db.tenants.delete_one({"id": tenant_id})
    return {"deleted": True}

# --- Room Types ---
@api_router.get("/room-types")
async def list_room_types(current_user: UserModel = Depends(get_current_user)):
    return await db.room_types.find({}, {"_id": 0}).to_list(100)

@api_router.post("/room-types")
async def create_room_type(data: RoomTypeCreate, current_user: UserModel = Depends(require_role("platform_admin", "manager"))):
    rt = RoomTypeModel(**data.model_dump())
    await db.room_types.insert_one(rt.model_dump())
    return rt.model_dump()

@api_router.patch("/room-types/{rt_id}")
async def update_room_type(rt_id: str, data: dict, current_user: UserModel = Depends(require_role("platform_admin", "manager"))):
    await db.room_types.update_one({"id": rt_id}, {"$set": data})
    rt = await db.room_types.find_one({"id": rt_id}, {"_id": 0})
    if not rt: raise HTTPException(status_code=404, detail="Tipo de habitación no encontrado")
    return rt

@api_router.delete("/room-types/{rt_id}")
async def delete_room_type(rt_id: str, current_user: UserModel = Depends(require_role("platform_admin", "manager"))):
    await db.room_types.delete_one({"id": rt_id})
    return {"deleted": True}

# --- Amenities Catalog ---
@api_router.get("/amenities")
async def list_amenities(current_user: UserModel = Depends(get_current_user)):
    return await db.amenities.find({}, {"_id": 0}).to_list(200)

@api_router.post("/amenities")
async def create_amenity(data: AmenityCreate, current_user: UserModel = Depends(require_role("platform_admin", "manager"))):
    a = AmenityModel(**data.model_dump())
    if await db.amenities.find_one({"id": a.id}):
        raise HTTPException(status_code=400, detail="Amenidad ya existe")
    await db.amenities.insert_one(a.model_dump())
    return {k: v for k, v in a.model_dump().items() if k != "_id"}

@api_router.delete("/amenities/{amenity_id}")
async def delete_amenity(amenity_id: str, current_user: UserModel = Depends(require_role("platform_admin"))):
    await db.amenities.delete_one({"id": amenity_id})
    return {"deleted": True}

# --- Role Permissions ---
@api_router.get("/role-permissions")
async def get_all_role_permissions(current_user: UserModel = Depends(require_role("platform_admin", "manager"))):
    perms = await db.role_permissions.find({}, {"_id": 0}).to_list(20)
    result = dict(DEFAULT_ROLE_PERMISSIONS)
    for p in perms:
        result[p["role"]] = p["modules"]
    return result

@api_router.put("/role-permissions/{role}")
async def update_role_permissions(role: str, data: RolePermissionUpdate,
                                   current_user: UserModel = Depends(require_role("platform_admin"))):
    if role not in DEFAULT_ROLE_PERMISSIONS:
        raise HTTPException(status_code=400, detail="Rol inválido")
    await db.role_permissions.update_one(
        {"role": role},
        {"$set": {"role": role, "modules": data.modules, "updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True
    )
    return {"role": role, "modules": data.modules}

# --- Platform Stats ---
@api_router.get("/platform/stats")
async def platform_stats(current_user: UserModel = Depends(require_role("platform_admin"))):
    tenants_all = await db.tenants.find({}, {"_id": 0}).to_list(None)
    properties_all = await db.properties.find({}, {"_id": 0, "type": 1, "status": 1}).to_list(None)
    users = await db.users.count_documents({"is_active": True})
    rooms = await db.rooms.count_documents({})
    room_types = await db.room_types.count_documents({})
    reservations = await db.reservations.count_documents({})
    event_bookings = await db.event_bookings.count_documents({})

    PLAN_DEFAULT_PRICES = {'standard': 299, 'premium': 599, 'enterprise': 1499}
    tenants_active = sum(1 for t in tenants_all if t.get('tenant_status', 'Activo') not in ['Suspendido', 'Inactivo'])
    tenants_suspended = sum(1 for t in tenants_all if t.get('tenant_status', 'Activo') == 'Suspendido')
    billing_vencido = sum(1 for t in tenants_all if t.get('billing_status') == 'Vencido')
    billing_por_vencer = sum(1 for t in tenants_all if t.get('billing_status') == 'Próximo a vencer')
    mrr = int(sum(
        t.get('plan_price') or PLAN_DEFAULT_PRICES.get(t.get('plan', 'standard'), 299)
        for t in tenants_all
        if t.get('tenant_status', 'Activo') not in ['Suspendido', 'Inactivo']
    ))

    return {
        "tenants": len(tenants_all),
        "properties": len(properties_all),
        "hotels": sum(1 for p in properties_all if p.get('type') == 'hotel' and p.get('status') == 'active'),
        "gardens": sum(1 for p in properties_all if p.get('type') == 'event_garden' and p.get('status') == 'active'),
        "users": users, "rooms": rooms, "room_types": room_types,
        "reservations": reservations, "event_bookings": event_bookings,
        "tenants_active": tenants_active,
        "tenants_suspended": tenants_suspended,
        "billing_vencido": billing_vencido,
        "billing_por_vencer": billing_por_vencer,
        "mrr": mrr,
    }

# --- Platform Onboarding ---
@api_router.post("/platform/onboard")
async def onboard_property(data: dict, current_user: UserModel = Depends(require_role("platform_admin"))):
    """Full property onboarding wizard — creates property, rooms/spaces, and team accounts."""
    property_type = data.get("property_type", "hotel")
    name = data.get("name", "Nueva Propiedad")
    tenant_id = data.get("tenant_id")

    # 1. Create property
    prop = PropertyModel(
        name=name, type=property_type, status="active",
        description=data.get("description"), address=data.get("address"),
        tenant_id=tenant_id)
    await db.properties.insert_one(prop.model_dump())

    created_rooms = 0
    created_spaces = 0
    created_users = []

    if property_type == "hotel":
        num_floors = int(data.get("num_floors", 2))
        num_rooms_per_floor = int(data.get("num_rooms_per_floor", 5))
        room_types_config = data.get("room_types_config", [])
        room_number = 101
        for floor in range(1, num_floors + 1):
            for r in range(1, num_rooms_per_floor + 1):
                rt_id = None; price = 1200.0; rt_name = "Estándar"
                if room_types_config:
                    rt_conf = room_types_config[(r - 1) % len(room_types_config)]
                    rt_id = rt_conf.get("room_type_id")
                    if rt_id:
                        rt_doc = await db.room_types.find_one({"id": rt_id}, {"_id": 0})
                        if rt_doc:
                            price = rt_doc.get("base_price", price)
                            rt_name = rt_doc.get("name", rt_name)
                room_doc = {
                    "id": str(uuid.uuid4()), "number": str(room_number),
                    "type": rt_name, "floor": floor, "status": "available",
                    "amenities": ["WiFi", "TV", "Baño Privado"],
                    "price_per_night": price, "capacity": 2,
                    "description": f"Habitación {room_number}",
                    "room_type_id": rt_id, "property_id": prop.id,
                    "created_at": datetime.now(timezone.utc).isoformat(),
                }
                await db.rooms.insert_one(room_doc)
                created_rooms += 1
                room_number += 1

    elif property_type == "event_garden":
        for s in data.get("spaces", []):
            space = EventSpaceModel(
                property_id=prop.id, space_name=s.get("space_name", "Espacio"),
                capacity=int(s.get("capacity", 100)),
                price_per_event=float(s.get("price_per_event", 10000.0)),
                description=s.get("description"), status="available")
            await db.event_spaces.insert_one(space.model_dump())
            created_spaces += 1

    # Create owner account
    if data.get("owner_email") and data.get("owner_name"):
        if not await db.users.find_one({"email": data["owner_email"]}):
            owner_pwd = secrets.token_urlsafe(12)
            owner_user = UserModel(
                name=data["owner_name"], email=data["owner_email"],
                password_hash=hash_password(owner_pwd), role="owner",
                department="Dirección", avatar_color="#8B5CF6",
                force_password_change=True)
            await db.users.insert_one(owner_user.model_dump())
            created_users.append({"role": "owner", "email": data["owner_email"], "temp_password": owner_pwd})

    # Create manager account (onboarding contact for the property)
    if data.get("admin_email") and data.get("admin_name"):
        if not await db.users.find_one({"email": data["admin_email"]}):
            mgr_pwd = secrets.token_urlsafe(12)
            mgr_user = UserModel(
                name=data["admin_name"], email=data["admin_email"],
                password_hash=hash_password(mgr_pwd), role="manager",
                department="Administración", avatar_color="#059669",
                force_password_change=True)
            await db.users.insert_one(mgr_user.model_dump())
            created_users.append({"role": "manager", "email": data["admin_email"], "temp_password": mgr_pwd})

    return {
        "success": True, "property_id": prop.id, "property_name": prop.name,
        "property_type": property_type, "created_rooms": created_rooms,
        "created_spaces": created_spaces, "created_users": created_users,
    }

# --- Feature Toggles ---
@api_router.get("/properties/{prop_id}/features")
async def get_features(
    prop_id: str, current_user: UserModel = Depends(require_module("properties"))
):
    prop = await db.properties.find_one({"id": prop_id}, {"_id": 0, "id": 1, "feature_toggles": 1})
    if prop is None: raise HTTPException(status_code=404, detail="Propiedad no encontrada")
    return prop.get("feature_toggles", {
        "inbox": True, "tasks": True, "reports": True,
        "public_catalog": True, "online_booking": True,
        "payments": True, "analytics_dashboard": True
    })

@api_router.patch("/properties/{prop_id}/features")
async def update_features(
    prop_id: str,
    features: dict,
    _: UserModel = Depends(require_module("properties")),
    current_user: UserModel = Depends(require_role("manager", "platform_admin")),
):
    await db.properties.update_one({"id": prop_id}, {"$set": {"feature_toggles": features}})
    return features

# ====================== APP STARTUP ======================

async def ensure_indexes():
    await db.reservations.create_index([("id", 1)],                             unique=True, name="res_id_unique")
    await db.reservations.create_index([("property_id", 1), ("status", 1)],                  name="res_prop_status")
    await db.reservations.create_index([("property_id", 1), ("check_in_date", 1)],           name="res_prop_checkin")
    await db.reservations.create_index([("guest_id", 1)],                                    name="res_guest")
    await db.reservations.create_index([("status", 1)],                                      name="res_status")
    await db.rooms.create_index([("id", 1)],                                    unique=True, name="room_id_unique")
    await db.rooms.create_index([("property_id", 1), ("status", 1)],                         name="room_prop_status")
    await db.rooms.create_index([("property_id", 1)],                                        name="room_prop")
    await db.users.create_index([("email", 1)],                                 unique=True, name="user_email_unique")
    await db.users.create_index([("id", 1)],                                    unique=True, name="user_id_unique")
    await db.users.create_index([("tenant_id", 1)],                                          name="user_tenant")
    await db.guests.create_index([("id", 1)],                                   unique=True, name="guest_id_unique")
    await db.guests.create_index([("email", 1)],                                             name="guest_email")
    await db.guests.create_index([("tenant_id", 1)],                                         name="guest_tenant")
    await db.properties.create_index([("id", 1)],                               unique=True, name="prop_id_unique")
    await db.properties.create_index([("tenant_id", 1)],                                     name="prop_tenant")
    await db.event_bookings.create_index([("id", 1)],                           unique=True, name="evbooking_id_unique")
    await db.event_bookings.create_index([("property_id", 1)],                               name="evbooking_prop")
    await db.payment_transactions.create_index([("reservation_id", 1)],                      name="pay_reservation")
    await db.password_reset_tokens.create_index([("token", 1)],        unique=True,           name="prt_token_unique")
    await db.password_reset_tokens.create_index([("expires_at", 1)],   expireAfterSeconds=0,  name="prt_ttl")

@app.on_event("startup")
async def startup():
    await run_all()
    await ensure_indexes()

@app.on_event("shutdown")
async def shutdown(): client.close()

app.include_router(api_router)
app.include_router(messages_router, prefix="/api")
app.include_router(tasks_router, prefix="/api")
app.include_router(users_router, prefix="/api")
app.include_router(auth_router, prefix="/api")
app.include_router(rooms_router, prefix="/api")
app.include_router(guests_router, prefix="/api")
app.include_router(event_lodging_router, prefix="/api")
app.include_router(reservations_router, prefix="/api")
app.include_router(reports_router, prefix="/api")
app.add_middleware(CORSMiddleware, allow_credentials=True,
                   allow_origins=CORS_ORIGINS_LIST,
                   allow_methods=["*"], allow_headers=["*"])
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

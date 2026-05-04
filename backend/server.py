import logging

from fastapi import FastAPI, APIRouter, HTTPException, Depends
from slowapi.errors import RateLimitExceeded
from slowapi import _rate_limit_exceeded_handler
from starlette.middleware.cors import CORSMiddleware
from typing import Optional

from auth import require_any_module, require_role
from config import CORS_ORIGINS_LIST
from db import client, db
from models import EventBookingCreate, EventBookingModel, UserModel
from rate_limit import limiter
from routers import (
    ai_router,
    amenities_router,
    auth_router,
    corporate_router,
    event_lodging_router,
    event_spaces_router,
    features_router,
    guests_router,
    hotel_spaces_router,
    messages_router,
    onboarding_router,
    properties_router,
    public_booking_router,
    reports_router,
    reservations_router,
    role_permissions_router,
    room_types_router,
    rooms_router,
    tasks_router,
    tenants_router,
    users_router,
)
from seeds import run_all

app = FastAPI()
api_router = APIRouter(prefix="/api")

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
    if not b:
        raise HTTPException(status_code=404, detail="Reserva de evento no encontrada")
    return b


@api_router.delete("/event-bookings/{booking_id}")
async def delete_event_booking(
    booking_id: str,
    _: UserModel = Depends(require_any_module("jardines", "hotel-events")),
    current_user: UserModel = Depends(require_role("manager", "receptionist")),
):
    await db.event_bookings.delete_one({"id": booking_id})
    return {"deleted": True}


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

    PLAN_DEFAULT_PRICES = {"standard": 299, "premium": 599, "enterprise": 1499}
    tenants_active = sum(1 for t in tenants_all if t.get("tenant_status", "Activo") not in ["Suspendido", "Inactivo"])
    tenants_suspended = sum(1 for t in tenants_all if t.get("tenant_status", "Activo") == "Suspendido")
    billing_vencido = sum(1 for t in tenants_all if t.get("billing_status") == "Vencido")
    billing_por_vencer = sum(1 for t in tenants_all if t.get("billing_status") == "Próximo a vencer")
    mrr = int(
        sum(
            t.get("plan_price") or PLAN_DEFAULT_PRICES.get(t.get("plan", "standard"), 299)
            for t in tenants_all
            if t.get("tenant_status", "Activo") not in ["Suspendido", "Inactivo"]
        )
    )

    return {
        "tenants": len(tenants_all),
        "properties": len(properties_all),
        "hotels": sum(1 for p in properties_all if p.get("type") == "hotel" and p.get("status") == "active"),
        "gardens": sum(1 for p in properties_all if p.get("type") == "event_garden" and p.get("status") == "active"),
        "users": users,
        "rooms": rooms,
        "room_types": room_types,
        "reservations": reservations,
        "event_bookings": event_bookings,
        "tenants_active": tenants_active,
        "tenants_suspended": tenants_suspended,
        "billing_vencido": billing_vencido,
        "billing_por_vencer": billing_por_vencer,
        "mrr": mrr,
    }


async def ensure_indexes():
    await db.reservations.create_index([("id", 1)], unique=True, name="res_id_unique")
    await db.reservations.create_index([("property_id", 1), ("status", 1)], name="res_prop_status")
    await db.reservations.create_index([("property_id", 1), ("check_in_date", 1)], name="res_prop_checkin")
    await db.reservations.create_index([("guest_id", 1)], name="res_guest")
    await db.reservations.create_index([("status", 1)], name="res_status")
    await db.rooms.create_index([("id", 1)], unique=True, name="room_id_unique")
    await db.rooms.create_index([("property_id", 1), ("status", 1)], name="room_prop_status")
    await db.rooms.create_index([("property_id", 1)], name="room_prop")
    await db.users.create_index([("email", 1)], unique=True, name="user_email_unique")
    await db.users.create_index([("id", 1)], unique=True, name="user_id_unique")
    await db.users.create_index([("tenant_id", 1)], name="user_tenant")
    await db.guests.create_index([("id", 1)], unique=True, name="guest_id_unique")
    await db.guests.create_index([("email", 1)], name="guest_email")
    await db.guests.create_index([("tenant_id", 1)], name="guest_tenant")
    await db.properties.create_index([("id", 1)], unique=True, name="prop_id_unique")
    await db.properties.create_index([("tenant_id", 1)], name="prop_tenant")
    await db.event_bookings.create_index([("id", 1)], unique=True, name="evbooking_id_unique")
    await db.event_bookings.create_index([("property_id", 1)], name="evbooking_prop")
    await db.payment_transactions.create_index([("reservation_id", 1)], name="pay_reservation")
    await db.password_reset_tokens.create_index([("token", 1)], unique=True, name="prt_token_unique")
    await db.password_reset_tokens.create_index([("expires_at", 1)], expireAfterSeconds=0, name="prt_ttl")


@app.on_event("startup")
async def startup():
    await run_all()
    await ensure_indexes()


@app.on_event("shutdown")
async def shutdown():
    client.close()


app.include_router(api_router)
app.include_router(properties_router, prefix="/api")
app.include_router(tenants_router, prefix="/api")
app.include_router(public_booking_router, prefix="/api")
app.include_router(event_spaces_router, prefix="/api")
app.include_router(hotel_spaces_router, prefix="/api")
app.include_router(amenities_router, prefix="/api")
app.include_router(room_types_router, prefix="/api")
app.include_router(role_permissions_router, prefix="/api")
app.include_router(onboarding_router, prefix="/api")
app.include_router(corporate_router, prefix="/api")
app.include_router(ai_router, prefix="/api")
app.include_router(features_router, prefix="/api")
app.include_router(messages_router, prefix="/api")
app.include_router(tasks_router, prefix="/api")
app.include_router(users_router, prefix="/api")
app.include_router(auth_router, prefix="/api")
app.include_router(rooms_router, prefix="/api")
app.include_router(guests_router, prefix="/api")
app.include_router(event_lodging_router, prefix="/api")
app.include_router(reservations_router, prefix="/api")
app.include_router(reports_router, prefix="/api")
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=CORS_ORIGINS_LIST,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

logging.basicConfig(level=logging.INFO)

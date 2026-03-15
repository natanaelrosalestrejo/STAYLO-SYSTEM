from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, Request
from fastapi.security import OAuth2PasswordBearer
from starlette.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Optional, Dict
from datetime import datetime, timezone, timedelta
import logging, uuid, json, re, random, asyncio
from pathlib import Path
from passlib.context import CryptContext
from jose import JWTError, jwt
import resend

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
    ALGORITHM,
    CORS_ORIGINS_LIST,
    EMERGENT_LLM_KEY,
    EXTRAS_CATALOG,
    HOTEL_NOTIFICATION_EMAIL,
    RESEND_API_KEY,
    SECRET_KEY,
    SENDER_EMAIL,
    STRIPE_API_KEY,
    STRIPE_WEBHOOK_SECRET,
    TOKEN_EXPIRE_MINUTES,
)
from db import client, db
from services.scoring import calculate_garden_score, calculate_hotel_score

# Email security: API key must come ONLY from environment variable — never hardcoded
if RESEND_API_KEY:
    resend.api_key = RESEND_API_KEY
    logging.info("Resend email service initialized. Key rotation: update RESEND_API_KEY env var to revoke/replace.")
else:
    logging.warning("RESEND_API_KEY not set. Email sending disabled. Reservation creation will still succeed.")

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

app = FastAPI()
api_router = APIRouter(prefix="/api")

# ====================== MODELS ======================

class UserModel(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str; email: str; password_hash: str; role: str
    admin_type: Optional[str] = None        # platform_admin | platform_support | billing_admin | technical_admin | hotel_admin
    staff_subtype: Optional[str] = None     # recepcion | limpieza | mantenimiento | seguridad | restaurante
    department: Optional[str] = None; phone: Optional[str] = None
    is_active: bool = True; avatar_color: str = "#059669"
    custom_permissions: Optional[List[str]] = None
    property_id: Optional[str] = None
    tenant_id: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class UserCreate(BaseModel):
    name: str; email: str; password: str; role: str
    admin_type: Optional[str] = None
    staff_subtype: Optional[str] = None
    department: Optional[str] = None; phone: Optional[str] = None
    custom_permissions: Optional[List[str]] = None
    property_id: Optional[str] = None
    tenant_id: Optional[str] = None

class UserUpdate(BaseModel):
    name: Optional[str] = None; email: Optional[str] = None; role: Optional[str] = None
    admin_type: Optional[str] = None
    staff_subtype: Optional[str] = None
    department: Optional[str] = None; phone: Optional[str] = None
    is_active: Optional[bool] = None; custom_permissions: Optional[List[str]] = None
    property_id: Optional[str] = None
    tenant_id: Optional[str] = None
    password: Optional[str] = None

class UserResponse(BaseModel):
    id: str; name: str; email: str; role: str; department: Optional[str] = None
    phone: Optional[str] = None; is_active: bool; avatar_color: str; created_at: str
    custom_permissions: Optional[List[str]] = None
    admin_type: Optional[str] = None
    staff_subtype: Optional[str] = None
    property_id: Optional[str] = None
    tenant_id: Optional[str] = None

class RoomModel(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    number: str; type: str; floor: int; status: str = "available"
    amenities: List[str] = []; price_per_night: float; capacity: int = 2
    description: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class RoomCreate(BaseModel):
    number: str; type: str; floor: int; amenities: List[str] = []
    price_per_night: float; capacity: int = 2; description: Optional[str] = None

class RoomUpdate(BaseModel):
    number: Optional[str] = None; type: Optional[str] = None; floor: Optional[int] = None
    status: Optional[str] = None; amenities: Optional[List[str]] = None
    price_per_night: Optional[float] = None; capacity: Optional[int] = None
    description: Optional[str] = None

class GuestModel(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    first_name: str; last_name: str; email: Optional[str] = None; phone: Optional[str] = None
    id_number: Optional[str] = None; nationality: Optional[str] = None
    address: Optional[str] = None; notes: Optional[str] = None
    is_vip: bool = False
    preferred_room_type: Optional[str] = None
    internal_notes: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class GuestCreate(BaseModel):
    first_name: str; last_name: str; email: Optional[str] = None; phone: Optional[str] = None
    id_number: Optional[str] = None; nationality: Optional[str] = None
    address: Optional[str] = None; notes: Optional[str] = None
    is_vip: bool = False; preferred_room_type: Optional[str] = None; internal_notes: Optional[str] = None

class ReservationModel(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    guest_id: str; guest_name: str; room_id: str; room_number: str
    check_in_date: str; check_out_date: str; status: str = "confirmed"
    total_amount: float; adults: int = 1; children: int = 0
    notes: Optional[str] = None; created_by: str
    payment_status: str = "paid"
    payment_source: str = "internal"
    reservation_source: str = "reception"  # web | reception | whatsapp | other
    event_name: Optional[str] = None
    property_id: str = "alma_hotel"
    property_type: str = "hotel"
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class ReservationCreate(BaseModel):
    guest_id: str; room_id: str; check_in_date: str; check_out_date: str
    adults: int = 1; children: int = 0; notes: Optional[str] = None
    reservation_source: str = "reception"

class MessageModel(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    thread_id: str; sender_id: str; sender_name: str
    receiver_id: str; receiver_name: str; subject: Optional[str] = None
    content: str; message_type: str = "staff_to_staff"
    is_read: bool = False; is_reply: bool = False; parent_id: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class MessageCreate(BaseModel):
    receiver_id: str; subject: Optional[str] = None; content: str
    message_type: str = "staff_to_staff"
    thread_id: Optional[str] = None; parent_id: Optional[str] = None

class TaskModel(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str; description: Optional[str] = None
    assigned_to: Optional[str] = None; assigned_to_name: Optional[str] = None
    assigned_by: str; assigned_by_name: str
    room_id: Optional[str] = None; room_number: Optional[str] = None
    priority: str = "medium"; status: str = "pending"; category: str = "general"
    due_date: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class TaskCreate(BaseModel):
    title: str; description: Optional[str] = None; assigned_to: Optional[str] = None
    room_id: Optional[str] = None; priority: str = "medium"
    category: str = "general"; due_date: Optional[str] = None

# --- PUBLIC BOOKING MODELS ---
class ExtrasRequest(BaseModel):
    desayuno: bool = False
    early_checkin: bool = False
    late_checkout: bool = False

# Multi-property models
class PropertyModel(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str; type: str = "hotel"  # hotel | event_garden
    status: str = "active"  # active | inactive
    description: Optional[str] = None
    address: Optional[str] = None
    tenant_id: Optional[str] = None
    feature_toggles: dict = Field(default_factory=lambda: {
        "inbox": True, "tasks": True, "catalog": True,
        "public_booking": True, "advanced_reports": True
    })
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class PropertyCreate(BaseModel):
    name: str; type: str = "hotel"; status: str = "active"
    description: Optional[str] = None; address: Optional[str] = None
    tenant_id: Optional[str] = None

class EventSpaceModel(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    property_id: str; space_name: str; capacity: int; status: str = "available"
    description: Optional[str] = None; price_per_event: Optional[float] = None
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class EventSpaceCreate(BaseModel):
    property_id: str; space_name: str; capacity: int; status: str = "available"
    description: Optional[str] = None; price_per_event: Optional[float] = None

class HotelSpaceModel(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    property_id: str
    space_name: str
    space_type: str = "general"   # salon | conference | rooftop | terrace | pool | general
    capacity: int = 0
    status: str = "available"
    description: Optional[str] = None
    price_per_event: Optional[float] = None
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class HotelSpaceCreate(BaseModel):
    property_id: str
    space_name: str
    space_type: str = "general"
    capacity: int = 0
    status: str = "available"
    description: Optional[str] = None
    price_per_event: Optional[float] = None

class EventBookingModel(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    property_id: str; event_space_id: str; event_space_name: str
    client_name: str; client_email: Optional[str] = None; client_phone: Optional[str] = None
    event_date: str; event_type: str  # wedding | corporate | birthday | social | other
    attendees: int = 0; total_price: float = 0.0
    booking_status: str = "confirmed"  # confirmed | pending | cancelled
    payment_status: str = "pending"  # pending | paid
    notes: Optional[str] = None
    reservation_source: str = "reception"
    created_by: str = "admin"
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class EventBookingCreate(BaseModel):
    property_id: str; event_space_id: str; client_name: str
    client_email: Optional[str] = None; client_phone: Optional[str] = None
    event_date: str; event_type: str; attendees: int = 0; total_price: float = 0.0
    booking_status: str = "confirmed"; notes: Optional[str] = None
    reservation_source: str = "reception"

# Multi-tenant + SaaS models
class TenantModel(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: Optional[str] = None
    status: str = "active"          # legacy compat: active | inactive | suspended
    contact_email: Optional[str] = None
    plan: str = "standard"          # standard | premium | enterprise
    # SaaS billing fields
    plan_price: Optional[float] = None          # Custom monthly fee (overrides plan default)
    billing_status: Optional[str] = None        # Al corriente | Próximo a vencer | Vencido
    next_billing_date: Optional[str] = None     # ISO date string
    tenant_status: str = "Activo"               # Activo | Suspendido | Inactivo | En gracia
    internal_notes: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class TenantCreate(BaseModel):
    name: str; description: Optional[str] = None; status: str = "active"
    contact_email: Optional[str] = None; plan: str = "standard"
    plan_price: Optional[float] = None
    billing_status: Optional[str] = None
    next_billing_date: Optional[str] = None
    tenant_status: str = "Activo"
    internal_notes: Optional[str] = None

class RoomTypeModel(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str; description: Optional[str] = None
    base_price: float = 0.0; capacity: int = 2
    amenities: List[str] = []; images: List[str] = []
    property_id: Optional[str] = None; tenant_id: Optional[str] = None
    status: str = "active"
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class RoomTypeCreate(BaseModel):
    name: str; description: Optional[str] = None
    base_price: float = 0.0; capacity: int = 2
    amenities: List[str] = []; images: List[str] = []
    property_id: Optional[str] = None; tenant_id: Optional[str] = None

class AmenityModel(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    category: str = "general"
    icon: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class AmenityCreate(BaseModel):
    name: str; category: str = "general"; icon: Optional[str] = None

# Role Permissions
DEFAULT_ROLE_PERMISSIONS = {
    "admin": ["dashboard", "reservations", "rooms", "guests", "jardines", "inbox", "tasks", "catalog", "reports", "staff", "properties"],
    "owner": ["corporate", "hotels", "event-gardens", "reports"],
    "receptionist": ["dashboard", "reservations", "rooms", "guests", "jardines", "inbox", "tasks", "catalog"],
    "housekeeping": ["inbox", "tasks"],
    "maintenance": ["inbox", "tasks"],
    "security": ["inbox", "tasks"],
    "restaurant": ["inbox", "tasks"],
}

class RolePermissionUpdate(BaseModel):
    modules: List[str]

class PublicBookingCreate(BaseModel):
    check_in_date: str
    check_out_date: str
    adults: int = 2
    children: int = 0
    room_type: str
    extras: ExtrasRequest = ExtrasRequest()
    first_name: str
    last_name: str
    email: str
    phone: str
    id_number: Optional[str] = None
    event_name: Optional[str] = None
    payment_method: str = "at_hotel"
    special_requests: Optional[str] = None

class PendingBookingModel(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    check_in_date: str; check_out_date: str
    adults: int; children: int; room_type: str
    extras: dict = {}
    first_name: str; last_name: str; email: str; phone: str
    id_number: Optional[str] = None
    special_requests: Optional[str] = None
    total_amount: float; nights: int
    status: str = "pending"
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class PaymentTransactionModel(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    session_id: str; booking_id: Optional[str] = None
    amount: float; currency: str = "mxn"
    payment_status: str = "initiated"
    metadata: dict = {}
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

# ====================== AUTH ======================

def verify_password(plain, hashed): return pwd_context.verify(plain, hashed)
def hash_password(pw): return pwd_context.hash(pw)

def create_token(data: dict):
    to_encode = data.copy()
    to_encode["exp"] = datetime.now(timezone.utc) + timedelta(minutes=TOKEN_EXPIRE_MINUTES)
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

async def get_current_user(token: str = Depends(oauth2_scheme)):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        if not user_id: raise HTTPException(status_code=401, detail="Token inválido")
    except JWTError:
        raise HTTPException(status_code=401, detail="Token inválido")
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user: raise HTTPException(status_code=401, detail="Usuario no encontrado")
    user_obj = UserModel(**user)
    # Tenant suspension check (non-platform users with tenant_id assigned)
    if user_obj.role != 'platform_admin' and user_obj.tenant_id:
        tenant = await db.tenants.find_one({"id": user_obj.tenant_id}, {"_id": 0, "tenant_status": 1, "status": 1})
        if tenant and (tenant.get('tenant_status') == 'Suspendido' or tenant.get('status') == 'suspended'):
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
    """Raise 404 if guest is not in scope (no reservation in allowed properties)."""
    allowed = await _allowed_property_ids(current_user)
    if allowed is None:
        return
    if not allowed:
        raise HTTPException(status_code=404, detail="Huésped no encontrado")
    n = await db.reservations.count_documents({"guest_id": guest_id, "property_id": {"$in": allowed}})
    if n == 0:
        raise HTTPException(status_code=404, detail="Huésped no encontrado")

# ====================== SEED ======================

COLORS = ["#059669", "#3B82F6", "#D97706", "#EF4444", "#8B5CF6", "#EC4899"]

async def seed_data():
    if await db.users.count_documents({}) > 0: return
    users = [
        UserModel(name="Admin Hotel", email="admin@hotel.com", password_hash=hash_password("admin123"), role="admin", department="Administración", avatar_color="#059669"),
        UserModel(name="María García", email="maria@hotel.com", password_hash=hash_password("recep123"), role="receptionist", department="Recepción", avatar_color="#3B82F6"),
        UserModel(name="Carlos López", email="carlos@hotel.com", password_hash=hash_password("house123"), role="housekeeping", department="Housekeeping", avatar_color="#D97706"),
        UserModel(name="Ana Martínez", email="ana@hotel.com", password_hash=hash_password("maint123"), role="maintenance", department="Mantenimiento", avatar_color="#EF4444"),
        UserModel(name="Director General", email="owner@hotel.com", password_hash=hash_password("owner123"), role="owner", department="Dirección", avatar_color="#8B5CF6"),
        UserModel(name="Platform Admin", email="platform@almasystem.com", password_hash=hash_password("platform123"), role="platform_admin", department="Platform", avatar_color="#1e293b"),
    ]
    for u in users: await db.users.insert_one(u.model_dump())

    double_amenities = ["WiFi", "TV", "Aire Acondicionado", "2 Camas Queen", "Baño Privado", "Regadera de Lluvia", "Caja de Seguridad", "Amenidades de Baño", "Secador de Cabello"]
    suite_amenities = ["WiFi", "TV", "Aire Acondicionado", "Cama King Size", "Sofá Cama", "Vestidor", "Doble Lavabo", "Regadera de Lluvia", "Amenidades de Baño", "Secador de Cabello"]
    junior_suite_rooms = {5, 15, 25, 35}

    room_data = []
    for num in range(1, 41):
        floor = (num - 1) // 10 + 1
        is_suite = num in junior_suite_rooms
        room_data.append((str(num), "junior_suite" if is_suite else "double", floor, 2500 if is_suite else 1500, 2 if is_suite else 4, suite_amenities if is_suite else double_amenities))

    rooms = []
    for r in room_data:
        room = RoomModel(number=r[0], type=r[1], floor=r[2], price_per_night=r[3], capacity=r[4], amenities=r[5])
        await db.rooms.insert_one(room.model_dump())
        rooms.append(room)

    guests_data = [
        GuestModel(first_name="Juan", last_name="Pérez", email="juan@gmail.com", phone="+34 612 345 678", nationality="España", id_number="12345678A"),
        GuestModel(first_name="Sophie", last_name="Martin", email="sophie@gmail.com", phone="+33 6 12 34 56 78", nationality="Francia", id_number="FR123456"),
        GuestModel(first_name="James", last_name="Wilson", email="james@gmail.com", phone="+1 555 234 5678", nationality="EE.UU.", id_number="US789012"),
        GuestModel(first_name="Isabella", last_name="Ferrari", email="isabella@gmail.com", phone="+39 347 123 4567", nationality="Italia"),
    ]
    guests = []
    for g in guests_data:
        await db.guests.insert_one(g.model_dump())
        guests.append(g)

    from datetime import date, timedelta as td
    today = date.today().strftime("%Y-%m-%d")
    tomorrow = (date.today() + td(days=1)).strftime("%Y-%m-%d")
    next_week = (date.today() + td(days=7)).strftime("%Y-%m-%d")
    two_days_ago = (date.today() - td(days=2)).strftime("%Y-%m-%d")

    reservations = [
        ReservationModel(guest_id=guests[0].id, guest_name="Juan Pérez", room_id=rooms[1].id, room_number="2", check_in_date=today, check_out_date=next_week, status="checked_in", total_amount=10500, adults=2, created_by=users[1].id),
        ReservationModel(guest_id=guests[1].id, guest_name="Sophie Martin", room_id=rooms[14].id, room_number="15", check_in_date=tomorrow, check_out_date=next_week, status="confirmed", total_amount=15000, adults=2, children=1, created_by=users[1].id),
        ReservationModel(guest_id=guests[2].id, guest_name="James Wilson", room_id=rooms[5].id, room_number="6", check_in_date=two_days_ago, check_out_date=today, status="checked_out", total_amount=3000, adults=1, created_by=users[1].id),
        ReservationModel(guest_id=guests[3].id, guest_name="Isabella Ferrari", room_id=rooms[11].id, room_number="12", check_in_date=today, check_out_date=tomorrow, status="confirmed", total_amount=1500, adults=2, created_by=users[1].id),
    ]
    for r in reservations: await db.reservations.insert_one(r.model_dump())
    await db.rooms.update_one({"id": rooms[1].id}, {"$set": {"status": "occupied"}})
    await db.rooms.update_one({"id": rooms[3].id}, {"$set": {"status": "reserved"}})
    await db.rooms.update_one({"id": rooms[4].id}, {"$set": {"status": "cleaning"}})
    await db.rooms.update_one({"id": rooms[6].id}, {"$set": {"status": "reserved"}})

    admin = users[0]
    tasks = [
        TaskModel(title="Limpiar habitación 305", description="Limpieza profunda post check-out", assigned_to=users[2].id, assigned_to_name=users[2].name, assigned_by=admin.id, assigned_by_name=admin.name, room_id=rooms[14].id, room_number="305", priority="high", status="pending", category="housekeeping"),
        TaskModel(title="Revisar AC habitación 204", description="Huésped reportó problemas con el aire acondicionado", assigned_to=users[3].id, assigned_to_name=users[3].name, assigned_by=admin.id, assigned_by_name=admin.name, room_id=rooms[8].id, room_number="204", priority="urgent", status="in_progress", category="maintenance"),
        TaskModel(title="Preparar bienvenida VIP suite 104", description="Bouquet de flores y champagne para Sophie Martin", assigned_to=users[1].id, assigned_to_name=users[1].name, assigned_by=admin.id, assigned_by_name=admin.name, room_id=rooms[3].id, room_number="104", priority="high", status="pending", category="reception"),
    ]
    for t in tasks: await db.tasks.insert_one(t.model_dump())

    thread1 = str(uuid.uuid4())
    thread2 = str(uuid.uuid4())
    thread3 = str(uuid.uuid4())
    msgs = [
        MessageModel(thread_id=thread1, sender_id=users[1].id, sender_name=users[1].name, receiver_id=admin.id, receiver_name=admin.name, subject="Solicitud upgrade suite 104", content="Hola, el huésped Sophie Martin llega mañana a la suite 104. ¿Podemos prepararle una bienvenida especial con champagne y flores?", message_type="staff_to_staff"),
        MessageModel(thread_id=thread2, sender_id=users[2].id, sender_name=users[2].name, receiver_id=admin.id, receiver_name=admin.name, subject="Habitaciones listas", content="Las habitaciones 101, 103 y 205 ya están limpias y listas para recibir huéspedes. Continúo con la 305.", message_type="staff_to_staff"),
        MessageModel(thread_id=thread3, sender_id=admin.id, sender_name=admin.name, receiver_id=guests[0].id, receiver_name="Juan Pérez", subject="Bienvenido al Hotel", content="Estimado Juan, bienvenido a nuestro hotel. Esperamos que su estancia sea perfecta. No dude en contactarnos para cualquier necesidad.", message_type="staff_to_guest"),
    ]
    for m in msgs: await db.messages.insert_one(m.model_dump())

async def seed_properties():
    """Seed initial properties and event spaces — runs independently from seed_data."""
    if await db.properties.count_documents({}) > 0:
        return
    hotel_prop = PropertyModel(
        name="Alma Hotel Boutique", type="hotel", status="active",
        description="Hotel boutique de lujo — 40 habitaciones")
    garden_prop = PropertyModel(
        name="Jardín de Amargati", type="event_garden", status="active",
        description="Jardín de eventos con capacidad para 500 personas")
    await db.properties.insert_one(hotel_prop.model_dump())
    await db.properties.insert_one(garden_prop.model_dump())

    spaces = [
        EventSpaceModel(property_id=garden_prop.id, space_name="Jardín Principal",
                        capacity=500, price_per_event=50000.0,
                        description="Jardín amplio con iluminación y sistema de sonido profesional"),
        EventSpaceModel(property_id=garden_prop.id, space_name="Salón de Eventos",
                        capacity=200, price_per_event=30000.0,
                        description="Salón climatizado para ceremonias y recepciones"),
        EventSpaceModel(property_id=garden_prop.id, space_name="Terraza VIP",
                        capacity=80, price_per_event=15000.0,
                        description="Terraza exclusiva con vista panorámica"),
    ]
    for s in spaces:
        await db.event_spaces.insert_one(s.model_dump())

    # Seed sample event bookings for demo
    from datetime import date, timedelta as td
    today_d = date.today()
    sample_bookings = [
        EventBookingModel(
            property_id=garden_prop.id, event_space_id=spaces[0].id,
            event_space_name=spaces[0].space_name, client_name="Familia Rodríguez",
            client_email="rodriguezboda@gmail.com", client_phone="+52 55 1234 5678",
            event_date=(today_d + td(days=15)).isoformat(), event_type="wedding",
            attendees=350, total_price=85000.0, booking_status="confirmed",
            payment_status="pending", notes="Boda con decoración floral, necesitan servicio de catering"),
        EventBookingModel(
            property_id=garden_prop.id, event_space_id=spaces[1].id,
            event_space_name=spaces[1].space_name, client_name="Empresa Innovatec S.A.",
            client_email="eventos@innovatec.mx", client_phone="+52 55 9876 5432",
            event_date=(today_d + td(days=5)).isoformat(), event_type="corporate",
            attendees=120, total_price=42000.0, booking_status="confirmed",
            payment_status="paid", notes="Presentación anual de resultados"),
        EventBookingModel(
            property_id=garden_prop.id, event_space_id=spaces[2].id,
            event_space_name=spaces[2].space_name, client_name="Lucía Fernández",
            client_email="lucia@gmail.com", client_phone="+52 55 5555 1234",
            event_date=(today_d - td(days=10)).isoformat(), event_type="birthday",
            attendees=60, total_price=18000.0, booking_status="confirmed",
            payment_status="paid", notes="Quinceañera — decoración rosa y dorado"),
    ]
    for b in sample_bookings:
        await db.event_bookings.insert_one(b.model_dump())

async def seed_owner():
    """Seed owner user for existing databases that don't have one yet."""
    if await db.users.count_documents({"role": "owner"}) > 0:
        return
    owner = UserModel(
        name="Director General", email="owner@hotel.com",
        password_hash=hash_password("owner123"), role="owner",
        department="Dirección", avatar_color="#8B5CF6")
    await db.users.insert_one(owner.model_dump())

async def seed_platform_admin():
    """Seed platform admin for existing databases."""
    if await db.users.count_documents({"role": "platform_admin"}) > 0:
        return
    padmin = UserModel(
        name="Platform Admin", email="platform@almasystem.com",
        password_hash=hash_password("platform123"), role="platform_admin",
        department="Platform", avatar_color="#1e293b")
    await db.users.insert_one(padmin.model_dump())

async def seed_tenants():
    """Seed initial tenant and assign existing properties to it."""
    if await db.tenants.count_documents({}) > 0:
        return
    tenant = TenantModel(
        name="Alma Hospitality Group",
        description="Grupo hotelero principal — Alma Hotel Boutique y Jardín de Amargati",
        status="active", contact_email="admin@almahotel.com", plan="enterprise")
    await db.tenants.insert_one(tenant.model_dump())
    # Assign all existing properties to this tenant
    await db.properties.update_many({"tenant_id": None}, {"$set": {"tenant_id": tenant.id}})

async def seed_room_types():
    """Seed default room types catalog."""
    if await db.room_types.count_documents({}) > 0:
        return
    std = ["wifi", "tv", "private_bathroom", "shower", "safe_box"]
    types = [
        RoomTypeModel(name="Estándar", description="Habitación estándar con todas las comodidades esenciales.",
                      base_price=850.0, capacity=2, amenities=std, status="active"),
        RoomTypeModel(name="Deluxe", description="Habitación deluxe con minibar y vista al jardín.",
                      base_price=1350.0, capacity=2, amenities=std + ["minibar", "air_conditioning"], status="active"),
        RoomTypeModel(name="Junior Suite", description="Suite con sala de estar, balcón y amenidades premium.",
                      base_price=2100.0, capacity=3,
                      amenities=std + ["minibar", "balcony", "sofa_bed", "air_conditioning"], status="active"),
        RoomTypeModel(name="Suite Master", description="Suite de lujo con jacuzzi, terraza privada y servicio VIP.",
                      base_price=3500.0, capacity=4,
                      amenities=std + ["minibar", "balcony", "jacuzzi", "sofa_bed", "air_conditioning", "coffee_maker"],
                      status="active"),
    ]
    for t in types:
        await db.room_types.insert_one(t.model_dump())

async def seed_amenities():
    """Seed default amenities catalog."""
    if await db.amenities.count_documents({}) > 0:
        return
    amenities_data = [
        # Connectivity
        AmenityModel(name="WiFi", category="connectivity", icon="wifi", id="wifi"),
        AmenityModel(name="Smart TV", category="entertainment", icon="tv", id="tv"),
        # Climate
        AmenityModel(name="Aire Acondicionado", category="climate", icon="wind", id="air_conditioning"),
        AmenityModel(name="Calefacción", category="climate", icon="flame", id="heating"),
        # Bathroom
        AmenityModel(name="Baño Privado", category="bathroom", icon="bath", id="private_bathroom"),
        AmenityModel(name="Ducha", category="bathroom", icon="droplets", id="shower"),
        AmenityModel(name="Bañera", category="bathroom", icon="bath", id="bathtub"),
        AmenityModel(name="Jacuzzi", category="bathroom", icon="waves", id="jacuzzi"),
        AmenityModel(name="Secador de Cabello", category="bathroom", icon="wind", id="hair_dryer"),
        AmenityModel(name="Artículos de Tocador", category="bathroom", icon="sparkles", id="toiletries"),
        # Room
        AmenityModel(name="Caja Fuerte", category="security", icon="lock", id="safe_box"),
        AmenityModel(name="Minibar", category="food", icon="glass-water", id="minibar"),
        AmenityModel(name="Cafetera", category="food", icon="coffee", id="coffee_maker"),
        AmenityModel(name="Sofá Cama", category="sleeping", icon="sofa", id="sofa_bed"),
        # View / Space
        AmenityModel(name="Balcón", category="outdoor", icon="building", id="balcony"),
        AmenityModel(name="Terraza Privada", category="outdoor", icon="trees", id="private_terrace"),
        AmenityModel(name="Vista al Mar", category="view", icon="waves", id="sea_view"),
        AmenityModel(name="Vista al Jardín", category="view", icon="leaf", id="garden_view"),
        # Services
        AmenityModel(name="Servicio de Habitación", category="service", icon="concierge-bell", id="room_service"),
        AmenityModel(name="Estacionamiento", category="service", icon="car", id="parking"),
    ]
    for a in amenities_data:
        await db.amenities.insert_one(a.model_dump())

# ====================== ROUTES ======================

class LoginRequest(BaseModel):
    email: str; password: str

@api_router.post("/auth/login")
async def login(data: LoginRequest):
    user = await db.users.find_one({"email": data.email}, {"_id": 0})
    if not user or not verify_password(data.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Email o contraseña incorrectos")
    if not user.get("is_active", True):
        raise HTTPException(status_code=403, detail="Cuenta desactivada")
    user_obj = UserModel(**user)
    token = create_token({"sub": user_obj.id, "role": user_obj.role})
    return {"access_token": token, "token_type": "bearer", "user": UserResponse(**user_obj.model_dump())}

@api_router.get("/auth/me")
async def get_me(current_user: UserModel = Depends(get_current_user)):
    return UserResponse(**current_user.model_dump())

# --- USERS ---
@api_router.get("/users")
async def get_users(current_user: UserModel = Depends(get_current_user)):
    users = await db.users.find({}, {"_id": 0}).to_list(1000)
    return [UserResponse(**u) for u in users]

@api_router.post("/users")
async def create_user(data: UserCreate, current_user: UserModel = Depends(require_role("admin", "platform_admin", "manager"))):
    STAFF_ROLES = {"receptionist", "housekeeping", "maintenance", "security", "restaurant"}
    ELEVATED_ROLES = {"owner", "admin", "platform_admin"}
    MANAGER_ALLOWED = {"manager"} | STAFF_ROLES
    if current_user.role == "admin" and data.role in ELEVATED_ROLES:
        raise HTTPException(status_code=403, detail="Los administradores solo pueden crear roles de personal")
    if current_user.role == "manager" and data.role not in MANAGER_ALLOWED:
        raise HTTPException(status_code=403, detail="Gerentes solo pueden crear gerentes y personal")
    if await db.users.find_one({"email": data.email}):
        raise HTTPException(status_code=400, detail="Email ya registrado")
    user = UserModel(name=data.name, email=data.email, password_hash=hash_password(data.password),
                     role=data.role, admin_type=data.admin_type, staff_subtype=data.staff_subtype,
                     department=data.department, phone=data.phone,
                     custom_permissions=data.custom_permissions,
                     property_id=data.property_id, tenant_id=data.tenant_id,
                     avatar_color=random.choice(COLORS))
    await db.users.insert_one(user.model_dump())
    return UserResponse(**user.model_dump())

@api_router.put("/users/{user_id}")
async def update_user(user_id: str, data: UserUpdate, current_user: UserModel = Depends(require_role("admin", "platform_admin", "manager"))):
    dump = data.model_dump()
    NULLABLE_FIELDS = {'custom_permissions', 'admin_type', 'staff_subtype', 'property_id', 'tenant_id'}
    update_dict = {k: v for k, v in dump.items() if k not in NULLABLE_FIELDS and k != 'password' and v is not None}
    for field in NULLABLE_FIELDS:
        if field in dump:
            update_dict[field] = dump[field]
    if dump.get('password'):
        update_dict['password_hash'] = hash_password(dump['password'])
    result = await db.users.find_one_and_update({"id": user_id}, {"$set": update_dict}, return_document=True)
    if not result: raise HTTPException(status_code=404, detail="Usuario no encontrado")
    return UserResponse(**result)

@api_router.delete("/users/{user_id}")
async def delete_user(user_id: str, current_user: UserModel = Depends(require_role("admin", "platform_admin", "manager"))):
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
    # Hotel admin can delete managers and all staff roles
    elif current_user.role == "admin":
        allowed = ["manager", "receptionist", "housekeeping", "maintenance", "security", "restaurant"]
        if target_role not in allowed:
            raise HTTPException(status_code=403, detail="No tienes permiso para eliminar este usuario")
    # Manager can delete staff only (not other managers or admins)
    elif current_user.role == "manager":
        allowed = ["receptionist", "housekeeping", "maintenance", "security", "restaurant"]
        if target_role not in allowed:
            raise HTTPException(status_code=403, detail="No tienes permiso para eliminar este usuario")
    await db.users.delete_one({"id": user_id})
    return {"message": "Usuario eliminado"}

# --- ROOMS ---
@api_router.get("/rooms")
async def get_rooms(current_user: UserModel = Depends(get_current_user)):
    allowed = await _allowed_property_ids(current_user)
    if allowed is None:
        q = {}
    elif not allowed:
        q = {"id": "__none__"}
    else:
        q = {"property_id": {"$in": allowed}}
    return await db.rooms.find(q, {"_id": 0}).to_list(1000)

@api_router.post("/rooms")
async def create_room(data: RoomCreate, current_user: UserModel = Depends(get_current_user)):
    allowed = await _allowed_property_ids(current_user)
    if allowed is not None and not allowed:
        raise HTTPException(status_code=403, detail="No tiene permiso para crear habitaciones en ninguna propiedad")
    if await db.rooms.find_one({"number": data.number}):
        raise HTTPException(status_code=400, detail="Número de habitación ya existe")
    room = RoomModel(**data.model_dump())
    room_doc = room.model_dump()
    if allowed is not None:
        room_doc["property_id"] = current_user.property_id or allowed[0]
    await db.rooms.insert_one(room_doc)
    return room_doc

@api_router.put("/rooms/{room_id}")
async def update_room(room_id: str, data: RoomUpdate, current_user: UserModel = Depends(get_current_user)):
    room = await db.rooms.find_one({"id": room_id}, {"_id": 0})
    if not room: raise HTTPException(status_code=404, detail="Habitación no encontrada")
    await _ensure_room_in_scope(room, current_user)
    update_dict = {k: v for k, v in data.model_dump().items() if v is not None}
    result = await db.rooms.find_one_and_update({"id": room_id}, {"$set": update_dict}, return_document=True)
    if not result: raise HTTPException(status_code=404, detail="Habitación no encontrada")
    result.pop("_id", None); return result

@api_router.patch("/rooms/{room_id}/status")
async def update_room_status(room_id: str, data: dict, current_user: UserModel = Depends(get_current_user)):
    room = await db.rooms.find_one({"id": room_id}, {"_id": 0})
    if not room: raise HTTPException(status_code=404, detail="Habitación no encontrada")
    await _ensure_room_in_scope(room, current_user)
    result = await db.rooms.find_one_and_update({"id": room_id}, {"$set": {"status": data.get("status")}}, return_document=True)
    if not result: raise HTTPException(status_code=404, detail="Habitación no encontrada")
    result.pop("_id", None); return result

@api_router.delete("/rooms/{room_id}")
async def delete_room(room_id: str, current_user: UserModel = Depends(require_role("admin", "platform_admin"))):
    room = await db.rooms.find_one({"id": room_id}, {"_id": 0})
    if not room: raise HTTPException(status_code=404, detail="Habitación no encontrada")
    await _ensure_room_in_scope(room, current_user)
    active = await db.reservations.count_documents({"room_id": room_id, "status": {"$in": ["confirmed", "checked_in"]}})
    if active > 0:
        raise HTTPException(status_code=400, detail="No se puede eliminar: habitación con reservas activas")
    await db.rooms.delete_one({"id": room_id})
    return {"deleted": True}

# --- GUESTS ---
@api_router.get("/guests")
async def get_guests(current_user: UserModel = Depends(get_current_user)):
    allowed = await _allowed_property_ids(current_user)
    if allowed is None:
        return await db.guests.find({}, {"_id": 0}).to_list(1000)
    if not allowed:
        return []
    # Guests have no property_id; scope by guests who appear in reservations for allowed properties.
    res_list = await db.reservations.find({"property_id": {"$in": allowed}}, {"guest_id": 1}).to_list(10000)
    guest_ids = list({r["guest_id"] for r in res_list})
    if not guest_ids:
        return []
    return await db.guests.find({"id": {"$in": guest_ids}}, {"_id": 0}).to_list(1000)

@api_router.post("/guests")
async def create_guest(data: GuestCreate, current_user: UserModel = Depends(get_current_user)):
    guest = GuestModel(**data.model_dump())
    await db.guests.insert_one(guest.model_dump()); return guest.model_dump()

@api_router.get("/guests/{guest_id}")
async def get_guest(guest_id: str, current_user: UserModel = Depends(get_current_user)):
    guest = await db.guests.find_one({"id": guest_id}, {"_id": 0})
    if not guest: raise HTTPException(status_code=404, detail="Huésped no encontrado")
    await _ensure_guest_in_scope(guest_id, current_user)
    return guest

@api_router.put("/guests/{guest_id}")
async def update_guest(guest_id: str, data: GuestCreate, current_user: UserModel = Depends(get_current_user)):
    await _ensure_guest_in_scope(guest_id, current_user)
    update_dict = {k: v for k, v in data.model_dump().items() if v is not None}
    result = await db.guests.find_one_and_update({"id": guest_id}, {"$set": update_dict}, return_document=True)
    if not result: raise HTTPException(status_code=404, detail="Huésped no encontrado")
    result.pop("_id", None); return result

@api_router.delete("/guests/{guest_id}")
async def delete_guest(guest_id: str, current_user: UserModel = Depends(get_current_user)):
    await _ensure_guest_in_scope(guest_id, current_user)
    await db.guests.delete_one({"id": guest_id}); return {"message": "Huésped eliminado"}

# --- RESERVATIONS ---
@api_router.get("/reservations")
async def get_reservations(current_user: UserModel = Depends(get_current_user)):
    allowed = await _allowed_property_ids(current_user)
    if allowed is None:
        q = {}
    elif not allowed:
        q = {"id": "__none__"}
    else:
        q = {"property_id": {"$in": allowed}}
    return await db.reservations.find(q, {"_id": 0}).sort("created_at", -1).to_list(1000)

@api_router.post("/reservations")
async def create_reservation(data: ReservationCreate, current_user: UserModel = Depends(get_current_user)):
    guest = await db.guests.find_one({"id": data.guest_id})
    room = await db.rooms.find_one({"id": data.room_id})
    if not guest: raise HTTPException(status_code=404, detail="Huésped no encontrado")
    if not room: raise HTTPException(status_code=404, detail="Habitación no encontrada")
    await _ensure_room_in_scope(room, current_user)
    await _ensure_guest_in_scope(data.guest_id, current_user)
    from datetime import date as dt_date
    check_in = dt_date.fromisoformat(data.check_in_date)
    check_out = dt_date.fromisoformat(data.check_out_date)
    nights = (check_out - check_in).days
    if nights <= 0: raise HTTPException(status_code=400, detail="Fechas inválidas")
    allowed = await _allowed_property_ids(current_user)
    property_id = room.get("property_id") or (allowed[0] if allowed else "alma_hotel")
    reservation = ReservationModel(
        guest_id=data.guest_id, guest_name=f"{guest['first_name']} {guest['last_name']}",
        room_id=data.room_id, room_number=room["number"],
        check_in_date=data.check_in_date, check_out_date=data.check_out_date,
        total_amount=nights * room["price_per_night"],
        adults=data.adults, children=data.children, notes=data.notes,
        created_by=current_user.id, reservation_source=getattr(data, 'reservation_source', 'reception'),
        property_id=property_id)
    await db.reservations.insert_one(reservation.model_dump())
    await db.rooms.update_one({"id": data.room_id}, {"$set": {"status": "reserved"}})
    return reservation.model_dump()

@api_router.patch("/reservations/{res_id}/checkin")
async def checkin(res_id: str, current_user: UserModel = Depends(require_role("admin", "receptionist"))):
    res = await db.reservations.find_one({"id": res_id})
    if not res: raise HTTPException(status_code=404, detail="Reserva no encontrada")
    await _ensure_reservation_in_scope(res, current_user)
    await db.reservations.update_one({"id": res_id}, {"$set": {"status": "checked_in"}})
    await db.rooms.update_one({"id": res["room_id"]}, {"$set": {"status": "occupied"}})
    res["status"] = "checked_in"; res.pop("_id", None); return res

@api_router.patch("/reservations/{res_id}/checkout")
async def checkout(res_id: str, current_user: UserModel = Depends(require_role("admin", "receptionist"))):
    res = await db.reservations.find_one({"id": res_id})
    if not res: raise HTTPException(status_code=404, detail="Reserva no encontrada")
    await _ensure_reservation_in_scope(res, current_user)
    await db.reservations.update_one({"id": res_id}, {"$set": {"status": "checked_out"}})
    await db.rooms.update_one({"id": res["room_id"]}, {"$set": {"status": "cleaning"}})
    res["status"] = "checked_out"; res.pop("_id", None); return res

@api_router.patch("/reservations/{res_id}/cancel")
async def cancel_reservation(res_id: str, current_user: UserModel = Depends(get_current_user)):
    res = await db.reservations.find_one({"id": res_id})
    if not res: raise HTTPException(status_code=404, detail="Reserva no encontrada")
    await _ensure_reservation_in_scope(res, current_user)
    await db.reservations.update_one({"id": res_id}, {"$set": {"status": "cancelled"}})
    await db.rooms.update_one({"id": res["room_id"]}, {"$set": {"status": "available"}})
    res["status"] = "cancelled"; res.pop("_id", None); return res

@api_router.patch("/reservations/{res_id}/collect-payment")
async def collect_payment(res_id: str, current_user: UserModel = Depends(require_role("admin", "receptionist"))):
    res = await db.reservations.find_one({"id": res_id})
    if not res: raise HTTPException(status_code=404, detail="Reserva no encontrada")
    await _ensure_reservation_in_scope(res, current_user)
    await db.reservations.update_one({"id": res_id}, {"$set": {"payment_status": "paid"}})
    res["payment_status"] = "paid"; res.pop("_id", None); return res

# --- MESSAGES ---
@api_router.get("/messages/unread-count")
async def unread_count(current_user: UserModel = Depends(get_current_user)):
    count = await db.messages.count_documents({"receiver_id": current_user.id, "is_read": False})
    return {"count": count}

@api_router.get("/messages")
async def get_messages(current_user: UserModel = Depends(get_current_user)):
    msgs = await db.messages.find(
        {"$or": [{"sender_id": current_user.id}, {"receiver_id": current_user.id}]},
        {"_id": 0}).sort("created_at", -1).to_list(1000)
    return msgs

@api_router.post("/messages")
async def create_message(data: MessageCreate, current_user: UserModel = Depends(get_current_user)):
    receiver_name = None
    receiver = await db.users.find_one({"id": data.receiver_id})
    if receiver:
        receiver_name = receiver["name"]
    else:
        guest = await db.guests.find_one({"id": data.receiver_id})
        if guest: receiver_name = f"{guest['first_name']} {guest['last_name']}"
    if not receiver_name: raise HTTPException(status_code=404, detail="Destinatario no encontrado")
    message = MessageModel(
        thread_id=data.thread_id or str(uuid.uuid4()), sender_id=current_user.id,
        sender_name=current_user.name, receiver_id=data.receiver_id, receiver_name=receiver_name,
        subject=data.subject, content=data.content, message_type=data.message_type,
        is_reply=data.parent_id is not None, parent_id=data.parent_id)
    await db.messages.insert_one(message.model_dump())
    return message.model_dump()

@api_router.patch("/messages/{msg_id}/read")
async def mark_read(msg_id: str, current_user: UserModel = Depends(get_current_user)):
    await db.messages.update_one({"id": msg_id}, {"$set": {"is_read": True}})
    return {"message": "Marcado como leído"}

# --- TASKS ---
@api_router.get("/tasks")
async def get_tasks(current_user: UserModel = Depends(get_current_user)):
    if current_user.role in ["admin", "receptionist", "manager"]:
        return await db.tasks.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return await db.tasks.find(
        {"$or": [{"assigned_to": current_user.id}, {"assigned_by": current_user.id}]},
        {"_id": 0}).sort("created_at", -1).to_list(1000)

@api_router.post("/tasks")
async def create_task(data: TaskCreate, current_user: UserModel = Depends(get_current_user)):
    assigned_to_name = None
    if data.assigned_to:
        assignee = await db.users.find_one({"id": data.assigned_to})
        if assignee: assigned_to_name = assignee["name"]
    room_number = None
    if data.room_id:
        room = await db.rooms.find_one({"id": data.room_id})
        if room: room_number = room["number"]
    task = TaskModel(title=data.title, description=data.description, assigned_to=data.assigned_to,
                     assigned_to_name=assigned_to_name, assigned_by=current_user.id,
                     assigned_by_name=current_user.name, room_id=data.room_id, room_number=room_number,
                     priority=data.priority, category=data.category, due_date=data.due_date)
    await db.tasks.insert_one(task.model_dump()); return task.model_dump()

@api_router.patch("/tasks/{task_id}/status")
async def update_task_status(task_id: str, data: dict, current_user: UserModel = Depends(get_current_user)):
    result = await db.tasks.find_one_and_update(
        {"id": task_id},
        {"$set": {"status": data.get("status"), "updated_at": datetime.now(timezone.utc).isoformat()}},
        return_document=True)
    if not result: raise HTTPException(status_code=404, detail="Tarea no encontrada")
    result.pop("_id", None); return result

@api_router.delete("/tasks/{task_id}")
async def delete_task(task_id: str, current_user: UserModel = Depends(get_current_user)):
    await db.tasks.delete_one({"id": task_id}); return {"message": "Tarea eliminada"}

# --- REPORTS ---
@api_router.get("/reports/dashboard")
async def dashboard_stats(current_user: UserModel = Depends(get_current_user)):
    total_rooms = await db.rooms.count_documents({})
    occupied = await db.rooms.count_documents({"status": "occupied"})
    available = await db.rooms.count_documents({"status": "available"})
    cleaning = await db.rooms.count_documents({"status": "cleaning"})
    maintenance = await db.rooms.count_documents({"status": "maintenance"})
    reserved = await db.rooms.count_documents({"status": "reserved"})
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    today_in = await db.reservations.count_documents({"check_in_date": today, "status": {"$in": ["confirmed", "checked_in"]}})
    today_out = await db.reservations.count_documents({"check_out_date": today, "status": "checked_in"})
    active_guests = await db.reservations.count_documents({"status": "checked_in"})
    pending_tasks = await db.tasks.count_documents({"status": "pending"})
    total_guests = await db.guests.count_documents({})
    pending_payments = await db.reservations.count_documents({
        "payment_status": "pending", "status": {"$in": ["confirmed", "checked_in"]}})
    pipeline = [{"$match": {"status": {"$in": ["checked_out", "checked_in"]}}},
                {"$group": {"_id": None, "total": {"$sum": "$total_amount"}}}]
    rev = await db.reservations.aggregate(pipeline).to_list(1)
    return {
        "total_rooms": total_rooms, "occupied_rooms": occupied, "available_rooms": available,
        "cleaning_rooms": cleaning, "maintenance_rooms": maintenance, "reserved_rooms": reserved,
        "occupancy_rate": round((occupied / total_rooms * 100) if total_rooms > 0 else 0, 1),
        "today_checkins": today_in, "today_checkouts": today_out, "active_guests": active_guests,
        "pending_tasks": pending_tasks, "total_guests": total_guests,
        "pending_payments": pending_payments,
        "total_revenue": rev[0]["total"] if rev else 0
    }

@api_router.get("/reports/occupancy")
async def occupancy_report(current_user: UserModel = Depends(get_current_user)):
    monthly = await db.reservations.aggregate([
        {"$match": {"status": {"$in": ["checked_in", "checked_out"]}}},
        {"$group": {"_id": {"$substr": ["$check_in_date", 0, 7]}, "count": {"$sum": 1}, "revenue": {"$sum": "$total_amount"}}},
        {"$sort": {"_id": 1}}, {"$limit": 12}]).to_list(12)
    room_types = await db.rooms.aggregate([{"$group": {"_id": "$type", "count": {"$sum": 1}}}]).to_list(10)
    room_statuses = await db.rooms.aggregate([{"$group": {"_id": "$status", "count": {"$sum": 1}}}]).to_list(10)
    return {
        "monthly": [{"month": r["_id"], "reservaciones": r["count"], "ingresos": r["revenue"]} for r in monthly],
        "room_types": [{"type": r["_id"], "count": r["count"]} for r in room_types],
        "room_statuses": [{"status": r["_id"], "count": r["count"]} for r in room_statuses]
    }

@api_router.patch("/guests/{guest_id}/vip")
async def toggle_vip(guest_id: str, current_user: UserModel = Depends(require_role("admin", "receptionist"))):
    guest = await db.guests.find_one({"id": guest_id})
    if not guest: raise HTTPException(status_code=404, detail="Huésped no encontrado")
    await _ensure_guest_in_scope(guest_id, current_user)
    new_vip = not guest.get("is_vip", False)
    await db.guests.update_one({"id": guest_id}, {"$set": {"is_vip": new_vip}})
    guest["is_vip"] = new_vip; guest.pop("_id", None); return guest

@api_router.get("/guests/{guest_id}/reservations")
async def guest_reservations(guest_id: str, current_user: UserModel = Depends(get_current_user)):
    await _ensure_guest_in_scope(guest_id, current_user)
    allowed = await _allowed_property_ids(current_user)
    if allowed is None:
        q = {"guest_id": guest_id}
    else:
        q = {"guest_id": guest_id, "property_id": {"$in": allowed}}
    res = await db.reservations.find(q, {"_id": 0}).sort("check_in_date", -1).to_list(50)
    total_spent = sum(r.get("total_amount", 0) for r in res if r.get("status") not in ["cancelled"])
    return {"reservations": res, "total_spent": total_spent, "total_stays": len([r for r in res if r.get("status") in ["checked_in","checked_out"]])}

@api_router.get("/reports/insights")
async def revenue_insights(current_user: UserModel = Depends(get_current_user)):
    from datetime import date as dt_date
    today = dt_date.today()
    month_start = today.replace(day=1).isoformat()
    month_end = today.replace(day=1, month=today.month % 12 + 1 if today.month < 12 else 1,
                               year=today.year if today.month < 12 else today.year + 1).isoformat()
    # Revenue this month
    month_res = await db.reservations.find(
        {"check_in_date": {"$gte": month_start, "$lt": month_end}, "status": {"$nin": ["cancelled"]}}, {"_id": 0}
    ).to_list(1000)
    month_revenue = sum(r.get("total_amount", 0) for r in month_res)
    # Occupancy rate
    total_rooms = await db.rooms.count_documents({})
    occupied = await db.rooms.count_documents({"status": {"$in": ["occupied", "reserved"]}})
    occ_rate = round((occupied / total_rooms * 100) if total_rooms > 0 else 0, 1)
    # Pending payments
    pending_pay = await db.reservations.count_documents({"payment_status": "pending", "status": {"$in": ["confirmed","checked_in"]}})
    pending_pay_amount = 0
    if pending_pay > 0:
        pp_res = await db.reservations.find({"payment_status": "pending", "status": {"$in": ["confirmed","checked_in"]}}, {"_id": 0, "total_amount": 1}).to_list(1000)
        pending_pay_amount = sum(r.get("total_amount", 0) for r in pp_res)
    # Most booked room type
    type_pipeline = [{"$match": {"status": {"$nin": ["cancelled"]}}},
                     {"$lookup": {"from": "rooms", "localField": "room_id", "foreignField": "id", "as": "room"}},
                     {"$unwind": {"path": "$room", "preserveNullAndEmptyArrays": True}},
                     {"$group": {"_id": "$room.type", "count": {"$sum": 1}}},
                     {"$sort": {"count": -1}}, {"$limit": 1}]
    top_type = await db.reservations.aggregate(type_pipeline).to_list(1)
    # Projected end of month (linear projection)
    days_elapsed = today.day
    days_in_month = 30
    projected = round((month_revenue / days_elapsed * days_in_month) if days_elapsed > 0 else 0)
    # Lost revenue (empty rooms * avg price per night)
    avg_price = 1500.0
    empty_rooms = total_rooms - occupied
    lost_revenue_estimate = empty_rooms * avg_price
    # Source breakdown
    source_pipeline = [{"$match": {"status": {"$nin": ["cancelled"]}}},
                       {"$group": {"_id": "$reservation_source", "count": {"$sum": 1}, "revenue": {"$sum": "$total_amount"}}}]
    sources = await db.reservations.aggregate(source_pipeline).to_list(10)
    source_labels = {"web": "Portal Web", "reception": "Recepción", "whatsapp": "WhatsApp", "other": "Otro"}
    return {
        "month_revenue": month_revenue, "month_reservations": len(month_res),
        "occupancy_rate": occ_rate, "projected_month_revenue": projected,
        "pending_payments_count": pending_pay, "pending_payments_amount": pending_pay_amount,
        "most_booked_type": top_type[0]["_id"] if top_type else None,
        "estimated_lost_revenue": lost_revenue_estimate,
        "source_breakdown": [{"source": s["_id"] or "other", "label": source_labels.get(s["_id"] or "other", "Otro"), "count": s["count"], "revenue": s["revenue"]} for s in sources],
    }

@api_router.get("/reports/export/csv")
async def export_reservations_csv(current_user: UserModel = Depends(require_role("admin", "owner", "manager", "receptionist"))):
    from fastapi.responses import StreamingResponse
    import io, csv
    reservations = await db.reservations.find({}, {"_id": 0}).sort("created_at", -1).to_list(10000)
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=["id","guest_name","room_number","check_in_date","check_out_date","total_amount","status","payment_status","reservation_source","event_name","created_at"], extrasaction="ignore")
    writer.writeheader()
    for r in reservations:
        writer.writerow({k: r.get(k, "") for k in writer.fieldnames})
    output.seek(0)
    return StreamingResponse(iter([output.getvalue()]), media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=reservas_alma.csv"})
@api_router.get("/reports/revenue-breakdown")
async def revenue_breakdown(current_user: UserModel = Depends(get_current_user)):
    all_res = await db.reservations.find(
        {"status": {"$nin": ["cancelled"]}}, {"_id": 0, "total_amount": 1, "event_name": 1}
    ).to_list(10000)
    hotel_revenue = sum(r["total_amount"] for r in all_res if not r.get("event_name"))
    event_revenue = sum(r["total_amount"] for r in all_res if r.get("event_name"))
    total_revenue = hotel_revenue + event_revenue
    # Group by event name
    events_map: Dict[str, Dict] = {}
    for r in all_res:
        name = r.get("event_name")
        if name:
            if name not in events_map:
                events_map[name] = {"event_name": name, "reservaciones": 0, "ingresos": 0.0}
            events_map[name]["reservaciones"] += 1
            events_map[name]["ingresos"] += r["total_amount"]
    events_list = sorted(events_map.values(), key=lambda x: x["ingresos"], reverse=True)
    return {
        "hotel_revenue": hotel_revenue,
        "event_revenue": event_revenue,
        "total_revenue": total_revenue,
        "events_breakdown": events_list,
        "hotel_reservations": sum(1 for r in all_res if not r.get("event_name")),
        "event_reservations": sum(1 for r in all_res if r.get("event_name")),
    }

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
        if match: return json.loads(match.group())
    except: pass
    return {"title": data.get("issue", "Nueva tarea"), "description": response, "priority": "medium", "category": "general"}

# ====================== PROPERTIES ======================

@api_router.get("/properties")
async def list_properties(current_user: UserModel = Depends(get_current_user)):
    props = await db.properties.find({}, {"_id": 0}).to_list(100)
    return props

@api_router.post("/properties")
async def create_property(data: PropertyCreate, current_user: UserModel = Depends(require_role("admin", "platform_admin"))):
    prop = PropertyModel(**data.model_dump())
    await db.properties.insert_one(prop.model_dump())
    return prop.model_dump()

@api_router.patch("/properties/{prop_id}")
async def update_property(prop_id: str, data: dict, current_user: UserModel = Depends(require_role("admin", "platform_admin"))):
    await db.properties.update_one({"id": prop_id}, {"$set": data})
    p = await db.properties.find_one({"id": prop_id}, {"_id": 0})
    if not p: raise HTTPException(status_code=404, detail="Propiedad no encontrada")
    return p

@api_router.delete("/properties/{prop_id}")
async def delete_property(prop_id: str, current_user: UserModel = Depends(require_role("admin", "platform_admin"))):
    active = await db.reservations.count_documents({"property_id": prop_id, "status": {"$in": ["confirmed", "checked_in"]}})
    if active > 0:
        raise HTTPException(status_code=400, detail="No se puede eliminar: la propiedad tiene reservas activas")
    await db.properties.delete_one({"id": prop_id})
    return {"deleted": True}

# ====================== EVENT SPACES ======================

@api_router.get("/event-spaces")
async def list_event_spaces(property_id: Optional[str] = None, current_user: UserModel = Depends(get_current_user)):
    q = {"property_id": property_id} if property_id else {}
    spaces = await db.event_spaces.find(q, {"_id": 0}).to_list(100)
    return spaces

@api_router.post("/event-spaces")
async def create_event_space(data: EventSpaceCreate, current_user: UserModel = Depends(require_role("admin", "receptionist"))):
    space = EventSpaceModel(**data.model_dump())
    await db.event_spaces.insert_one(space.model_dump())
    return space.model_dump()

@api_router.patch("/event-spaces/{space_id}")
async def update_event_space(space_id: str, data: dict, current_user: UserModel = Depends(require_role("admin", "receptionist"))):
    await db.event_spaces.update_one({"id": space_id}, {"$set": data})
    s = await db.event_spaces.find_one({"id": space_id}, {"_id": 0})
    if not s: raise HTTPException(status_code=404, detail="Espacio no encontrado")
    return s

@api_router.delete("/event-spaces/{space_id}")
async def delete_event_space(space_id: str, current_user: UserModel = Depends(require_role("admin"))):
    await db.event_spaces.delete_one({"id": space_id})
    return {"deleted": True}

# ====================== HOTEL SPACES ======================

@api_router.get("/hotel-spaces")
async def list_hotel_spaces(property_id: Optional[str] = None, current_user: UserModel = Depends(get_current_user)):
    q = {"property_id": property_id} if property_id else {}
    spaces = await db.hotel_spaces.find(q, {"_id": 0}).to_list(100)
    return spaces

@api_router.post("/hotel-spaces")
async def create_hotel_space(data: HotelSpaceCreate, current_user: UserModel = Depends(require_role("admin", "manager"))):
    space = HotelSpaceModel(**data.model_dump())
    await db.hotel_spaces.insert_one(space.model_dump())
    return space.model_dump()

@api_router.patch("/hotel-spaces/{space_id}")
async def update_hotel_space(space_id: str, data: dict, current_user: UserModel = Depends(require_role("admin", "manager"))):
    await db.hotel_spaces.update_one({"id": space_id}, {"$set": data})
    s = await db.hotel_spaces.find_one({"id": space_id}, {"_id": 0})
    if not s: raise HTTPException(status_code=404, detail="Espacio no encontrado")
    return s

@api_router.delete("/hotel-spaces/{space_id}")
async def delete_hotel_space(space_id: str, current_user: UserModel = Depends(require_role("admin", "manager"))):
    await db.hotel_spaces.delete_one({"id": space_id})
    return {"deleted": True}

# ====================== EVENT BOOKINGS ======================

@api_router.get("/event-bookings")
async def list_event_bookings(property_id: Optional[str] = None, current_user: UserModel = Depends(get_current_user)):
    q = {"property_id": property_id} if property_id else {}
    bookings = await db.event_bookings.find(q, {"_id": 0}).sort("event_date", -1).to_list(500)
    return bookings

@api_router.post("/event-bookings")
async def create_event_booking(data: EventBookingCreate, current_user: UserModel = Depends(get_current_user)):
    space = await db.event_spaces.find_one({"id": data.event_space_id}, {"_id": 0})
    space_name = space["space_name"] if space else "Espacio"
    booking = EventBookingModel(**data.model_dump(), event_space_name=space_name, created_by=current_user.id)
    await db.event_bookings.insert_one(booking.model_dump())
    return booking.model_dump()

@api_router.patch("/event-bookings/{booking_id}/status")
async def update_event_booking_status(booking_id: str, data: dict, current_user: UserModel = Depends(get_current_user)):
    allowed = {"booking_status", "payment_status", "notes"}
    update = {k: v for k, v in data.items() if k in allowed}
    await db.event_bookings.update_one({"id": booking_id}, {"$set": update})
    b = await db.event_bookings.find_one({"id": booking_id}, {"_id": 0})
    if not b: raise HTTPException(status_code=404, detail="Reserva de evento no encontrada")
    return b

@api_router.delete("/event-bookings/{booking_id}")
async def delete_event_booking(booking_id: str, current_user: UserModel = Depends(require_role("admin", "receptionist"))):
    await db.event_bookings.delete_one({"id": booking_id})
    return {"deleted": True}

# ====================== CORPORATE DASHBOARD ======================

@api_router.get("/corporate/dashboard")
async def corporate_dashboard(current_user: UserModel = Depends(require_role("admin", "owner"))):
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

    properties = await db.properties.find({}, {"_id": 0}).to_list(100)

    # ====== HOTEL METRICS ======
    hotel_res = await db.reservations.find({"status": {"$nin": ["cancelled"]}}, {"_id": 0}).to_list(10000)
    hotel_res_month = [r for r in hotel_res if r.get("check_in_date", "") >= month_start]
    hotel_revenue_month = sum(r.get("total_amount", 0) for r in hotel_res_month)
    hotel_revenue_total = sum(r.get("total_amount", 0) for r in hotel_res)
    hotel_rooms_total = await db.rooms.count_documents({})
    hotel_rooms_occupied = await db.rooms.count_documents({"status": {"$in": ["occupied", "reserved"]}})
    hotel_rooms_available = await db.rooms.count_documents({"status": "available"})
    hotel_occ_rate = round((hotel_rooms_occupied / hotel_rooms_total * 100) if hotel_rooms_total else 0, 1)
    hotel_pending_pay = await db.reservations.count_documents({"payment_status": "pending", "status": {"$in": ["confirmed","checked_in"]}})
    total_hotel_res = await db.reservations.count_documents({})
    cancelled_hotel_res = await db.reservations.count_documents({"status": "cancelled"})
    hotel_score = calculate_hotel_score(hotel_occ_rate, hotel_pending_pay, total_hotel_res, cancelled_hotel_res)

    # Expected hotel revenue (confirmed not yet checked in)
    expected_hotel_res = await db.reservations.find(
        {"status": "confirmed"}, {"_id": 0, "total_amount": 1}).to_list(10000)
    expected_hotel_revenue = sum(r.get("total_amount", 0) for r in expected_hotel_res)

    # Last month hotel revenue
    hotel_last_month = await db.reservations.find(
        {"check_in_date": {"$gte": last_month_start, "$lt": last_month_end}, "status": {"$nin": ["cancelled"]}},
        {"_id": 0, "total_amount": 1}).to_list(1000)
    hotel_last_month_revenue = sum(r.get("total_amount", 0) for r in hotel_last_month)

    # Revenue opportunity for hotel
    rooms_prices = await db.rooms.find({}, {"_id": 0, "price_per_night": 1}).to_list(1000)
    avg_room_rate = (sum(r.get("price_per_night", 0) for r in rooms_prices) / len(rooms_prices)) if rooms_prices else 1500
    revenue_opportunity = round(hotel_rooms_available * avg_room_rate * remaining_days, 0)

    # ====== EVENT GARDEN METRICS ======
    event_bookings = await db.event_bookings.find({"booking_status": {"$ne": "cancelled"}}, {"_id": 0}).to_list(10000)
    event_bookings_month = [b for b in event_bookings if b.get("event_date", "") >= month_start]
    event_revenue_month = sum(b.get("total_price", 0) for b in event_bookings_month)
    event_revenue_total = sum(b.get("total_price", 0) for b in event_bookings)
    event_pending_pay = sum(1 for b in event_bookings if b.get("payment_status") == "pending")
    upcoming_events = [b for b in event_bookings if b.get("event_date", "") >= today_str]
    expected_event_revenue = sum(b.get("total_price", 0) for b in upcoming_events)
    garden_score = calculate_garden_score(len(upcoming_events), event_pending_pay, len(event_bookings))

    # Last month event revenue
    event_last_month = await db.event_bookings.find(
        {"event_date": {"$gte": last_month_start, "$lt": last_month_end}, "booking_status": {"$ne": "cancelled"}},
        {"_id": 0, "total_price": 1}).to_list(1000)
    event_last_month_revenue = sum(b.get("total_price", 0) for b in event_last_month)

    # ====== GROUP METRICS ======
    total_staff = await db.users.count_documents({"is_active": True})
    total_month_revenue = hotel_revenue_month + event_revenue_month
    total_last_month_revenue = hotel_last_month_revenue + event_last_month_revenue
    expected_total_revenue = expected_hotel_revenue + expected_event_revenue

    revenue_growth_pct = 0.0
    if total_last_month_revenue > 0:
        revenue_growth_pct = round((total_month_revenue - total_last_month_revenue) / total_last_month_revenue * 100, 1)
    elif total_month_revenue > 0:
        revenue_growth_pct = 100.0

    projected_month_revenue = round((total_month_revenue / today.day * days_in_month) if today.day > 0 else 0)

    # Property ranking by monthly revenue — get actual names from DB
    hotel_prop = await db.properties.find_one({"type": "hotel"}, {"_id": 0, "name": 1})
    garden_prop = await db.properties.find_one({"type": "event_garden"}, {"_id": 0, "name": 1})
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
        {"$match": {"status": {"$nin": ["cancelled"]}}},
        {"$group": {"_id": "$reservation_source", "count": {"$sum": 1}, "revenue": {"$sum": "$total_amount"}}}
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
        {"$match": {"status": {"$nin": ["cancelled"]}}},
        {"$group": {"_id": {"$substr": ["$check_in_date",0,7]}, "revenue":{"$sum":"$total_amount"},"count":{"$sum":1}}},
        {"$sort": {"_id": -1}}, {"$limit": 6}]).to_list(6)
    monthly_events = await db.event_bookings.aggregate([
        {"$match": {"booking_status": {"$ne": "cancelled"}}},
        {"$group": {"_id": {"$substr": ["$event_date",0,7]}, "revenue":{"$sum":"$total_price"},"count":{"$sum":1}}},
        {"$sort": {"_id": -1}}, {"$limit": 6}]).to_list(6)
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

    return {
        "properties": properties,
        "hotel": {
            "property_name": "Alma Hotel Boutique",
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
            "property_name": "Jardín de Amargati",
            "property_type": "event_garden",
            "revenue_this_month": event_revenue_month,
            "revenue_total": event_revenue_total,
            "bookings_this_month": len(event_bookings_month),
            "bookings_total": len(event_bookings),
            "pending_payments": event_pending_pay,
            "upcoming_events": len(upcoming_events),
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
    }

@api_router.get("/properties/stats")
async def properties_stats(current_user: UserModel = Depends(require_role("admin", "owner"))):
    """Per-property aggregated stats for HotelsOverview and EventGardensOverview."""
    from datetime import date as dt_date
    today_str = dt_date.today().isoformat()
    month_start = dt_date.today().replace(day=1).isoformat()

    properties = await db.properties.find({}, {"_id": 0}).to_list(100)
    result = []

    for prop in properties:
        if prop["type"] == "hotel":
            total_rooms = await db.rooms.count_documents({})
            occupied_rooms = await db.rooms.count_documents({"status": {"$in": ["occupied", "reserved"]}})
            occupancy_rate = round((occupied_rooms / total_rooms * 100) if total_rooms > 0 else 0, 1)
            month_res = await db.reservations.find(
                {"check_in_date": {"$gte": month_start}, "status": {"$nin": ["cancelled"]}},
                {"_id": 0, "total_amount": 1}).to_list(1000)
            monthly_revenue = sum(r.get("total_amount", 0) for r in month_res)
            pending_payments = await db.reservations.count_documents(
                {"payment_status": "pending", "status": {"$in": ["confirmed", "checked_in"]}})
            total_res = await db.reservations.count_documents({})
            cancelled_res = await db.reservations.count_documents({"status": "cancelled"})
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
            extras_html += f"<li style='font-size:13px;color:#666;'>{e['name']} — ${e['price']:,.0f} MXN</li>"
        extras_html += "</ul>"
    type_label = "Junior Suite" if booking_data.get("room_type") == "junior_suite" else "Habitación Doble"
    html_body = f"""
    <div style="font-family:'Montserrat',Arial,sans-serif;max-width:600px;margin:0 auto;background:#faf8f3;padding:0;">
      <div style="background:linear-gradient(135deg,#625746,#917a6a);padding:40px 32px;text-align:center;">
        <p style="color:#d2c7b6;font-size:11px;letter-spacing:0.3em;margin:0 0 8px;">ALMA HOTEL BOUTIQUE</p>
        <h1 style="color:#fcf5e0;font-size:32px;font-weight:300;margin:0;letter-spacing:0.02em;font-family:Georgia,serif;">Reserva Confirmada</h1>
      </div>
      <div style="padding:32px;">
        <p style="color:#625746;font-size:15px;margin:0 0 20px;">Estimado/a <strong>{booking_data['first_name']} {booking_data['last_name']}</strong>,</p>
        <p style="color:#666;font-size:14px;margin:0 0 24px;line-height:1.6;">Nos complace confirmar su reserva. A continuación encontrará el resumen de su estancia:</p>
        <div style="background:#fff;border:1px solid #e8dfd5;border-radius:12px;padding:24px;margin-bottom:20px;">
          <p style="color:#917a6a;font-size:11px;letter-spacing:0.15em;margin:0 0 12px;font-weight:600;">DETALLES DE LA RESERVA</p>
          <table style="width:100%;border-collapse:collapse;">
            <tr><td style="padding:6px 0;color:#666;font-size:13px;">Referencia</td><td style="padding:6px 0;color:#625746;font-size:13px;font-weight:600;text-align:right;">#{booking_ref}</td></tr>
            <tr><td style="padding:6px 0;color:#666;font-size:13px;">Habitación</td><td style="padding:6px 0;color:#625746;font-size:13px;font-weight:600;text-align:right;">{booking_data.get('room_number','—')} · {type_label}</td></tr>
            <tr><td style="padding:6px 0;color:#666;font-size:13px;">Check-in</td><td style="padding:6px 0;color:#625746;font-size:13px;font-weight:600;text-align:right;">{booking_data['check_in_date']}</td></tr>
            <tr><td style="padding:6px 0;color:#666;font-size:13px;">Check-out</td><td style="padding:6px 0;color:#625746;font-size:13px;font-weight:600;text-align:right;">{booking_data['check_out_date']}</td></tr>
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
async def lookup_booking(booking_ref: str, email: str):
    # booking_ref is first 8 chars of reservation id (uppercased)
    reservations = await db.reservations.find(
        {"guest_name": {"$exists": True}}, {"_id": 0}
    ).to_list(10000)
    match = None
    for r in reservations:
        if r["id"][:8].upper() == booking_ref.upper():
            match = r
            break
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
async def check_availability(check_in: str, check_out: str, adults: int = 2):
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
async def create_public_booking(data: PublicBookingCreate):
    from datetime import date as dt_date
    ci = dt_date.fromisoformat(data.check_in_date)
    co = dt_date.fromisoformat(data.check_out_date)
    nights = (co - ci).days
    if nights <= 0:
        raise HTTPException(status_code=400, detail="Fechas inválidas")
    room = await find_available_room_of_type(data.room_type, data.check_in_date, data.check_out_date)
    if not room:
        raise HTTPException(status_code=409, detail="No hay habitaciones disponibles para esas fechas")
    room_price = room["price_per_night"] * nights
    extras_total = calculate_extras_total(data.extras, data.adults, nights)
    total_amount = room_price + extras_total
    guest = await db.guests.find_one({"email": data.email}, {"_id": 0})
    if not guest:
        guest_obj = GuestModel(first_name=data.first_name, last_name=data.last_name,
                               email=data.email, phone=data.phone, id_number=data.id_number)
        await db.guests.insert_one(guest_obj.model_dump())
        guest = guest_obj.model_dump()
    system_user = await db.users.find_one({"role": "admin"}, {"_id": 0})
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
                system_user = await db.users.find_one({"role": "admin"}, {"_id": 0})
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
async def list_tenants(current_user: UserModel = Depends(require_role("platform_admin", "admin", "owner"))):
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
async def get_tenant(tenant_id: str, current_user: UserModel = Depends(require_role("platform_admin", "admin", "owner"))):
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
async def create_room_type(data: RoomTypeCreate, current_user: UserModel = Depends(require_role("platform_admin", "admin"))):
    rt = RoomTypeModel(**data.model_dump())
    await db.room_types.insert_one(rt.model_dump())
    return rt.model_dump()

@api_router.patch("/room-types/{rt_id}")
async def update_room_type(rt_id: str, data: dict, current_user: UserModel = Depends(require_role("platform_admin", "admin"))):
    await db.room_types.update_one({"id": rt_id}, {"$set": data})
    rt = await db.room_types.find_one({"id": rt_id}, {"_id": 0})
    if not rt: raise HTTPException(status_code=404, detail="Tipo de habitación no encontrado")
    return rt

@api_router.delete("/room-types/{rt_id}")
async def delete_room_type(rt_id: str, current_user: UserModel = Depends(require_role("platform_admin", "admin"))):
    await db.room_types.delete_one({"id": rt_id})
    return {"deleted": True}

# --- Amenities Catalog ---
@api_router.get("/amenities")
async def list_amenities(current_user: UserModel = Depends(get_current_user)):
    return await db.amenities.find({}, {"_id": 0}).to_list(200)

@api_router.post("/amenities")
async def create_amenity(data: AmenityCreate, current_user: UserModel = Depends(require_role("platform_admin", "admin"))):
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
async def get_all_role_permissions(current_user: UserModel = Depends(require_role("platform_admin", "admin"))):
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
            owner_user = UserModel(
                name=data["owner_name"], email=data["owner_email"],
                password_hash=hash_password("owner123"), role="owner",
                department="Dirección", avatar_color="#8B5CF6")
            await db.users.insert_one(owner_user.model_dump())
            created_users.append({"role": "owner", "email": data["owner_email"], "temp_password": "owner123"})

    # Create admin account
    if data.get("admin_email") and data.get("admin_name"):
        if not await db.users.find_one({"email": data["admin_email"]}):
            admin_user = UserModel(
                name=data["admin_name"], email=data["admin_email"],
                password_hash=hash_password("admin123"), role="admin",
                department="Administración", avatar_color="#059669")
            await db.users.insert_one(admin_user.model_dump())
            created_users.append({"role": "admin", "email": data["admin_email"], "temp_password": "admin123"})

    return {
        "success": True, "property_id": prop.id, "property_name": prop.name,
        "property_type": property_type, "created_rooms": created_rooms,
        "created_spaces": created_spaces, "created_users": created_users,
    }

# --- Feature Toggles ---
@api_router.get("/properties/{prop_id}/features")
async def get_features(prop_id: str, current_user: UserModel = Depends(get_current_user)):
    prop = await db.properties.find_one({"id": prop_id}, {"_id": 0, "id": 1, "feature_toggles": 1})
    if prop is None: raise HTTPException(status_code=404, detail="Propiedad no encontrada")
    return prop.get("feature_toggles", {
        "inbox": True, "tasks": True, "reports": True,
        "public_catalog": True, "online_booking": True,
        "payments": True, "analytics_dashboard": True
    })

@api_router.patch("/properties/{prop_id}/features")
async def update_features(prop_id: str, features: dict, current_user: UserModel = Depends(require_role("admin", "platform_admin"))):
    await db.properties.update_one({"id": prop_id}, {"$set": {"feature_toggles": features}})
    return features

# ====================== APP STARTUP ======================

@app.on_event("startup")
async def startup():
    await seed_data()
    await seed_properties()
    await seed_owner()
    await seed_platform_admin()
    await seed_tenants()
    await seed_room_types()
    await seed_amenities()

@app.on_event("shutdown")
async def shutdown(): client.close()

app.include_router(api_router)
app.add_middleware(CORSMiddleware, allow_credentials=True,
                   allow_origins=CORS_ORIGINS_LIST,
                   allow_methods=["*"], allow_headers=["*"])
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

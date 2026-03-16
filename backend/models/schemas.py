"""
Pydantic models and role-permission defaults for the STAYLO API.
No dependencies on server, routers, or db — safe to import from anywhere.
"""
from datetime import datetime, timezone
from typing import List, Optional
import uuid

from pydantic import BaseModel, Field


# ----- User -----
class UserModel(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    email: str
    password_hash: str
    role: str
    admin_type: Optional[str] = None  # platform_admin | platform_support | billing_admin | technical_admin | hotel_admin
    staff_subtype: Optional[str] = None  # recepcion | limpieza | mantenimiento | seguridad | restaurante
    department: Optional[str] = None
    phone: Optional[str] = None
    is_active: bool = True
    avatar_color: str = "#059669"
    custom_permissions: Optional[List[str]] = None
    property_id: Optional[str] = None
    tenant_id: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class UserCreate(BaseModel):
    name: str
    email: str
    password: str
    role: str
    admin_type: Optional[str] = None
    staff_subtype: Optional[str] = None
    department: Optional[str] = None
    phone: Optional[str] = None
    custom_permissions: Optional[List[str]] = None
    property_id: Optional[str] = None
    tenant_id: Optional[str] = None


class UserUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    role: Optional[str] = None
    admin_type: Optional[str] = None
    staff_subtype: Optional[str] = None
    department: Optional[str] = None
    phone: Optional[str] = None
    is_active: Optional[bool] = None
    custom_permissions: Optional[List[str]] = None
    property_id: Optional[str] = None
    tenant_id: Optional[str] = None
    password: Optional[str] = None


class UserResponse(BaseModel):
    id: str
    name: str
    email: str
    role: str
    department: Optional[str] = None
    phone: Optional[str] = None
    is_active: bool
    avatar_color: str
    created_at: str
    custom_permissions: Optional[List[str]] = None
    admin_type: Optional[str] = None
    staff_subtype: Optional[str] = None
    property_id: Optional[str] = None
    tenant_id: Optional[str] = None


# ----- Room -----
class RoomModel(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    number: str
    type: str
    floor: int
    status: str = "available"
    amenities: List[str] = []
    price_per_night: float
    capacity: int = 2
    description: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class RoomCreate(BaseModel):
    number: str
    type: str
    floor: int
    amenities: List[str] = []
    price_per_night: float
    capacity: int = 2
    description: Optional[str] = None


class RoomUpdate(BaseModel):
    number: Optional[str] = None
    type: Optional[str] = None
    floor: Optional[int] = None
    status: Optional[str] = None
    amenities: Optional[List[str]] = None
    price_per_night: Optional[float] = None
    capacity: Optional[int] = None
    description: Optional[str] = None


# ----- Guest -----
class GuestModel(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    first_name: str
    last_name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    id_number: Optional[str] = None
    nationality: Optional[str] = None
    address: Optional[str] = None
    notes: Optional[str] = None
    is_vip: bool = False
    preferred_room_type: Optional[str] = None
    internal_notes: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class GuestCreate(BaseModel):
    first_name: str
    last_name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    id_number: Optional[str] = None
    nationality: Optional[str] = None
    address: Optional[str] = None
    notes: Optional[str] = None
    is_vip: bool = False
    preferred_room_type: Optional[str] = None
    internal_notes: Optional[str] = None


# ----- Reservation -----
class ReservationModel(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    guest_id: str
    guest_name: str
    room_id: str
    room_number: str
    check_in_date: str
    check_out_date: str
    status: str = "confirmed"
    total_amount: float
    adults: int = 1
    children: int = 0
    notes: Optional[str] = None
    created_by: str
    payment_status: str = "paid"
    payment_source: str = "internal"
    reservation_source: str = "reception"  # web | reception | whatsapp | other
    event_name: Optional[str] = None
    property_id: str = "alma_hotel"
    property_type: str = "hotel"
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class ReservationCreate(BaseModel):
    guest_id: str
    room_id: str
    check_in_date: str
    check_out_date: str
    adults: int = 1
    children: int = 0
    notes: Optional[str] = None
    reservation_source: str = "reception"


# ----- Message -----
class MessageModel(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    thread_id: str
    sender_id: str
    sender_name: str
    receiver_id: str
    receiver_name: str
    subject: Optional[str] = None
    content: str
    message_type: str = "staff_to_staff"
    is_read: bool = False
    is_reply: bool = False
    parent_id: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class MessageCreate(BaseModel):
    receiver_id: str
    subject: Optional[str] = None
    content: str
    message_type: str = "staff_to_staff"
    thread_id: Optional[str] = None
    parent_id: Optional[str] = None


# ----- Task -----
class TaskModel(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    description: Optional[str] = None
    assigned_to: Optional[str] = None
    assigned_to_name: Optional[str] = None
    assigned_by: str
    assigned_by_name: str
    room_id: Optional[str] = None
    room_number: Optional[str] = None
    priority: str = "medium"
    status: str = "pending"
    category: str = "general"
    due_date: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class TaskCreate(BaseModel):
    title: str
    description: Optional[str] = None
    assigned_to: Optional[str] = None
    room_id: Optional[str] = None
    priority: str = "medium"
    category: str = "general"
    due_date: Optional[str] = None


# ----- Public booking (ExtrasRequest before PublicBookingCreate) -----
class ExtrasRequest(BaseModel):
    desayuno: bool = False
    early_checkin: bool = False
    late_checkout: bool = False


# ----- Property, EventSpace, HotelSpace, EventBooking -----
class PropertyModel(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    type: str = "hotel"  # hotel | event_garden
    status: str = "active"  # active | inactive
    description: Optional[str] = None
    address: Optional[str] = None
    tenant_id: Optional[str] = None
    feature_toggles: dict = Field(
        default_factory=lambda: {
            "inbox": True,
            "tasks": True,
            "catalog": True,
            "public_booking": True,
            "advanced_reports": True,
        }
    )
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class PropertyCreate(BaseModel):
    name: str
    type: str = "hotel"
    status: str = "active"
    description: Optional[str] = None
    address: Optional[str] = None
    tenant_id: Optional[str] = None


class EventSpaceModel(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    property_id: str
    space_name: str
    capacity: int
    status: str = "available"
    description: Optional[str] = None
    price_per_event: Optional[float] = None
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class EventSpaceCreate(BaseModel):
    property_id: str
    space_name: str
    capacity: int
    status: str = "available"
    description: Optional[str] = None
    price_per_event: Optional[float] = None


class HotelSpaceModel(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    property_id: str
    space_name: str
    space_type: str = "general"  # salon | conference | rooftop | terrace | pool | general
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
    property_id: str
    event_space_id: str
    event_space_name: str
    client_name: str
    client_email: Optional[str] = None
    client_phone: Optional[str] = None
    event_date: str
    event_type: str  # wedding | corporate | birthday | social | other
    attendees: int = 0
    total_price: float = 0.0
    booking_status: str = "confirmed"  # confirmed | pending | cancelled
    payment_status: str = "pending"  # pending | paid
    notes: Optional[str] = None
    reservation_source: str = "reception"
    created_by: str = "admin"
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class EventBookingCreate(BaseModel):
    property_id: str
    event_space_id: str
    client_name: str
    client_email: Optional[str] = None
    client_phone: Optional[str] = None
    event_date: str
    event_type: str
    attendees: int = 0
    total_price: float = 0.0
    booking_status: str = "confirmed"
    notes: Optional[str] = None
    reservation_source: str = "reception"


# ----- Tenant -----
class TenantModel(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: Optional[str] = None
    status: str = "active"  # legacy compat: active | inactive | suspended
    contact_email: Optional[str] = None
    plan: str = "standard"  # standard | premium | enterprise
    plan_price: Optional[float] = None
    billing_status: Optional[str] = None
    next_billing_date: Optional[str] = None
    tenant_status: str = "Activo"  # Activo | Suspendido | Inactivo | En gracia
    internal_notes: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class TenantCreate(BaseModel):
    name: str
    description: Optional[str] = None
    status: str = "active"
    contact_email: Optional[str] = None
    plan: str = "standard"
    plan_price: Optional[float] = None
    billing_status: Optional[str] = None
    next_billing_date: Optional[str] = None
    tenant_status: str = "Activo"
    internal_notes: Optional[str] = None


# ----- RoomType, Amenity, Role Permissions -----
class RoomTypeModel(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: Optional[str] = None
    base_price: float = 0.0
    capacity: int = 2
    amenities: List[str] = []
    images: List[str] = []
    property_id: Optional[str] = None
    tenant_id: Optional[str] = None
    status: str = "active"
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class RoomTypeCreate(BaseModel):
    name: str
    description: Optional[str] = None
    base_price: float = 0.0
    capacity: int = 2
    amenities: List[str] = []
    images: List[str] = []
    property_id: Optional[str] = None
    tenant_id: Optional[str] = None


class AmenityModel(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    category: str = "general"
    icon: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class AmenityCreate(BaseModel):
    name: str
    category: str = "general"
    icon: Optional[str] = None


DEFAULT_ROLE_PERMISSIONS = {
    "platform_admin": ["platform_admin"],
    "admin": ["dashboard", "reservations", "rooms", "guests", "jardines", "inbox", "tasks", "catalog", "reports", "staff", "properties"],
    "owner": ["corporate", "hotels", "event-gardens", "reports"],
    "manager": ["dashboard", "reservations", "rooms", "guests", "jardines", "hotel-events", "inbox", "tasks", "catalog", "reports", "staff", "room-types"],
    "receptionist": ["dashboard", "reservations", "rooms", "guests", "jardines", "inbox", "tasks", "catalog"],
    "housekeeping": ["inbox", "tasks"],
    "maintenance": ["inbox", "tasks"],
    "security": ["inbox", "tasks"],
    "restaurant": ["inbox", "tasks"],
}


class RolePermissionUpdate(BaseModel):
    modules: List[str]


# ----- Public booking DTOs -----
class PublicBookingCreate(BaseModel):
    check_in_date: str
    check_out_date: str
    adults: int = 2
    children: int = 0
    room_type: str
    extras: ExtrasRequest = Field(default_factory=ExtrasRequest)
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
    check_in_date: str
    check_out_date: str
    adults: int
    children: int
    room_type: str
    extras: dict = {}
    first_name: str
    last_name: str
    email: str
    phone: str
    id_number: Optional[str] = None
    special_requests: Optional[str] = None
    total_amount: float
    nights: int
    status: str = "pending"
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class PaymentTransactionModel(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    session_id: str
    booking_id: Optional[str] = None
    amount: float
    currency: str = "mxn"
    payment_status: str = "initiated"
    metadata: dict = {}
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


# ----- Auth (request DTO only) -----
class LoginRequest(BaseModel):
    email: str
    password: str

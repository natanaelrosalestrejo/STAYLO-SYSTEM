#!/usr/bin/env python3
"""
Destructive reset of MongoDB database `staylo` ONLY.

- Clears application collections listed in CLEAR_COLLECTIONS.
- Recreates deterministic demo: 1 tenant, 3 properties, 40 rooms, 7 tenant-facing users (+ platform admin), guests,
  reservations, event/hotel spaces, event bookings, 3 tasks, 2 messages.
- Removes all role_permissions documents (code defaults apply on next login).

SAFETY:
  Requires environment variable STAYLO_RESET_CONFIRM=1
  Optional: --dry-run (no writes; prints planned actions)

Usage (from backend/):
  STAYLO_RESET_CONFIRM=1 python scripts/reset_staylo_demo.py
  # Windows PowerShell:
  $env:STAYLO_RESET_CONFIRM="1"; python scripts/reset_staylo_demo.py

Requires: MONGO_URL in .env (or environment). Database name is ALWAYS `staylo` (ignores DB_NAME).
"""
from __future__ import annotations

import argparse
import os
import sys
import uuid
from datetime import date, timedelta
from pathlib import Path

# ---------------------------------------------------------------------------
# Bootstrap: backend root on path
# ---------------------------------------------------------------------------
BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

try:
    from dotenv import load_dotenv

    load_dotenv(BACKEND_ROOT / ".env")
except ImportError:
    pass

from passlib.context import CryptContext
from pymongo import MongoClient

from models import (  # noqa: E402
    EventBookingModel,
    EventSpaceModel,
    GuestModel,
    HotelSpaceModel,
    MessageModel,
    PropertyModel,
    ReservationModel,
    RoomModel,
    TaskModel,
    TenantModel,
    UserModel,
)

# ---------------------------------------------------------------------------
# Constants — deterministic IDs (reproducible demos / tests)
# ---------------------------------------------------------------------------
TARGET_DB = "staylo"

TENANT_ID = "tenant_demo_alma"
PROP_HOTEL = "alma_hotel"
PROP_GARDEN_MARGATI = "garden_margati"
PROP_GARDEN_ALMA = "garden_alma"

USER_PLATFORM = "user_demo_platform_admin"
USER_OWNER = "user_demo_owner"
USER_ADMIN = "user_demo_admin"
USER_RECEP = "user_demo_receptionist"
USER_MANAGER = "user_demo_manager"
USER_MANAGER_MULTI = "user_demo_manager_multi"
USER_HOUSEKEEPING = "user_demo_housekeeping"
USER_FINANCE = "user_demo_finance"

# Event space IDs (gardens)
SPACE_M_MAIN = "space_margati_principal"
SPACE_M_SALON = "space_margati_salon"
SPACE_A_TERRACE = "space_alma_terraza"
SPACE_A_LAWN = "space_alma_lawn"

# Hotel space IDs
HS_TERRACE = "hs_alma_terrace"
HS_ROOFTOP = "hs_alma_rooftop"
HS_POOL = "hs_alma_pool"

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(pw: str) -> str:
    return pwd_context.hash(pw)


# Order: children / dependents first (no FK enforcement in Mongo; logical order)
CLEAR_COLLECTIONS = [
    "event_lodging_assignments",
    "event_room_blocks",
    "payment_transactions",
    "pending_bookings",
    "messages",
    "tasks",
    "reservations",
    "event_bookings",
    "hotel_spaces",
    "event_spaces",
    "rooms",
    "guests",
    "users",
    "properties",
    "tenants",
    "role_permissions",
]


def run_reset(*, dry_run: bool) -> None:
    if not dry_run and os.environ.get("STAYLO_RESET_CONFIRM", "").strip() != "1":
        print(
            "ABORT: Set STAYLO_RESET_CONFIRM=1 to run destructive reset on database 'staylo'.\n"
            "Example (PowerShell): $env:STAYLO_RESET_CONFIRM='1'; python scripts/reset_staylo_demo.py"
        )
        sys.exit(1)

    mongo_url = os.environ.get("MONGO_URL", "").strip()
    if not mongo_url:
        print("ABORT: MONGO_URL is not set (.env or environment).")
        sys.exit(1)

    client = MongoClient(mongo_url, serverSelectionTimeoutMS=8000)
    db = client[TARGET_DB]

    # Sanity: never run against wrong DB name in code
    assert db.name == TARGET_DB

    print(f"Target database: {TARGET_DB} (only)")
    if dry_run:
        print("[DRY-RUN] No deletes or inserts will be performed.")

    # --- Clear ---
    for coll_name in CLEAR_COLLECTIONS:
        if dry_run:
            n = db[coll_name].count_documents({})
            print(f"  [dry-run] would delete_many {{}} from {coll_name} ({n} docs)")
        else:
            r = db[coll_name].delete_many({})
            print(f"  cleared {coll_name}: deleted {r.deleted_count}")

    if dry_run:
        print("[DRY-RUN] done.")
        client.close()
        return

    # --- Tenant ---
    tenant = TenantModel(
        id=TENANT_ID,
        name="Alma Hospitality Group",
        description="Tenant demo — Alma Hotel Boutique + Jardín Margati + Jardín Alma",
        status="active",
        contact_email="admin@almahotel.com",
        plan="enterprise",
    )
    db.tenants.insert_one(tenant.model_dump())

    # --- Properties ---
    hotel = PropertyModel(
        id=PROP_HOTEL,
        name="Alma Hotel Boutique",
        type="hotel",
        status="active",
        description="Hotel boutique demo — 40 habitaciones",
        tenant_id=TENANT_ID,
    )
    g_m = PropertyModel(
        id=PROP_GARDEN_MARGATI,
        name="Jardín Margati",
        type="event_garden",
        status="active",
        description="Jardín de eventos — espacios al aire libre",
        tenant_id=TENANT_ID,
    )
    g_a = PropertyModel(
        id=PROP_GARDEN_ALMA,
        name="Jardín Alma",
        type="event_garden",
        status="active",
        description="Jardín de eventos — ceremonias y recepciones",
        tenant_id=TENANT_ID,
    )
    for p in (hotel, g_m, g_a):
        db.properties.insert_one(p.model_dump())

    # --- Users (passwords match project docs) ---
    u_platform = UserModel(
        id=USER_PLATFORM,
        name="Platform Admin",
        email="platform@almasystem.com",
        password_hash=hash_password("platform123"),
        role="platform_admin",
        department="Platform",
        avatar_color="#1e293b",
    )
    u_owner = UserModel(
        id=USER_OWNER,
        name="Director General",
        email="owner@hotel.com",
        password_hash=hash_password("owner123"),
        role="owner",
        department="Dirección",
        avatar_color="#8B5CF6",
        property_id=PROP_HOTEL,
        tenant_id=TENANT_ID,
    )
    u_admin = UserModel(
        id=USER_ADMIN,
        name="Admin Hotel",
        email="admin@hotel.com",
        password_hash=hash_password("admin123"),
        role="admin",
        department="Administración",
        avatar_color="#059669",
        property_id=None,
        property_ids=[PROP_HOTEL, PROP_GARDEN_MARGATI, PROP_GARDEN_ALMA],
        tenant_id=TENANT_ID,
    )
    u_recep = UserModel(
        id=USER_RECEP,
        name="María García",
        email="maria@hotel.com",
        password_hash=hash_password("recep123"),
        role="receptionist",
        department="Recepción",
        avatar_color="#3B82F6",
        property_id=PROP_HOTEL,
        tenant_id=TENANT_ID,
    )
    u_manager = UserModel(
        id=USER_MANAGER,
        name="Gerente Demo",
        email="manager@hotel.com",
        password_hash=hash_password("manager123"),
        role="manager",
        department="Gerencia",
        avatar_color="#0D9488",
        property_id=PROP_HOTEL,
        tenant_id=TENANT_ID,
    )
    u_manager_multi = UserModel(
        id=USER_MANAGER_MULTI,
        name="Gerente Multi-sede",
        email="manager_multi@hotel.com",
        password_hash=hash_password("manager123"),
        role="manager",
        department="Gerencia",
        avatar_color="#0F766E",
        property_id=None,
        property_ids=[PROP_HOTEL, PROP_GARDEN_MARGATI],
        tenant_id=TENANT_ID,
    )
    u_housekeeping = UserModel(
        id=USER_HOUSEKEEPING,
        name="Carlos López",
        email="carlos@hotel.com",
        password_hash=hash_password("house123"),
        role="housekeeping",
        department="Housekeeping",
        avatar_color="#D97706",
        property_id=PROP_HOTEL,
        tenant_id=TENANT_ID,
    )
    u_finance = UserModel(
        id=USER_FINANCE,
        name="Finanzas Demo",
        email="finance@hotel.com",
        password_hash=hash_password("finance123"),
        role="finance",
        department="Finanzas",
        avatar_color="#0891b2",
        property_id=None,
        property_ids=[PROP_HOTEL, PROP_GARDEN_MARGATI, PROP_GARDEN_ALMA],
        tenant_id=TENANT_ID,
    )
    for u in (
        u_platform,
        u_owner,
        u_admin,
        u_recep,
        u_manager,
        u_manager_multi,
        u_housekeeping,
        u_finance,
    ):
        db.users.insert_one(u.model_dump())

    # --- Rooms: 40 (4 junior_suite at 5,15,25,35 + 36 double) ---
    double_amenities = [
        "WiFi",
        "TV",
        "Aire Acondicionado",
        "2 Camas Queen",
        "Baño Privado",
        "Regadera de Lluvia",
        "Caja de Seguridad",
        "Amenidades de Baño",
        "Secador de Cabello",
    ]
    suite_amenities = [
        "WiFi",
        "TV",
        "Aire Acondicionado",
        "Cama King Size",
        "Sofá Cama",
        "Vestidor",
        "Doble Lavabo",
        "Regadera de Lluvia",
        "Amenidades de Baño",
        "Secador de Cabello",
    ]
    junior_suite_nums = {5, 15, 25, 35}
    rooms: list[RoomModel] = []
    for num in range(1, 41):
        floor = (num - 1) // 10 + 1
        is_suite = num in junior_suite_nums
        room = RoomModel(
            number=str(num),
            type="junior_suite" if is_suite else "double",
            floor=floor,
            price_per_night=2500.0 if is_suite else 1500.0,
            capacity=2 if is_suite else 4,
            amenities=suite_amenities if is_suite else double_amenities,
        )
        doc = room.model_dump()
        doc["property_id"] = PROP_HOTEL
        db.rooms.insert_one(doc)
        rooms.append(room)

    # --- Guests ---
    guests_data = [
        GuestModel(
            first_name="Juan",
            last_name="Pérez",
            email="juan@gmail.com",
            phone="+34 612 345 678",
            nationality="España",
            id_number="12345678A",
        ),
        GuestModel(
            first_name="Sophie",
            last_name="Martin",
            email="sophie@gmail.com",
            phone="+33 6 12 34 56 78",
            nationality="Francia",
            id_number="FR123456",
        ),
        GuestModel(
            first_name="James",
            last_name="Wilson",
            email="james@gmail.com",
            phone="+1 555 234 5678",
            nationality="EE.UU.",
            id_number="US789012",
        ),
        GuestModel(
            first_name="Isabella",
            last_name="Ferrari",
            email="isabella@gmail.com",
            phone="+39 347 123 4567",
            nationality="Italia",
        ),
    ]
    guests: list[GuestModel] = []
    for g in guests_data:
        db.guests.insert_one(g.model_dump())
        guests.append(g)

    today = date.today().strftime("%Y-%m-%d")
    tomorrow = (date.today() + timedelta(days=1)).strftime("%Y-%m-%d")
    next_week = (date.today() + timedelta(days=7)).strftime("%Y-%m-%d")
    two_days_ago = (date.today() - timedelta(days=2)).strftime("%Y-%m-%d")

    # rooms[1] = number "2", rooms[14] = "15", rooms[5] = "6", rooms[11] = "12"
    reservations = [
        ReservationModel(
            guest_id=guests[0].id,
            guest_name="Juan Pérez",
            room_id=rooms[1].id,
            room_number="2",
            check_in_date=today,
            check_out_date=next_week,
            status="checked_in",
            total_amount=10500.0,
            adults=2,
            created_by=u_recep.id,
            property_id=PROP_HOTEL,
        ),
        ReservationModel(
            guest_id=guests[1].id,
            guest_name="Sophie Martin",
            room_id=rooms[14].id,
            room_number="15",
            check_in_date=tomorrow,
            check_out_date=next_week,
            status="confirmed",
            total_amount=15000.0,
            adults=2,
            children=1,
            created_by=u_recep.id,
            property_id=PROP_HOTEL,
        ),
        ReservationModel(
            guest_id=guests[2].id,
            guest_name="James Wilson",
            room_id=rooms[5].id,
            room_number="6",
            check_in_date=two_days_ago,
            check_out_date=today,
            status="checked_out",
            total_amount=3000.0,
            adults=1,
            created_by=u_recep.id,
            property_id=PROP_HOTEL,
        ),
        ReservationModel(
            guest_id=guests[3].id,
            guest_name="Isabella Ferrari",
            room_id=rooms[11].id,
            room_number="12",
            check_in_date=today,
            check_out_date=tomorrow,
            status="confirmed",
            total_amount=1500.0,
            adults=2,
            created_by=u_recep.id,
            property_id=PROP_HOTEL,
        ),
    ]
    for r in reservations:
        db.reservations.insert_one(r.model_dump())

    db.rooms.update_one({"id": rooms[1].id}, {"$set": {"status": "occupied"}})
    db.rooms.update_one({"id": rooms[14].id}, {"$set": {"status": "reserved"}})
    db.rooms.update_one({"id": rooms[3].id}, {"$set": {"status": "cleaning"}})
    db.rooms.update_one({"id": rooms[6].id}, {"$set": {"status": "reserved"}})

    # --- Event spaces (gardens) ---
    es_m1 = EventSpaceModel(
        id=SPACE_M_MAIN,
        property_id=PROP_GARDEN_MARGATI,
        space_name="Jardín Principal",
        capacity=500,
        price_per_event=50000.0,
        description="Jardín amplio con iluminación y sonido",
    )
    es_m2 = EventSpaceModel(
        id=SPACE_M_SALON,
        property_id=PROP_GARDEN_MARGATI,
        space_name="Salón de Eventos",
        capacity=200,
        price_per_event=30000.0,
        description="Salón climatizado",
    )
    es_a1 = EventSpaceModel(
        id=SPACE_A_TERRACE,
        property_id=PROP_GARDEN_ALMA,
        space_name="Terraza Alma",
        capacity=120,
        price_per_event=25000.0,
        description="Terraza para ceremonias",
    )
    es_a2 = EventSpaceModel(
        id=SPACE_A_LAWN,
        property_id=PROP_GARDEN_ALMA,
        space_name="Césped Central",
        capacity=300,
        price_per_event=40000.0,
        description="Área de césped para eventos",
    )
    for s in (es_m1, es_m2, es_a1, es_a2):
        d = s.model_dump()
        d["id"] = s.id
        db.event_spaces.insert_one(d)

    # --- Hotel spaces ---
    hs = [
        HotelSpaceModel(
            id=HS_TERRACE,
            property_id=PROP_HOTEL,
            space_name="Terraza Hotel",
            space_type="terrace",
            capacity=60,
            price_per_event=12000.0,
            description="Terraza con vista",
        ),
        HotelSpaceModel(
            id=HS_ROOFTOP,
            property_id=PROP_HOTEL,
            space_name="Rooftop",
            space_type="rooftop",
            capacity=40,
            price_per_event=18000.0,
            description="Azotea para cócteles",
        ),
        HotelSpaceModel(
            id=HS_POOL,
            property_id=PROP_HOTEL,
            space_name="Área de Alberca",
            space_type="pool",
            capacity=80,
            price_per_event=15000.0,
            description="Eventos junto a la alberca",
        ),
    ]
    for h in hs:
        d = h.model_dump()
        d["id"] = h.id
        db.hotel_spaces.insert_one(d)

    # --- Event bookings ---
    td = date.today()
    eb1 = EventBookingModel(
        property_id=PROP_GARDEN_MARGATI,
        event_space_id=SPACE_M_MAIN,
        event_space_name="Jardín Principal",
        client_name="Familia Rodríguez",
        client_email="rodriguezboda@gmail.com",
        client_phone="+52 55 1234 5678",
        event_date=(td + timedelta(days=15)).isoformat(),
        event_type="wedding",
        attendees=350,
        total_price=85000.0,
        booking_status="confirmed",
        payment_status="pending",
        notes="Boda — catering confirmado",
        created_by=u_admin.id,
    )
    eb2 = EventBookingModel(
        property_id=PROP_GARDEN_MARGATI,
        event_space_id=SPACE_M_SALON,
        event_space_name="Salón de Eventos",
        client_name="Innovatec S.A.",
        client_email="eventos@innovatec.mx",
        client_phone="+52 55 9876 5432",
        event_date=(td + timedelta(days=5)).isoformat(),
        event_type="corporate",
        attendees=120,
        total_price=42000.0,
        booking_status="confirmed",
        payment_status="paid",
        notes="Presentación anual",
        created_by=u_admin.id,
    )
    eb3 = EventBookingModel(
        property_id=PROP_GARDEN_ALMA,
        event_space_id=SPACE_A_TERRACE,
        event_space_name="Terraza Alma",
        client_name="Lucía Fernández",
        client_email="lucia@gmail.com",
        client_phone="+52 55 5555 1234",
        event_date=(td + timedelta(days=20)).isoformat(),
        event_type="birthday",
        attendees=60,
        total_price=18000.0,
        booking_status="confirmed",
        payment_status="paid",
        notes="Celebración familiar",
        created_by=u_admin.id,
    )
    for b in (eb1, eb2, eb3):
        db.event_bookings.insert_one(b.model_dump())

    # --- Tasks (room numbers valid 1–40) ---
    tasks = [
        TaskModel(
            title="Limpieza habitación 15",
            description="Suite — preparar llegada Sophie Martin",
            assigned_to=u_recep.id,
            assigned_to_name=u_recep.name,
            assigned_by=u_admin.id,
            assigned_by_name=u_admin.name,
            room_id=rooms[14].id,
            room_number="15",
            priority="high",
            status="pending",
            category="housekeeping",
        ),
        TaskModel(
            title="Revisar AC habitación 8",
            description="Chequeo preventivo",
            assigned_to=u_admin.id,
            assigned_to_name=u_admin.name,
            assigned_by=u_admin.id,
            assigned_by_name=u_admin.name,
            room_id=rooms[7].id,
            room_number="8",
            priority="medium",
            status="in_progress",
            category="maintenance",
        ),
        TaskModel(
            title="Inventario minibar planta 2",
            description="Conteo semanal — demo seed",
            assigned_to=u_housekeeping.id,
            assigned_to_name=u_housekeeping.name,
            assigned_by=u_admin.id,
            assigned_by_name=u_admin.name,
            room_id=rooms[10].id,
            room_number="11",
            priority="low",
            status="pending",
            category="housekeeping",
        ),
    ]
    for t in tasks:
        db.tasks.insert_one(t.model_dump())

    thread1 = str(uuid.uuid4())
    msgs = [
        MessageModel(
            thread_id=thread1,
            sender_id=u_recep.id,
            sender_name=u_recep.name,
            receiver_id=u_admin.id,
            receiver_name=u_admin.name,
            subject="Llegadas del día",
            content="Confirmadas reservas habitaciones 2 y 12 para hoy.",
            message_type="staff_to_staff",
        ),
        MessageModel(
            thread_id=thread1,
            sender_id=u_admin.id,
            sender_name=u_admin.name,
            receiver_id=u_recep.id,
            receiver_name=u_recep.name,
            subject="Re: Llegadas del día",
            content="Recibido. Coordinar bienvenida en recepción.",
            message_type="staff_to_staff",
        ),
    ]
    for m in msgs:
        db.messages.insert_one(m.model_dump())

    print("Reset complete.")
    print(f"  tenants: {db.tenants.count_documents({})}")
    print(f"  properties: {db.properties.count_documents({})}")
    print(f"  rooms: {db.rooms.count_documents({})}")
    print(f"  users: {db.users.count_documents({})}")
    print(f"  reservations: {db.reservations.count_documents({})}")
    print(f"  event_bookings: {db.event_bookings.count_documents({})}")
    print(f"  role_permissions: {db.role_permissions.count_documents({})} (should be 0)")
    client.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Reset MongoDB database `staylo` to demo state.")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show planned clears only; no STAYLO_RESET_CONFIRM required for dry-run.",
    )
    args = parser.parse_args()
    run_reset(dry_run=args.dry_run)


if __name__ == "__main__":
    main()

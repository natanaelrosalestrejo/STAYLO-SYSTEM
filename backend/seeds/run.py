"""
Seed logic for the STAYLO API.
Runs at startup to populate demo data; safe to call multiple times (each seed is idempotent).
Imports only from db, models, and auth to avoid circular imports.
"""
import uuid
from typing import Optional

from auth import hash_password
from db import db
from models import (
    AmenityModel,
    EventBookingModel,
    EventSpaceModel,
    GuestModel,
    MessageModel,
    PropertyModel,
    ReservationModel,
    RoomModel,
    RoomTypeModel,
    TaskModel,
    TenantModel,
    UserModel,
)

# Demo hotel property id — must match the property created in seed_properties so scope filters work.
# Garden ids match backend/scripts/reset_staylo_demo.py for one canonical demo shape (3 properties, 4 event spaces).
DEMO_PROPERTY_ID = "alma_hotel"
DEMO_GARDEN_MARGATI_ID = "garden_margati"
DEMO_GARDEN_ALMA_ID = "garden_alma"

# Canonical demo logins: clear custom_permissions on startup so Mongo drift does not shrink effective_modules.
DEMO_USER_EMAILS = (
    "admin@hotel.com",
    "maria@hotel.com",
    "manager@hotel.com",
    "carlos@hotel.com",
    "ana@hotel.com",
    "owner@hotel.com",
    "finance@hotel.com",
)

COLORS = ["#059669", "#3B82F6", "#D97706", "#EF4444", "#8B5CF6", "#EC4899"]


async def seed_data():
    if await db.users.count_documents({}) > 0:
        return
    users = [
        UserModel(
            name="Admin Hotel",
            email="admin@hotel.com",
            password_hash=hash_password("admin123"),
            role="manager",
            department="Administración",
            avatar_color="#059669",
            property_id=None,
            property_ids=[DEMO_PROPERTY_ID, DEMO_GARDEN_MARGATI_ID, DEMO_GARDEN_ALMA_ID],
        ),
        UserModel(
            name="María García",
            email="maria@hotel.com",
            password_hash=hash_password("recep123"),
            role="receptionist",
            department="Recepción",
            avatar_color="#3B82F6",
            property_id=DEMO_PROPERTY_ID,
        ),
        UserModel(
            name="Carlos López",
            email="carlos@hotel.com",
            password_hash=hash_password("house123"),
            role="housekeeping",
            department="Housekeeping",
            avatar_color="#D97706",
            property_id=DEMO_PROPERTY_ID,
        ),
        UserModel(
            name="Ana Martínez",
            email="ana@hotel.com",
            password_hash=hash_password("maint123"),
            role="maintenance",
            department="Mantenimiento",
            avatar_color="#EF4444",
            property_id=DEMO_PROPERTY_ID,
        ),
        UserModel(
            name="Director General",
            email="owner@hotel.com",
            password_hash=hash_password("owner123"),
            role="owner",
            department="Dirección",
            avatar_color="#8B5CF6",
            property_id=DEMO_PROPERTY_ID,
        ),
        UserModel(
            name="Gerente Demo",
            email="manager@hotel.com",
            password_hash=hash_password("manager123"),
            role="manager",
            department="Gerencia",
            avatar_color="#0D9488",
            property_id=DEMO_PROPERTY_ID,
        ),
        UserModel(
            name="Finanzas Demo",
            email="finance@hotel.com",
            password_hash=hash_password("finance123"),
            role="finance",
            department="Finanzas",
            avatar_color="#0891b2",
            property_id=None,
            property_ids=[DEMO_PROPERTY_ID, DEMO_GARDEN_MARGATI_ID, DEMO_GARDEN_ALMA_ID],
        ),
        UserModel(
            name="Platform Admin",
            email="platform@almasystem.com",
            password_hash=hash_password("platform123"),
            role="platform_admin",
            department="Platform",
            avatar_color="#1e293b",
        ),
    ]
    for u in users:
        await db.users.insert_one(u.model_dump())

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
    junior_suite_rooms = {5, 15, 25, 35}

    room_data = []
    for num in range(1, 41):
        floor = (num - 1) // 10 + 1
        is_suite = num in junior_suite_rooms
        room_data.append(
            (
                str(num),
                "junior_suite" if is_suite else "double",
                floor,
                2500 if is_suite else 1500,
                2 if is_suite else 4,
                suite_amenities if is_suite else double_amenities,
            )
        )

    rooms = []
    for r in room_data:
        room = RoomModel(
            number=r[0],
            type=r[1],
            floor=r[2],
            price_per_night=r[3],
            capacity=r[4],
            amenities=r[5],
        )
        room_doc = room.model_dump()
        room_doc["property_id"] = DEMO_PROPERTY_ID
        await db.rooms.insert_one(room_doc)
        rooms.append(room)

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
        ReservationModel(
            guest_id=guests[0].id,
            guest_name="Juan Pérez",
            room_id=rooms[1].id,
            room_number="2",
            check_in_date=today,
            check_out_date=next_week,
            status="checked_in",
            total_amount=10500,
            adults=2,
            created_by=users[1].id,
        ),
        ReservationModel(
            guest_id=guests[1].id,
            guest_name="Sophie Martin",
            room_id=rooms[14].id,
            room_number="15",
            check_in_date=tomorrow,
            check_out_date=next_week,
            status="confirmed",
            total_amount=15000,
            adults=2,
            children=1,
            created_by=users[1].id,
        ),
        ReservationModel(
            guest_id=guests[2].id,
            guest_name="James Wilson",
            room_id=rooms[5].id,
            room_number="6",
            check_in_date=two_days_ago,
            check_out_date=today,
            status="checked_out",
            total_amount=3000,
            adults=1,
            created_by=users[1].id,
        ),
        ReservationModel(
            guest_id=guests[3].id,
            guest_name="Isabella Ferrari",
            room_id=rooms[11].id,
            room_number="12",
            check_in_date=today,
            check_out_date=tomorrow,
            status="confirmed",
            total_amount=1500,
            adults=2,
            created_by=users[1].id,
        ),
    ]
    for r in reservations:
        await db.reservations.insert_one(r.model_dump())
    await db.rooms.update_one({"id": rooms[1].id}, {"$set": {"status": "occupied"}})
    await db.rooms.update_one({"id": rooms[3].id}, {"$set": {"status": "reserved"}})
    await db.rooms.update_one({"id": rooms[4].id}, {"$set": {"status": "cleaning"}})
    await db.rooms.update_one({"id": rooms[6].id}, {"$set": {"status": "reserved"}})

    ops_lead = users[0]
    tasks = [
        TaskModel(
            title="Limpiar habitación 305",
            description="Limpieza profunda post check-out",
            assigned_to=users[2].id,
            assigned_to_name=users[2].name,
            assigned_by=ops_lead.id,
            assigned_by_name=ops_lead.name,
            room_id=rooms[14].id,
            room_number="305",
            priority="high",
            status="pending",
            category="housekeeping",
        ),
        TaskModel(
            title="Revisar AC habitación 204",
            description="Huésped reportó problemas con el aire acondicionado",
            assigned_to=users[3].id,
            assigned_to_name=users[3].name,
            assigned_by=ops_lead.id,
            assigned_by_name=ops_lead.name,
            room_id=rooms[8].id,
            room_number="204",
            priority="urgent",
            status="in_progress",
            category="maintenance",
        ),
        TaskModel(
            title="Preparar bienvenida VIP suite 104",
            description="Bouquet de flores y champagne para Sophie Martin",
            assigned_to=users[1].id,
            assigned_to_name=users[1].name,
            assigned_by=ops_lead.id,
            assigned_by_name=ops_lead.name,
            room_id=rooms[3].id,
            room_number="104",
            priority="high",
            status="pending",
            category="reception",
        ),
    ]
    for t in tasks:
        await db.tasks.insert_one(t.model_dump())

    thread1 = str(uuid.uuid4())
    thread2 = str(uuid.uuid4())
    thread3 = str(uuid.uuid4())
    msgs = [
        MessageModel(
            thread_id=thread1,
            sender_id=users[1].id,
            sender_name=users[1].name,
            receiver_id=ops_lead.id,
            receiver_name=ops_lead.name,
            subject="Solicitud upgrade suite 104",
            content="Hola, el huésped Sophie Martin llega mañana a la suite 104. ¿Podemos prepararle una bienvenida especial con champagne y flores?",
            message_type="staff_to_staff",
        ),
        MessageModel(
            thread_id=thread2,
            sender_id=users[2].id,
            sender_name=users[2].name,
            receiver_id=ops_lead.id,
            receiver_name=ops_lead.name,
            subject="Habitaciones listas",
            content="Las habitaciones 101, 103 y 205 ya están limpias y listas para recibir huéspedes. Continúo con la 305.",
            message_type="staff_to_staff",
        ),
        MessageModel(
            thread_id=thread3,
            sender_id=ops_lead.id,
            sender_name=ops_lead.name,
            receiver_id=guests[0].id,
            receiver_name="Juan Pérez",
            subject="Bienvenido al Hotel",
            content="Estimado Juan, bienvenido a nuestro hotel. Esperamos que su estancia sea perfecta. No dude en contactarnos para cualquier necesidad.",
            message_type="staff_to_guest",
        ),
    ]
    for m in msgs:
        await db.messages.insert_one(m.model_dump())


async def seed_properties():
    """Seed properties + event spaces — same shape as reset_staylo_demo: 3 properties, 4 spaces."""
    if await db.properties.count_documents({}) > 0:
        return
    hotel_prop = PropertyModel(
        id=DEMO_PROPERTY_ID,
        name="Alma Hotel Boutique",
        type="hotel",
        status="active",
        description="Hotel boutique de lujo — 40 habitaciones",
    )
    garden_m = PropertyModel(
        id=DEMO_GARDEN_MARGATI_ID,
        name="Jardín Margati",
        type="event_garden",
        status="active",
        description="Jardín de eventos — espacios al aire libre",
    )
    garden_a = PropertyModel(
        id=DEMO_GARDEN_ALMA_ID,
        name="Jardín Alma",
        type="event_garden",
        status="active",
        description="Jardín de eventos — ceremonias y recepciones",
    )
    for p in (hotel_prop, garden_m, garden_a):
        await db.properties.insert_one(p.model_dump())

    spaces = [
        EventSpaceModel(
            property_id=garden_m.id,
            space_name="Jardín Principal",
            capacity=500,
            price_per_event=50000.0,
            description="Jardín amplio con iluminación y sistema de sonido profesional",
        ),
        EventSpaceModel(
            property_id=garden_m.id,
            space_name="Salón de Eventos",
            capacity=200,
            price_per_event=30000.0,
            description="Salón climatizado para ceremonias y recepciones",
        ),
        EventSpaceModel(
            property_id=garden_a.id,
            space_name="Terraza Alma",
            capacity=120,
            price_per_event=25000.0,
            description="Terraza para ceremonias",
        ),
        EventSpaceModel(
            property_id=garden_a.id,
            space_name="Césped Central",
            capacity=300,
            price_per_event=40000.0,
            description="Área de césped para eventos",
        ),
    ]
    for s in spaces:
        await db.event_spaces.insert_one(s.model_dump())

    from datetime import date, timedelta as td

    today_d = date.today()
    sample_bookings = [
        EventBookingModel(
            property_id=garden_m.id,
            event_space_id=spaces[0].id,
            event_space_name=spaces[0].space_name,
            client_name="Familia Rodríguez",
            client_email="rodriguezboda@gmail.com",
            client_phone="+52 55 1234 5678",
            event_date=(today_d + td(days=15)).isoformat(),
            event_type="wedding",
            attendees=350,
            total_price=85000.0,
            booking_status="confirmed",
            payment_status="pending",
            notes="Boda con decoración floral, necesitan servicio de catering",
        ),
        EventBookingModel(
            property_id=garden_m.id,
            event_space_id=spaces[1].id,
            event_space_name=spaces[1].space_name,
            client_name="Empresa Innovatec S.A.",
            client_email="eventos@innovatec.mx",
            client_phone="+52 55 9876 5432",
            event_date=(today_d + td(days=5)).isoformat(),
            event_type="corporate",
            attendees=120,
            total_price=42000.0,
            booking_status="confirmed",
            payment_status="paid",
            notes="Presentación anual de resultados",
        ),
        EventBookingModel(
            property_id=garden_a.id,
            event_space_id=spaces[2].id,
            event_space_name=spaces[2].space_name,
            client_name="Lucía Fernández",
            client_email="lucia@gmail.com",
            client_phone="+52 55 5555 1234",
            event_date=(today_d - td(days=10)).isoformat(),
            event_type="birthday",
            attendees=60,
            total_price=18000.0,
            booking_status="confirmed",
            payment_status="paid",
            notes="Celebración familiar",
        ),
    ]
    for b in sample_bookings:
        await db.event_bookings.insert_one(b.model_dump())


async def seed_owner():
    """Seed owner user for existing databases that don't have one yet."""
    if await db.users.count_documents({"role": "owner"}) > 0:
        return
    owner = UserModel(
        name="Director General",
        email="owner@hotel.com",
        password_hash=hash_password("owner123"),
        role="owner",
        department="Dirección",
        avatar_color="#8B5CF6",
        property_id=DEMO_PROPERTY_ID,
    )
    await db.users.insert_one(owner.model_dump())


async def seed_platform_admin():
    """Seed platform admin for existing databases."""
    if await db.users.count_documents({"role": "platform_admin"}) > 0:
        return
    padmin = UserModel(
        name="Platform Admin",
        email="platform@almasystem.com",
        password_hash=hash_password("platform123"),
        role="platform_admin",
        department="Platform",
        avatar_color="#1e293b",
    )
    await db.users.insert_one(padmin.model_dump())


async def seed_tenants():
    """Seed initial tenant and assign existing properties to it."""
    if await db.tenants.count_documents({}) > 0:
        return
    tenant = TenantModel(
        name="Alma Hospitality Group",
        description="Grupo hotelero principal — Alma Hotel Boutique y Jardín de Amargati",
        status="active",
        contact_email="admin@almahotel.com",
        plan="enterprise",
    )
    await db.tenants.insert_one(tenant.model_dump())
    await db.properties.update_many({"tenant_id": None}, {"$set": {"tenant_id": tenant.id}})


async def seed_room_types():
    """Seed default room types catalog."""
    if await db.room_types.count_documents({}) > 0:
        return
    std = ["wifi", "tv", "private_bathroom", "shower", "safe_box"]
    types = [
        RoomTypeModel(
            name="Estándar",
            description="Habitación estándar con todas las comodidades esenciales.",
            base_price=850.0,
            capacity=2,
            amenities=std,
            status="active",
        ),
        RoomTypeModel(
            name="Deluxe",
            description="Habitación deluxe con minibar y vista al jardín.",
            base_price=1350.0,
            capacity=2,
            amenities=std + ["minibar", "air_conditioning"],
            status="active",
        ),
        RoomTypeModel(
            name="Junior Suite",
            description="Suite con sala de estar, balcón y amenidades premium.",
            base_price=2100.0,
            capacity=3,
            amenities=std + ["minibar", "balcony", "sofa_bed", "air_conditioning"],
            status="active",
        ),
        RoomTypeModel(
            name="Suite Master",
            description="Suite de lujo con jacuzzi, terraza privada y servicio VIP.",
            base_price=3500.0,
            capacity=4,
            amenities=std
            + [
                "minibar",
                "balcony",
                "jacuzzi",
                "sofa_bed",
                "air_conditioning",
                "coffee_maker",
            ],
            status="active",
        ),
    ]
    for t in types:
        await db.room_types.insert_one(t.model_dump())


async def seed_amenities():
    """Seed default amenities catalog."""
    if await db.amenities.count_documents({}) > 0:
        return
    amenities_data = [
        AmenityModel(name="WiFi", category="connectivity", icon="wifi", id="wifi"),
        AmenityModel(name="Smart TV", category="entertainment", icon="tv", id="tv"),
        AmenityModel(
            name="Aire Acondicionado", category="climate", icon="wind", id="air_conditioning"
        ),
        AmenityModel(name="Calefacción", category="climate", icon="flame", id="heating"),
        AmenityModel(name="Baño Privado", category="bathroom", icon="bath", id="private_bathroom"),
        AmenityModel(name="Ducha", category="bathroom", icon="droplets", id="shower"),
        AmenityModel(name="Bañera", category="bathroom", icon="bath", id="bathtub"),
        AmenityModel(name="Jacuzzi", category="bathroom", icon="waves", id="jacuzzi"),
        AmenityModel(name="Secador de Cabello", category="bathroom", icon="wind", id="hair_dryer"),
        AmenityModel(
            name="Artículos de Tocador", category="bathroom", icon="sparkles", id="toiletries"
        ),
        AmenityModel(name="Caja Fuerte", category="security", icon="lock", id="safe_box"),
        AmenityModel(name="Minibar", category="food", icon="glass-water", id="minibar"),
        AmenityModel(name="Cafetera", category="food", icon="coffee", id="coffee_maker"),
        AmenityModel(name="Sofá Cama", category="sleeping", icon="sofa", id="sofa_bed"),
        AmenityModel(name="Balcón", category="outdoor", icon="building", id="balcony"),
        AmenityModel(
            name="Terraza Privada", category="outdoor", icon="trees", id="private_terrace"
        ),
        AmenityModel(name="Vista al Mar", category="view", icon="waves", id="sea_view"),
        AmenityModel(name="Vista al Jardín", category="view", icon="leaf", id="garden_view"),
        AmenityModel(
            name="Servicio de Habitación",
            category="service",
            icon="concierge-bell",
            id="room_service",
        ),
        AmenityModel(name="Estacionamiento", category="service", icon="car", id="parking"),
    ]
    for a in amenities_data:
        await db.amenities.insert_one(a.model_dump())


async def _tenant_id_for_demo_backfill() -> Optional[str]:
    t = await db.tenants.find_one({}, {"_id": 0, "id": 1})
    return t["id"] if t else None


async def _backfill_user_tenant_ids():
    """Assign tenant_id to tenant-scoped hotel users (required for non-empty effective_modules)."""
    tid = await _tenant_id_for_demo_backfill()
    if not tid:
        return
    hotel_roles = [
        "owner",
        "receptionist",
        "sales",
        "manager",
        "finance",
        "housekeeping",
        "maintenance",
        "security",
        "restaurant",
    ]
    await db.users.update_many(
        {
            "role": {"$in": hotel_roles},
            "$or": [
                {"tenant_id": None},
                {"tenant_id": ""},
                {"tenant_id": {"$exists": False}},
            ],
        },
        {"$set": {"tenant_id": tid}},
    )


async def _normalize_demo_user_overrides():
    """Strip custom_permissions on canonical demo emails so role+tenant resolution is predictable."""
    await db.users.update_many(
        {"email": {"$in": DEMO_USER_EMAILS}},
        {"$unset": {"custom_permissions": ""}},
    )


async def seed_demo_manager_if_missing():
    """Idempotent: cuenta demo gerente para bases ya pobladas sin re-ejecutar seed_data."""
    if await db.users.find_one({"email": "manager@hotel.com"}):
        return
    tid = await _tenant_id_for_demo_backfill()
    if not tid:
        return
    u = UserModel(
        name="Gerente Demo",
        email="manager@hotel.com",
        password_hash=hash_password("manager123"),
        role="manager",
        department="Gerencia",
        avatar_color="#0D9488",
        property_id=DEMO_PROPERTY_ID,
        tenant_id=tid,
    )
    await db.users.insert_one(u.model_dump())


async def seed_demo_manager_multi_if_missing():
    """Idempotent: gerente con property_ids (hotel + un jardín) para probar alcance multi-propiedad."""
    if await db.users.find_one({"email": "manager_multi@hotel.com"}):
        return
    tid = await _tenant_id_for_demo_backfill()
    if not tid:
        return
    u = UserModel(
        name="Gerente Multi-sede",
        email="manager_multi@hotel.com",
        password_hash=hash_password("manager123"),
        role="manager",
        department="Gerencia",
        avatar_color="#0F766E",
        property_id=None,
        property_ids=[DEMO_PROPERTY_ID, DEMO_GARDEN_MARGATI_ID],
        tenant_id=tid,
    )
    await db.users.insert_one(u.model_dump())


async def seed_demo_finance_if_missing():
    """Idempotent: cuenta demo finanzas (misma forma que reset) cuando la BD ya existía sin seed_data."""
    if await db.users.find_one({"email": "finance@hotel.com"}):
        return
    tid = await _tenant_id_for_demo_backfill()
    if not tid:
        return
    u = UserModel(
        name="Finanzas Demo",
        email="finance@hotel.com",
        password_hash=hash_password("finance123"),
        role="finance",
        department="Finanzas",
        avatar_color="#0891b2",
        property_id=None,
        property_ids=[DEMO_PROPERTY_ID, DEMO_GARDEN_MARGATI_ID, DEMO_GARDEN_ALMA_ID],
        tenant_id=tid,
    )
    await db.users.insert_one(u.model_dump())


async def seed_demo_housekeeping_if_missing():
    """Idempotent: housekeeping demo user (matches reset) when DB was populated without seed_data."""
    if await db.users.find_one({"email": "carlos@hotel.com"}):
        return
    tid = await _tenant_id_for_demo_backfill()
    if not tid:
        return
    u = UserModel(
        name="Carlos López",
        email="carlos@hotel.com",
        password_hash=hash_password("house123"),
        role="housekeeping",
        department="Housekeeping",
        avatar_color="#D97706",
        property_id=DEMO_PROPERTY_ID,
        tenant_id=tid,
    )
    await db.users.insert_one(u.model_dump())


async def _backfill_demo_scope():
    """One-time backfill: assign DEMO_PROPERTY_ID to existing users/rooms that have none (e.g. DBs seeded before scope was added)."""
    hotel_roles = [
        "receptionist",
        "sales",
        "manager",
        "finance",
        "housekeeping",
        "maintenance",
        "security",
        "restaurant",
        "owner",
    ]
    await db.users.update_many(
        {
            "$and": [
                {"role": {"$in": hotel_roles}},
                {
                    "$or": [
                        {"property_id": None},
                        {"property_id": {"$exists": False}},
                        {"property_id": ""},
                    ]
                },
                {
                    "$or": [
                        {"property_ids": {"$exists": False}},
                        {"property_ids": None},
                        {"property_ids": []},
                    ]
                },
            ]
        },
        {"$set": {"property_id": DEMO_PROPERTY_ID}},
    )
    await db.rooms.update_many(
        {"$or": [{"property_id": None}, {"property_id": {"$exists": False}}]},
        {"$set": {"property_id": DEMO_PROPERTY_ID}},
    )


async def _repair_receptionist_module_sources():
    """
    Mongo drift from Platform Admin can strip 'rooms' from receptionists via:
    - role_permissions document that replaces receptionist modules without 'rooms'
    - tenant module_config whitelist that includes other hotel modules but omits 'rooms'

    Remove those inconsistent overrides so DEFAULT_ROLE_PERMISSIONS applies (includes rooms).
    """
    doc = await db.role_permissions.find_one({"role": "receptionist"}, {"_id": 0})
    if doc and isinstance(doc.get("modules"), list) and "rooms" not in doc["modules"]:
        await db.role_permissions.delete_one({"role": "receptionist"})

    async for t in db.tenants.find({"module_config": {"$exists": True}}):
        mc = t.get("module_config") or {}
        if mc.get("mode") != "whitelist":
            continue
        em = mc.get("enabled_modules")
        if not isinstance(em, list) or not em:
            continue
        keys = set(em)
        hotelish = {"reservations", "guests", "inbox", "tasks", "dashboard"}
        if keys & hotelish and "rooms" not in keys:
            await db.tenants.update_one({"id": t["id"]}, {"$unset": {"module_config": ""}})


async def seed_demo_tasks_if_fewer_than(min_count: int = 3):
    """Ensure canonical demo has at least min_count tasks (matches reset script and hotel_api tests)."""
    n = await db.tasks.count_documents({})
    if n >= min_count:
        return
    admin = await db.users.find_one({"email": "admin@hotel.com"}, {"_id": 0})
    if not admin:
        return
    room = await db.rooms.find_one({"property_id": DEMO_PROPERTY_ID}, {"_id": 0, "id": 1, "number": 1})
    if not room:
        room = await db.rooms.find_one({}, {"_id": 0, "id": 1, "number": 1})
    if not room:
        return
    need = min_count - n
    templates = [
        ("Limpieza habitación demo", "housekeeping"),
        ("Revisión técnica demo", "maintenance"),
        ("Preparación recepción demo", "reception"),
    ]
    for i in range(need):
        title, cat = templates[i % len(templates)]
        task = TaskModel(
            title=f"{title} {i + 1}",
            description="Tarea demo — asegurada por seed idempotente",
            assigned_to=admin["id"],
            assigned_to_name=admin["name"],
            assigned_by=admin["id"],
            assigned_by_name=admin["name"],
            room_id=room["id"],
            room_number=str(room.get("number") or "1"),
            priority="medium",
            status="pending",
            category=cat,
        )
        await db.tasks.insert_one(task.model_dump())


async def run_all():
    """Run all seeds and backfill in the same order as server startup."""
    await seed_data()
    await seed_properties()
    await seed_owner()
    await seed_platform_admin()
    await seed_tenants()
    await seed_room_types()
    await seed_amenities()
    await _backfill_demo_scope()
    await _backfill_user_tenant_ids()
    await _normalize_demo_user_overrides()
    await _repair_receptionist_module_sources()
    await seed_demo_tasks_if_fewer_than(3)
    await seed_demo_manager_if_missing()
    await seed_demo_manager_multi_if_missing()
    await seed_demo_finance_if_missing()
    await seed_demo_housekeeping_if_missing()

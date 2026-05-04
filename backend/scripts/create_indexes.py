"""
Crea índices MongoDB para STAYLO.
Seguro de re-ejecutar — MongoDB ignora índices ya existentes.

Uso: cd backend && python scripts/create_indexes.py
"""
import asyncio, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from db import db, client


async def create_indexes():
    # reservations — 45 queries, colección más usada
    await db.reservations.create_index([("id", 1)],                             unique=True, name="res_id_unique")
    await db.reservations.create_index([("property_id", 1), ("status", 1)],                  name="res_prop_status")
    await db.reservations.create_index([("property_id", 1), ("check_in_date", 1)],           name="res_prop_checkin")
    await db.reservations.create_index([("guest_id", 1)],                                    name="res_guest")
    await db.reservations.create_index([("status", 1)],                                      name="res_status")

    # rooms — 31 queries
    await db.rooms.create_index([("id", 1)],                                    unique=True, name="room_id_unique")
    await db.rooms.create_index([("property_id", 1), ("status", 1)],                         name="room_prop_status")
    await db.rooms.create_index([("property_id", 1)],                                        name="room_prop")

    # users — ruta de login, más sensible a latencia
    await db.users.create_index([("email", 1)],                                 unique=True, name="user_email_unique")
    await db.users.create_index([("id", 1)],                                    unique=True, name="user_id_unique")
    await db.users.create_index([("tenant_id", 1)],                                          name="user_tenant")

    # guests
    await db.guests.create_index([("id", 1)],                                   unique=True, name="guest_id_unique")
    await db.guests.create_index([("email", 1)],                                             name="guest_email")
    await db.guests.create_index([("tenant_id", 1)],                                         name="guest_tenant")

    # properties
    await db.properties.create_index([("id", 1)],                               unique=True, name="prop_id_unique")
    await db.properties.create_index([("tenant_id", 1)],                                     name="prop_tenant")

    # event_bookings
    await db.event_bookings.create_index([("id", 1)],                           unique=True, name="evbooking_id_unique")
    await db.event_bookings.create_index([("property_id", 1)],                               name="evbooking_prop")

    # payment_transactions
    await db.payment_transactions.create_index([("reservation_id", 1)],                      name="pay_reservation")

    print("Indexes created: 19 total across 6 collections.")


if __name__ == "__main__":
    asyncio.run(create_indexes())
    client.close()

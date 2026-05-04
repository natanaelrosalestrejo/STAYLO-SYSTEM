from datetime import date as dt_date

from fastapi import APIRouter, Depends, HTTPException

from auth import (
    _allowed_property_ids,
    _ensure_guest_in_scope,
    _ensure_reservation_in_scope,
    _ensure_room_in_scope,
    require_module,
    require_role,
)
from db import db
from models import ReservationCreate, ReservationModel, UserModel
from seeds import DEMO_PROPERTY_ID

router = APIRouter()


async def _ensure_hotel_room_inventory_for_booking(room: dict) -> None:
    """Validates hotel property and min inventory before creating a room reservation."""
    pid = room.get("property_id")
    if not pid:
        raise HTTPException(status_code=400, detail="La habitación no tiene propiedad asignada.")
    prop_doc = await db.properties.find_one({"id": pid}, {"_id": 0, "type": 1})
    if not prop_doc or prop_doc.get("type") != "hotel":
        raise HTTPException(status_code=400, detail="Solo se pueden reservar habitaciones en propiedades tipo hotel.")
    if await db.rooms.count_documents({"property_id": pid}) < 1:
        raise HTTPException(status_code=400, detail="No hay habitaciones registradas para esta propiedad.")


@router.get("/reservations")
async def get_reservations(current_user: UserModel = Depends(require_module("reservations"))):
    allowed = await _allowed_property_ids(current_user)
    if allowed is None:
        q = {}
    elif not allowed:
        q = {"id": "__none__"}
    else:
        q = {"property_id": {"$in": allowed}}
    return await db.reservations.find(q, {"_id": 0}).sort("created_at", -1).to_list(1000)


@router.post("/reservations")
async def create_reservation(
    data: ReservationCreate, current_user: UserModel = Depends(require_module("reservations"))
):
    guest = await db.guests.find_one({"id": data.guest_id})
    room = await db.rooms.find_one({"id": data.room_id})
    if not guest: raise HTTPException(status_code=404, detail="Huésped no encontrado")
    if not room: raise HTTPException(status_code=404, detail="Habitación no encontrada")
    await _ensure_hotel_room_inventory_for_booking(room)
    await _ensure_room_in_scope(room, current_user)
    await _ensure_guest_in_scope(data.guest_id, current_user)
    check_in = dt_date.fromisoformat(data.check_in_date)
    check_out = dt_date.fromisoformat(data.check_out_date)
    nights = (check_out - check_in).days
    if nights <= 0: raise HTTPException(status_code=400, detail="Fechas inválidas")
    allowed = await _allowed_property_ids(current_user)
    property_id = room.get("property_id") or (allowed[0] if allowed else DEMO_PROPERTY_ID)
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


@router.patch("/reservations/{res_id}/checkin")
async def checkin(
    res_id: str,
    _: UserModel = Depends(require_module("reservations")),
    current_user: UserModel = Depends(require_role("manager", "receptionist")),
):
    res = await db.reservations.find_one({"id": res_id})
    if not res: raise HTTPException(status_code=404, detail="Reserva no encontrada")
    await _ensure_reservation_in_scope(res, current_user)
    await db.reservations.update_one({"id": res_id}, {"$set": {"status": "checked_in"}})
    await db.rooms.update_one({"id": res["room_id"]}, {"$set": {"status": "occupied"}})
    res["status"] = "checked_in"; res.pop("_id", None); return res


@router.patch("/reservations/{res_id}/checkout")
async def checkout(
    res_id: str,
    _: UserModel = Depends(require_module("reservations")),
    current_user: UserModel = Depends(require_role("manager", "receptionist")),
):
    res = await db.reservations.find_one({"id": res_id})
    if not res: raise HTTPException(status_code=404, detail="Reserva no encontrada")
    await _ensure_reservation_in_scope(res, current_user)
    await db.reservations.update_one({"id": res_id}, {"$set": {"status": "checked_out"}})
    await db.rooms.update_one({"id": res["room_id"]}, {"$set": {"status": "cleaning"}})
    res["status"] = "checked_out"; res.pop("_id", None); return res


@router.patch("/reservations/{res_id}/cancel")
async def cancel_reservation(
    res_id: str, current_user: UserModel = Depends(require_module("reservations"))
):
    res = await db.reservations.find_one({"id": res_id})
    if not res: raise HTTPException(status_code=404, detail="Reserva no encontrada")
    await _ensure_reservation_in_scope(res, current_user)
    await db.reservations.update_one({"id": res_id}, {"$set": {"status": "cancelled"}})
    await db.rooms.update_one({"id": res["room_id"]}, {"$set": {"status": "available"}})
    res["status"] = "cancelled"; res.pop("_id", None); return res


@router.patch("/reservations/{res_id}/collect-payment")
async def collect_payment(
    res_id: str,
    _: UserModel = Depends(require_module("reservations")),
    current_user: UserModel = Depends(require_role("manager", "receptionist")),
):
    res = await db.reservations.find_one({"id": res_id})
    if not res: raise HTTPException(status_code=404, detail="Reserva no encontrada")
    await _ensure_reservation_in_scope(res, current_user)
    await db.reservations.update_one({"id": res_id}, {"$set": {"payment_status": "paid"}})
    res["payment_status"] = "paid"; res.pop("_id", None); return res

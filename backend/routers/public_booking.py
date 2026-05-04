import asyncio
import html
import logging
import re

import resend
from fastapi import APIRouter, HTTPException, Request

from config import (
    EXTRAS_CATALOG,
    HOTEL_NOTIFICATION_EMAIL,
    RESEND_API_KEY,
    SENDER_EMAIL,
    STRIPE_API_KEY,
)
from db import db
from models import (
    ExtrasRequest,
    GuestModel,
    PendingBookingModel,
    PaymentTransactionModel,
    PublicBookingCreate,
    ReservationModel,
)
from rate_limit import limiter
from routers.reservations import _ensure_hotel_room_inventory_for_booking

logger = logging.getLogger(__name__)

router = APIRouter()

try:
    from emergentintegrations.payments.stripe.checkout import StripeCheckout, CheckoutSessionRequest
except ImportError:
    StripeCheckout = None  # type: ignore
    CheckoutSessionRequest = None  # type: ignore

if RESEND_API_KEY:
    resend.api_key = RESEND_API_KEY


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
        overlapping = await db.reservations.count_documents(
            {
                "room_id": room["id"],
                "status": {"$in": ["confirmed", "checked_in"]},
                "check_in_date": {"$lt": check_out},
                "check_out_date": {"$gt": check_in},
            }
        )
        if overlapping == 0:
            return room
    return None


async def send_booking_confirmation_email(booking_data: dict, booking_ref: str):
    if not RESEND_API_KEY:
        return
    extras_html = ""
    if booking_data.get("extras_items"):
        extras_html = (
            "<p style='margin:4px 0;font-size:14px;color:#666;'><strong>Extras:</strong></p>"
            "<ul style='margin:4px 0;padding-left:18px;'>"
        )
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
        params = {
            "from": SENDER_EMAIL,
            "to": recipients,
            "subject": f"Reserva Confirmada #{booking_ref} — Alma Hotel Boutique",
            "html": html_body,
        }
        await asyncio.to_thread(resend.Emails.send, params)
    except Exception as e:
        logger.error(f"Email error: {e}")


@router.get("/public/booking/lookup")
@limiter.limit("10/minute")
async def lookup_booking(request: Request, booking_ref: str, email: str):
    match = await db.reservations.find_one(
        {"id": {"$regex": f"^{re.escape(booking_ref.lower())}"}, "guest_name": {"$exists": True}},
        {"_id": 0},
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


@router.get("/public/availability")
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
            overlapping = await db.reservations.count_documents(
                {
                    "room_id": room["id"],
                    "status": {"$in": ["confirmed", "checked_in"]},
                    "check_in_date": {"$lt": check_out},
                    "check_out_date": {"$gt": check_in},
                }
            )
            if overlapping == 0:
                available_count += 1
        results.append(
            {
                "type": rtype,
                "label": type_label,
                "price_per_night": base_price,
                "total_price": base_price * nights,
                "nights": nights,
                "available_count": available_count,
                "available": available_count > 0,
            }
        )
    return results


@router.post("/public/booking/create")
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
        guest_obj = GuestModel(
            first_name=data.first_name,
            last_name=data.last_name,
            email=data.email,
            phone=data.phone,
            id_number=data.id_number,
        )
        await db.guests.insert_one(guest_obj.model_dump())
        guest = guest_obj.model_dump()
    system_user = await db.users.find_one({"role": "manager"}, {"_id": 0})
    created_by = system_user["id"] if system_user else "public"
    reservation = ReservationModel(
        guest_id=guest["id"],
        guest_name=f"{data.first_name} {data.last_name}",
        room_id=room["id"],
        room_number=room["number"],
        check_in_date=data.check_in_date,
        check_out_date=data.check_out_date,
        total_amount=total_amount,
        adults=data.adults,
        children=data.children,
        notes=data.special_requests or "",
        created_by=created_by,
        status="confirmed",
        payment_status="pending" if data.payment_method == "at_hotel" else "paid",
        payment_source="public_portal",
        reservation_source="web",
        event_name=data.event_name or None,
    )
    await db.reservations.insert_one(reservation.model_dump())
    await db.rooms.update_one({"id": room["id"]}, {"$set": {"status": "reserved"}})
    booking_ref = reservation.id[:8].upper()
    extras_items = build_extras_summary(data.extras, data.adults, nights)
    asyncio.create_task(
        send_booking_confirmation_email(
            {
                "first_name": data.first_name,
                "last_name": data.last_name,
                "email": data.email,
                "room_type": data.room_type,
                "room_number": room["number"],
                "check_in_date": data.check_in_date,
                "check_out_date": data.check_out_date,
                "adults": data.adults,
                "children": data.children,
                "total_amount": total_amount,
                "extras_items": extras_items,
            },
            booking_ref,
        )
    )
    return {
        "booking_ref": booking_ref,
        "reservation_id": reservation.id,
        "room_number": room["number"],
        "room_type": data.room_type,
        "total_amount": total_amount,
        "nights": nights,
        "extras_items": extras_items,
        "check_in_date": data.check_in_date,
        "check_out_date": data.check_out_date,
    }


@router.post("/public/checkout/session")
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
    stripe = StripeCheckout(
        api_key=STRIPE_API_KEY,
        webhook_url=f"{str(request.base_url).rstrip('/')}/api/webhook/stripe",
    )
    session = await stripe.create_checkout_session(
        CheckoutSessionRequest(
            amount=float(pending["total_amount"]),
            currency="mxn",
            success_url=success_url,
            cancel_url=cancel_url,
            metadata={"pending_id": pending_id, "guest_email": pending["email"]},
        )
    )
    tx = PaymentTransactionModel(
        session_id=session.session_id,
        amount=pending["total_amount"],
        currency="mxn",
        payment_status="initiated",
        metadata={"pending_id": pending_id},
    )
    await db.payment_transactions.insert_one(tx.model_dump())
    return {"url": session.url, "session_id": session.session_id}


@router.post("/public/booking/pending")
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
        check_in_date=data.check_in_date,
        check_out_date=data.check_out_date,
        adults=data.adults,
        children=data.children,
        room_type=data.room_type,
        extras=data.extras.model_dump(),
        first_name=data.first_name,
        last_name=data.last_name,
        email=data.email,
        phone=data.phone,
        id_number=data.id_number,
        special_requests=data.special_requests,
        total_amount=total_amount,
        nights=nights,
    )
    await db.pending_bookings.insert_one(pending.model_dump())
    return {
        "pending_id": pending.id,
        "total_amount": total_amount,
        "nights": nights,
        "room_number": room["number"],
    }


@router.get("/public/checkout/status/{session_id}")
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
    stripe = StripeCheckout(
        api_key=STRIPE_API_KEY,
        webhook_url=f"{str(request.base_url).rstrip('/')}/api/webhook/stripe",
    )
    checkout_status = await stripe.get_checkout_status(session_id)
    if checkout_status.payment_status == "paid":
        already_done = await db.payment_transactions.find_one({"session_id": session_id, "payment_status": "paid"})
        if already_done:
            return {
                "status": "paid",
                "booking_ref": already_done.get("booking_ref"),
                "reservation_id": already_done.get("booking_id"),
            }
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
                    guest_obj = GuestModel(
                        first_name=pending["first_name"],
                        last_name=pending["last_name"],
                        email=pending["email"],
                        phone=pending["phone"],
                        id_number=pending.get("id_number"),
                    )
                    await db.guests.insert_one(guest_obj.model_dump())
                    guest = guest_obj.model_dump()
                reservation = ReservationModel(
                    guest_id=guest["id"],
                    guest_name=f"{pending['first_name']} {pending['last_name']}",
                    room_id=room["id"],
                    room_number=room["number"],
                    check_in_date=pending["check_in_date"],
                    check_out_date=pending["check_out_date"],
                    total_amount=pending["total_amount"],
                    adults=pending["adults"],
                    children=pending["children"],
                    notes=pending.get("special_requests") or "",
                    created_by=created_by,
                    status="confirmed",
                )
                await db.reservations.insert_one(reservation.model_dump())
                await db.rooms.update_one({"id": room["id"]}, {"$set": {"status": "reserved"}})
                booking_ref = reservation.id[:8].upper()
                extras_obj = ExtrasRequest(**pending.get("extras", {}))
                extras_items = build_extras_summary(extras_obj, pending["adults"], pending["nights"])
                await db.payment_transactions.update_one(
                    {"session_id": session_id},
                    {"$set": {"payment_status": "paid", "booking_id": reservation.id, "booking_ref": booking_ref}},
                )
                asyncio.create_task(
                    send_booking_confirmation_email(
                        {
                            "first_name": pending["first_name"],
                            "last_name": pending["last_name"],
                            "email": pending["email"],
                            "room_type": pending["room_type"],
                            "room_number": room["number"],
                            "check_in_date": pending["check_in_date"],
                            "check_out_date": pending["check_out_date"],
                            "adults": pending["adults"],
                            "children": pending["children"],
                            "total_amount": pending["total_amount"],
                            "extras_items": extras_items,
                        },
                        booking_ref,
                    )
                )
                return {"status": "paid", "booking_ref": booking_ref, "reservation_id": reservation.id}
    await db.payment_transactions.update_one(
        {"session_id": session_id},
        {"$set": {"payment_status": checkout_status.payment_status}},
    )
    return {"status": checkout_status.status, "payment_status": checkout_status.payment_status}


@router.post("/webhook/stripe")
async def stripe_webhook(request: Request):
    if StripeCheckout is None:
        return {"received": True}
    body = await request.body()
    stripe = StripeCheckout(
        api_key=STRIPE_API_KEY,
        webhook_url=f"{str(request.base_url).rstrip('/')}/api/webhook/stripe",
    )
    try:
        event = await stripe.handle_webhook(body, request.headers.get("Stripe-Signature"))
        if event.payment_status == "paid":
            await db.payment_transactions.update_one(
                {"session_id": event.session_id},
                {"$set": {"payment_status": "paid"}},
            )
    except Exception as e:
        logger.error(f"Webhook error: {e}")
    return {"received": True}

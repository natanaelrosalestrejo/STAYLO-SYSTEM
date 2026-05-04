from fastapi import APIRouter, Depends, HTTPException

from auth import (
    _allowed_property_ids,
    assigned_property_ids_for_user,
    get_current_user,
    require_any_module,
    require_module,
    require_role,
)
from db import db
from models import PropertyCreate, PropertyModel, UserModel
from services.scoring import calculate_garden_score, calculate_hotel_score

router = APIRouter()


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


@router.get("/properties")
async def list_properties(current_user: UserModel = Depends(get_current_user)):
    """Lista propiedades visibles según alcance del usuario (tenant / asignadas). No exige módulo 'properties'."""
    props = await db.properties.find({}, {"_id": 0}).to_list(100)
    allowed = await _allowed_property_ids(current_user)
    if allowed is None:
        return props
    idset = set(allowed)
    return [p for p in props if p.get("id") in idset]


@router.post("/properties")
async def create_property(
    data: PropertyCreate,
    _: UserModel = Depends(require_module("properties")),
    current_user: UserModel = Depends(require_role("manager", "platform_admin")),
):
    prop = PropertyModel(**data.model_dump())
    await db.properties.insert_one(prop.model_dump())
    return prop.model_dump()


@router.patch("/properties/{prop_id}")
async def update_property(
    prop_id: str,
    data: dict,
    _: UserModel = Depends(require_module("properties")),
    current_user: UserModel = Depends(require_role("manager", "platform_admin")),
):
    await db.properties.update_one({"id": prop_id}, {"$set": data})
    p = await db.properties.find_one({"id": prop_id}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Propiedad no encontrada")
    return p


@router.delete("/properties/{prop_id}")
async def delete_property(
    prop_id: str,
    _: UserModel = Depends(require_module("properties")),
    current_user: UserModel = Depends(require_role("manager", "platform_admin")),
):
    active = await db.reservations.count_documents(
        {"property_id": prop_id, "status": {"$in": ["confirmed", "checked_in"]}}
    )
    if active > 0:
        raise HTTPException(status_code=400, detail="No se puede eliminar: la propiedad tiene reservas activas")
    await db.properties.delete_one({"id": prop_id})
    return {"deleted": True}


@router.get("/properties/stats")
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
            result.append(
                {
                    "id": prop["id"],
                    "name": prop["name"],
                    "type": "hotel",
                    "status": prop["status"],
                    "description": prop.get("description"),
                    "address": prop.get("address"),
                    "total_rooms": total_rooms,
                    "occupied_rooms": occupied_rooms,
                    "occupancy_rate": occupancy_rate,
                    "monthly_revenue": monthly_revenue,
                    "reservations_this_month": len(month_res),
                    "pending_payments": pending_payments,
                    "performance_score": score,
                }
            )
        elif prop["type"] == "event_garden":
            bookings = await db.event_bookings.find(
                {"property_id": prop["id"], "booking_status": {"$ne": "cancelled"}},
                {"_id": 0},
            ).to_list(1000)
            month_bookings = [b for b in bookings if b.get("event_date", "") >= month_start]
            monthly_revenue = sum(b.get("total_price", 0) for b in month_bookings)
            upcoming = [b for b in bookings if b.get("event_date", "") >= today_str]
            pending_payments = sum(1 for b in bookings if b.get("payment_status") == "pending")
            score = calculate_garden_score(len(upcoming), pending_payments, len(bookings))
            result.append(
                {
                    "id": prop["id"],
                    "name": prop["name"],
                    "type": "event_garden",
                    "status": prop["status"],
                    "description": prop.get("description"),
                    "address": prop.get("address"),
                    "events_this_month": len(month_bookings),
                    "monthly_revenue": monthly_revenue,
                    "upcoming_events": len(upcoming),
                    "pending_payments": pending_payments,
                    "total_events": len(bookings),
                    "performance_score": score,
                }
            )
    return result

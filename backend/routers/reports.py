import csv
import io
from datetime import datetime, timezone
from typing import Dict, List

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from auth import allowed_property_ids_for_reports, require_module, require_role
from db import db
from models import UserModel
from services.reports_scope import reservation_property_match, room_property_match

router = APIRouter()


def _reports_dashboard_empty_payload():
    return {
        "total_rooms": 0,
        "occupied_rooms": 0,
        "available_rooms": 0,
        "cleaning_rooms": 0,
        "maintenance_rooms": 0,
        "reserved_rooms": 0,
        "occupancy_rate": 0.0,
        "today_checkins": 0,
        "today_checkouts": 0,
        "active_guests": 0,
        "pending_tasks": 0,
        "total_guests": 0,
        "pending_payments": 0,
        "total_revenue": 0,
    }


def _reports_insights_empty_payload():
    return {
        "month_revenue": 0,
        "month_reservations": 0,
        "occupancy_rate": 0.0,
        "projected_month_revenue": 0,
        "pending_payments_count": 0,
        "pending_payments_amount": 0,
        "most_booked_type": None,
        "estimated_lost_revenue": 0,
        "source_breakdown": [],
    }


@router.get("/reports/dashboard")
async def dashboard_stats(current_user: UserModel = Depends(require_module("reports"))):
    """Room and reservation metrics scoped via allowed_property_ids_for_reports (manager/finance = assigned property only)."""
    allowed = await allowed_property_ids_for_reports(current_user)
    if allowed is None:
        pq: dict = {}
        rq: dict = {}
    elif not allowed:
        return _reports_dashboard_empty_payload()
    else:
        pq = room_property_match(allowed)
        rq = reservation_property_match(allowed)

    total_rooms = await db.rooms.count_documents(pq)
    occupied = await db.rooms.count_documents({**pq, "status": "occupied"})
    available = await db.rooms.count_documents({**pq, "status": "available"})
    cleaning = await db.rooms.count_documents({**pq, "status": "cleaning"})
    maintenance = await db.rooms.count_documents({**pq, "status": "maintenance"})
    reserved = await db.rooms.count_documents({**pq, "status": "reserved"})
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    today_in = await db.reservations.count_documents(
        {**rq, "check_in_date": today, "status": {"$in": ["confirmed", "checked_in"]}}
    )
    today_out = await db.reservations.count_documents(
        {**rq, "check_out_date": today, "status": "checked_in"}
    )
    active_guests = await db.reservations.count_documents({**rq, "status": "checked_in"})
    pending_payments = await db.reservations.count_documents(
        {**rq, "payment_status": "pending", "status": {"$in": ["confirmed", "checked_in"]}}
    )
    pipeline = [
        {"$match": {**rq, "status": {"$in": ["checked_out", "checked_in"]}}},
        {"$group": {"_id": None, "total": {"$sum": "$total_amount"}}},
    ]
    rev = await db.reservations.aggregate(pipeline).to_list(1)

    if allowed is None:
        pending_tasks = await db.tasks.count_documents({"status": "pending"})
        total_guests = await db.guests.count_documents({})
    else:
        room_ids = [r["id"] for r in await db.rooms.find(pq, {"id": 1}).to_list(5000)]
        if room_ids:
            pending_tasks = await db.tasks.count_documents(
                {"status": "pending", "room_id": {"$in": room_ids}}
            )
        else:
            pending_tasks = 0
        guest_ids = await db.reservations.distinct("guest_id", rq)
        total_guests = len(guest_ids)

    return {
        "total_rooms": total_rooms,
        "occupied_rooms": occupied,
        "available_rooms": available,
        "cleaning_rooms": cleaning,
        "maintenance_rooms": maintenance,
        "reserved_rooms": reserved,
        "occupancy_rate": round((occupied / total_rooms * 100) if total_rooms > 0 else 0, 1),
        "today_checkins": today_in,
        "today_checkouts": today_out,
        "active_guests": active_guests,
        "pending_tasks": pending_tasks,
        "total_guests": total_guests,
        "pending_payments": pending_payments,
        "total_revenue": rev[0]["total"] if rev else 0,
    }


@router.get("/reports/occupancy")
async def occupancy_report(current_user: UserModel = Depends(require_module("reports"))):
    allowed = await allowed_property_ids_for_reports(current_user)
    if allowed is not None and not allowed:
        return {"monthly": [], "room_types": [], "room_statuses": []}
    rf = reservation_property_match(allowed)
    roomf = room_property_match(allowed)
    monthly = await db.reservations.aggregate(
        [
            {"$match": {**rf, "status": {"$in": ["checked_in", "checked_out"]}}},
            {
                "$group": {
                    "_id": {"$substr": ["$check_in_date", 0, 7]},
                    "count": {"$sum": 1},
                    "revenue": {"$sum": "$total_amount"},
                }
            },
            {"$sort": {"_id": 1}},
            {"$limit": 12},
        ]
    ).to_list(12)
    room_type_pipe: List[dict] = []
    if roomf:
        room_type_pipe.append({"$match": roomf})
    room_type_pipe.append({"$group": {"_id": "$type", "count": {"$sum": 1}}})
    room_types = await db.rooms.aggregate(room_type_pipe).to_list(10)
    room_status_pipe: List[dict] = []
    if roomf:
        room_status_pipe.append({"$match": roomf})
    room_status_pipe.append({"$group": {"_id": "$status", "count": {"$sum": 1}}})
    room_statuses = await db.rooms.aggregate(room_status_pipe).to_list(10)
    return {
        "monthly": [{"month": r["_id"], "reservaciones": r["count"], "ingresos": r["revenue"]} for r in monthly],
        "room_types": [{"type": r["_id"], "count": r["count"]} for r in room_types],
        "room_statuses": [{"status": r["_id"], "count": r["count"]} for r in room_statuses],
    }


@router.get("/reports/insights")
async def revenue_insights(current_user: UserModel = Depends(require_module("reports"))):
    from datetime import date as dt_date

    allowed = await allowed_property_ids_for_reports(current_user)
    if allowed is not None and not allowed:
        return _reports_insights_empty_payload()
    rf = reservation_property_match(allowed)
    roomf = room_property_match(allowed)

    today = dt_date.today()
    month_start = today.replace(day=1).isoformat()
    month_end = today.replace(
        day=1,
        month=today.month % 12 + 1 if today.month < 12 else 1,
        year=today.year if today.month < 12 else today.year + 1,
    ).isoformat()
    month_res = await db.reservations.find(
        {
            **rf,
            "check_in_date": {"$gte": month_start, "$lt": month_end},
            "status": {"$nin": ["cancelled"]},
        },
        {"_id": 0},
    ).to_list(1000)
    month_revenue = sum(r.get("total_amount", 0) for r in month_res)
    total_rooms = await db.rooms.count_documents(roomf)
    occupied = await db.rooms.count_documents({**roomf, "status": {"$in": ["occupied", "reserved"]}})
    occ_rate = round((occupied / total_rooms * 100) if total_rooms > 0 else 0, 1)
    pending_pay = await db.reservations.count_documents(
        {**rf, "payment_status": "pending", "status": {"$in": ["confirmed", "checked_in"]}}
    )
    pending_pay_amount = 0
    if pending_pay > 0:
        pp_res = await db.reservations.find(
            {**rf, "payment_status": "pending", "status": {"$in": ["confirmed", "checked_in"]}},
            {"_id": 0, "total_amount": 1},
        ).to_list(1000)
        pending_pay_amount = sum(r.get("total_amount", 0) for r in pp_res)
    type_pipeline = [
        {"$match": {**rf, "status": {"$nin": ["cancelled"]}}},
        {"$lookup": {"from": "rooms", "localField": "room_id", "foreignField": "id", "as": "room"}},
        {"$unwind": {"path": "$room", "preserveNullAndEmptyArrays": True}},
        {"$group": {"_id": "$room.type", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 1},
    ]
    top_type = await db.reservations.aggregate(type_pipeline).to_list(1)
    days_elapsed = today.day
    days_in_month = 30
    projected = round((month_revenue / days_elapsed * days_in_month) if days_elapsed > 0 else 0)
    avg_price = 1500.0
    empty_rooms = total_rooms - occupied
    lost_revenue_estimate = empty_rooms * avg_price
    source_pipeline = [
        {"$match": {**rf, "status": {"$nin": ["cancelled"]}}},
        {"$group": {"_id": "$reservation_source", "count": {"$sum": 1}, "revenue": {"$sum": "$total_amount"}}},
    ]
    sources = await db.reservations.aggregate(source_pipeline).to_list(10)
    source_labels = {"web": "Portal Web", "reception": "Recepción", "whatsapp": "WhatsApp", "other": "Otro"}
    return {
        "month_revenue": month_revenue,
        "month_reservations": len(month_res),
        "occupancy_rate": occ_rate,
        "projected_month_revenue": projected,
        "pending_payments_count": pending_pay,
        "pending_payments_amount": pending_pay_amount,
        "most_booked_type": top_type[0]["_id"] if top_type else None,
        "estimated_lost_revenue": lost_revenue_estimate,
        "source_breakdown": [
            {
                "source": s["_id"] or "other",
                "label": source_labels.get(s["_id"] or "other", "Otro"),
                "count": s["count"],
                "revenue": s["revenue"],
            }
            for s in sources
        ],
    }


@router.get("/reports/export/csv")
async def export_reservations_csv(
    _: UserModel = Depends(require_module("reports")),
    current_user: UserModel = Depends(require_role("owner", "manager", "receptionist")),
):
    """Finance role excluded (require_role). Rows filtered to report property scope when not platform_admin."""
    allowed = await allowed_property_ids_for_reports(current_user)
    if allowed is not None and not allowed:
        reservations = []
    else:
        scope = {} if allowed is None else {"property_id": {"$in": allowed}}
        reservations = await db.reservations.find(scope, {"_id": 0}).sort("created_at", -1).to_list(10000)
    output = io.StringIO()
    writer = csv.DictWriter(
        output,
        fieldnames=[
            "id",
            "guest_name",
            "room_number",
            "check_in_date",
            "check_out_date",
            "total_amount",
            "status",
            "payment_status",
            "reservation_source",
            "event_name",
            "created_at",
        ],
        extrasaction="ignore",
    )
    writer.writeheader()
    for r in reservations:
        writer.writerow({k: r.get(k, "") for k in writer.fieldnames})
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=reservas_alma.csv"},
    )


@router.get("/reports/revenue-breakdown")
async def revenue_breakdown(current_user: UserModel = Depends(require_module("reports"))):
    allowed = await allowed_property_ids_for_reports(current_user)
    if allowed is not None and not allowed:
        return {
            "hotel_revenue": 0,
            "event_revenue": 0,
            "total_revenue": 0,
            "events_breakdown": [],
            "hotel_reservations": 0,
            "event_reservations": 0,
        }
    rf = reservation_property_match(allowed)
    all_res = await db.reservations.find(
        {**rf, "status": {"$nin": ["cancelled"]}}, {"_id": 0, "total_amount": 1, "event_name": 1}
    ).to_list(10000)
    hotel_revenue = sum(r["total_amount"] for r in all_res if not r.get("event_name"))
    event_revenue = sum(r["total_amount"] for r in all_res if r.get("event_name"))
    total_revenue = hotel_revenue + event_revenue
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

from fastapi import APIRouter, Depends

from auth import require_module, require_role
from db import db
from models import UserModel
from routers.properties import _corporate_scope_property_ids
from services.scoring import calculate_garden_score, calculate_hotel_score

router = APIRouter()


@router.get("/corporate/dashboard")
async def corporate_dashboard(
    _: UserModel = Depends(require_module("corporate")),
    current_user: UserModel = Depends(require_role("owner", "manager")),
):
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

    scope_ids = await _corporate_scope_property_ids(current_user)
    scope_set = set(scope_ids)
    all_properties = await db.properties.find({}, {"_id": 0}).to_list(100)
    properties = [p for p in all_properties if p["id"] in scope_set]

    hotel_prop_ids = [p["id"] for p in properties if p.get("type") == "hotel"]
    garden_prop_ids = [p["id"] for p in properties if p.get("type") == "event_garden"]

    pq = {"property_id": {"$in": hotel_prop_ids}} if hotel_prop_ids else {"property_id": {"$in": []}}
    rq_hotel = {"status": {"$nin": ["cancelled"]}, "property_id": {"$in": hotel_prop_ids}} if hotel_prop_ids else {"property_id": {"$in": []}}
    eq = {"booking_status": {"$ne": "cancelled"}, "property_id": {"$in": garden_prop_ids}} if garden_prop_ids else {"property_id": {"$in": []}}

    # ====== HOTEL METRICS (solo propiedades tipo hotel; alineado con /properties/stats y vista Hoteles) ======
    hotel_res = await db.reservations.find(rq_hotel, {"_id": 0}).to_list(10000)
    hotel_res_month = [r for r in hotel_res if r.get("check_in_date", "") >= month_start]
    hotel_revenue_month = sum(r.get("total_amount", 0) for r in hotel_res_month)
    hotel_revenue_total = sum(r.get("total_amount", 0) for r in hotel_res)
    hotel_rooms_total = await db.rooms.count_documents(pq)
    hotel_rooms_occupied = await db.rooms.count_documents({**pq, "status": {"$in": ["occupied", "reserved"]}})
    hotel_rooms_available = await db.rooms.count_documents({**pq, "status": "available"})
    hotel_occ_rate = round((hotel_rooms_occupied / hotel_rooms_total * 100) if hotel_rooms_total else 0, 1)
    hotel_pending_pay = await db.reservations.count_documents({
        "payment_status": "pending", "status": {"$in": ["confirmed", "checked_in"]}, "property_id": {"$in": hotel_prop_ids},
    }) if hotel_prop_ids else 0
    total_hotel_res = await db.reservations.count_documents({"property_id": {"$in": hotel_prop_ids}}) if hotel_prop_ids else 0
    cancelled_hotel_res = await db.reservations.count_documents({"status": "cancelled", "property_id": {"$in": hotel_prop_ids}}) if hotel_prop_ids else 0
    hotel_score = calculate_hotel_score(hotel_occ_rate, hotel_pending_pay, total_hotel_res, cancelled_hotel_res)

    # Expected hotel revenue (confirmed not yet checked in)
    expected_hotel_res = await db.reservations.find(
        {"status": "confirmed", "property_id": {"$in": hotel_prop_ids}}, {"_id": 0, "total_amount": 1}
    ).to_list(10000) if hotel_prop_ids else []
    expected_hotel_revenue = sum(r.get("total_amount", 0) for r in expected_hotel_res)

    # Last month hotel revenue
    hotel_last_month = await db.reservations.find(
        {
            "check_in_date": {"$gte": last_month_start, "$lt": last_month_end},
            "status": {"$nin": ["cancelled"]},
            "property_id": {"$in": hotel_prop_ids},
        },
        {"_id": 0, "total_amount": 1},
    ).to_list(1000) if hotel_prop_ids else []
    hotel_last_month_revenue = sum(r.get("total_amount", 0) for r in hotel_last_month)

    # Revenue opportunity for hotel
    rooms_prices = await db.rooms.find(pq, {"_id": 0, "price_per_night": 1}).to_list(1000)
    avg_room_rate = (sum(r.get("price_per_night", 0) for r in rooms_prices) / len(rooms_prices)) if rooms_prices else 1500
    revenue_opportunity = round(hotel_rooms_available * avg_room_rate * remaining_days, 0)

    # ====== EVENT GARDEN METRICS (solo propiedades tipo event_garden; alineado con vista Jardines) ======
    event_bookings = await db.event_bookings.find(eq, {"_id": 0}).to_list(10000)
    event_bookings_month = [b for b in event_bookings if b.get("event_date", "") >= month_start]
    event_revenue_month = sum(b.get("total_price", 0) for b in event_bookings_month)
    event_revenue_total = sum(b.get("total_price", 0) for b in event_bookings)
    event_pending_pay = sum(1 for b in event_bookings if b.get("payment_status") == "pending")
    upcoming_bookings_future = [b for b in event_bookings if b.get("event_date", "") >= today_str]
    expected_event_revenue = sum(b.get("total_price", 0) for b in upcoming_bookings_future)
    garden_score = calculate_garden_score(len(upcoming_bookings_future), event_pending_pay, len(event_bookings))

    # Last month event revenue
    event_last_month = await db.event_bookings.find(
        {
            "event_date": {"$gte": last_month_start, "$lt": last_month_end},
            "booking_status": {"$ne": "cancelled"},
            "property_id": {"$in": garden_prop_ids},
        },
        {"_id": 0, "total_price": 1},
    ).to_list(1000) if garden_prop_ids else []
    event_last_month_revenue = sum(b.get("total_price", 0) for b in event_last_month)

    # ====== GROUP METRICS ======
    total_staff = await db.users.count_documents({"is_active": True})
    total_month_revenue = hotel_revenue_month + event_revenue_month
    total_last_month_revenue = hotel_last_month_revenue + event_last_month_revenue
    expected_total_revenue = expected_hotel_revenue + expected_event_revenue
    today_arrivals = await db.reservations.count_documents({
        "check_in_date": today_str,
        "status": {"$in": ["confirmed", "checked_in"]},
        "property_id": {"$in": hotel_prop_ids},
    }) if hotel_prop_ids else 0
    today_departures = await db.reservations.count_documents({
        "check_out_date": today_str,
        "status": {"$in": ["confirmed", "checked_in"]},
        "property_id": {"$in": hotel_prop_ids},
    }) if hotel_prop_ids else 0

    revenue_growth_pct = 0.0
    if total_last_month_revenue > 0:
        revenue_growth_pct = round((total_month_revenue - total_last_month_revenue) / total_last_month_revenue * 100, 1)
    elif total_month_revenue > 0:
        revenue_growth_pct = 100.0

    projected_month_revenue = round((total_month_revenue / today.day * days_in_month) if today.day > 0 else 0)

    # Property ranking by monthly revenue — names from scoped properties list
    hotel_prop = next((p for p in properties if p.get("type") == "hotel"), None)
    garden_prop = next((p for p in properties if p.get("type") == "event_garden"), None)
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
        {"$match": {"status": {"$nin": ["cancelled"]}, "property_id": {"$in": hotel_prop_ids}}},
        {"$group": {"_id": "$reservation_source", "count": {"$sum": 1}, "revenue": {"$sum": "$total_amount"}}},
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
        {"$match": {"status": {"$nin": ["cancelled"]}, "property_id": {"$in": hotel_prop_ids}}},
        {"$group": {"_id": {"$substr": ["$check_in_date", 0, 7]}, "revenue": {"$sum": "$total_amount"}, "count": {"$sum": 1}}},
        {"$sort": {"_id": -1}}, {"$limit": 6},
    ]).to_list(6)
    monthly_events = await db.event_bookings.aggregate([
        {"$match": {"booking_status": {"$ne": "cancelled"}, "property_id": {"$in": garden_prop_ids}}},
        {"$group": {"_id": {"$substr": ["$event_date", 0, 7]}, "revenue": {"$sum": "$total_price"}, "count": {"$sum": 1}}},
        {"$sort": {"_id": -1}}, {"$limit": 6},
    ]).to_list(6)
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

    # ----- Additive owner/business-control sections (do not remove keys above) -----
    prop_by_id = {p["id"]: p.get("name", "Propiedad") for p in properties}

    # Pending amounts (MXN): sum of line items with payment_status pending
    hotel_pending_rows = await db.reservations.find(
        {
            "payment_status": "pending",
            "status": {"$in": ["confirmed", "checked_in"]},
            "property_id": {"$in": hotel_prop_ids},
        },
        {"_id": 0, "total_amount": 1},
    ).to_list(10000)
    hotel_pending_amount = float(sum(r.get("total_amount", 0) or 0 for r in hotel_pending_rows))

    event_pending_amount = float(
        sum(
            b.get("total_price", 0) or 0
            for b in event_bookings
            if b.get("payment_status") == "pending" and b.get("booking_status") != "cancelled"
        )
    )
    pending_breakdown = {
        "total_pending_amount": round(hotel_pending_amount + event_pending_amount, 2),
        "hotel_pending_amount": round(hotel_pending_amount, 2),
        "event_pending_amount": round(event_pending_amount, 2),
    }

    # Upcoming events (next 15, not cancelled, on or after today)
    upcoming_sorted = sorted(
        [b for b in event_bookings if b.get("event_date", "") >= today_str],
        key=lambda x: x.get("event_date", ""),
    )[:15]
    upcoming_events_list = []
    for b in upcoming_sorted:
        total_p = float(b.get("total_price", 0) or 0)
        paid = total_p if b.get("payment_status") == "paid" else 0.0
        pending_amt = round(total_p - paid, 2)
        upcoming_events_list.append(
            {
                "id": b.get("id"),
                "property_id": b.get("property_id"),
                "event_name": (b.get("event_space_name") or "Evento").strip(),
                "client_name": b.get("client_name") or "",
                "event_date": b.get("event_date"),
                "total_price": round(total_p, 2),
                "paid_amount": round(paid, 2),
                "pending_amount": pending_amt,
                "property_name": prop_by_id.get(b.get("property_id"), "—"),
            }
        )

    # Lodging linked to events (assignments scoped by room_property_id)
    assign_q = {"room_property_id": {"$in": hotel_prop_ids}}
    all_assign = await db.event_lodging_assignments.find(assign_q, {"_id": 0}).to_list(10000)
    lodging_summary = {
        "total_assignments": len(all_assign),
        "held_count": sum(1 for a in all_assign if a.get("assignment_status") == "held"),
        "reserved_count": sum(1 for a in all_assign if a.get("assignment_status") == "reserved"),
        "released_count": sum(1 for a in all_assign if a.get("assignment_status") == "released"),
        "cancelled_count": sum(1 for a in all_assign if a.get("assignment_status") == "cancelled"),
        "event_related_rooms_count": sum(
            1 for a in all_assign if a.get("assignment_status") in ("held", "reserved")
        ),
        "estimated_lodging_revenue": 0.0,
        "no_assignments_in_scope": len(all_assign) == 0,
    }
    # Proxy estimate: sum(room.price_per_night * nights) for held/reserved; nights from check_in/out or 1
    active_for_est = [
        a
        for a in all_assign
        if a.get("assignment_status") in ("held", "reserved") and a.get("room_id")
    ]
    if active_for_est:
        room_ids_u = list({a["room_id"] for a in active_for_est})
        rooms_lodg = await db.rooms.find(
            {"id": {"$in": room_ids_u}}, {"_id": 0, "id": 1, "price_per_night": 1}
        ).to_list(len(room_ids_u))
        rmap = {r["id"]: float(r.get("price_per_night", 0) or 0) for r in rooms_lodg}
        est_rev = 0.0
        for a in active_for_est:
            pr = rmap.get(a.get("room_id"), 0.0)
            ci = a.get("check_in_date")
            co = a.get("check_out_date")
            nights = 1
            if ci and co:
                try:
                    d1 = dt_date.fromisoformat(str(ci)[:10])
                    d2 = dt_date.fromisoformat(str(co)[:10])
                    nights = max(1, (d2 - d1).days)
                except ValueError:
                    nights = 1
            est_rev += pr * nights
        lodging_summary["estimated_lodging_revenue"] = round(est_rev, 2)

    # Simple deterministic alerts (max 12)
    alerts = []
    HIGH_PENDING_MXN = 50000.0
    if pending_breakdown["total_pending_amount"] >= HIGH_PENDING_MXN:
        alerts.append(
            {
                "type": "high_pending_balance",
                "severity": "warning",
                "message": f"Saldo pendiente de cobro elevado ({pending_breakdown['total_pending_amount']:,.0f} MXN). Revise cobros de hotel y eventos.",
                "ref_id": None,
            }
        )
    for b in sorted(
        [x for x in event_bookings if x.get("booking_status") != "cancelled" and x.get("event_date", "") >= today_str],
        key=lambda x: x.get("event_date", ""),
    )[:20]:
        if b.get("payment_status") == "pending":
            alerts.append(
                {
                    "type": "upcoming_event_pending_payment",
                    "severity": "warning",
                    "message": f"Evento próximo con pago pendiente: {b.get('client_name', 'Cliente')} ({b.get('event_date', '')})",
                    "ref_id": b.get("id"),
                }
            )
        if not b.get("lodging_integration_enabled", False):
            alerts.append(
                {
                    "type": "upcoming_event_no_lodging",
                    "severity": "info",
                    "message": f"Evento próximo sin integración de hospedaje: {b.get('client_name', 'Cliente')} ({b.get('event_date', '')})",
                    "ref_id": b.get("id"),
                }
            )
        if len(alerts) >= 12:
            break

    chart_labels = {
        "hotel": hotel_name,
        "eventos": garden_name,
    }

    return {
        "properties": properties,
        "hotel": {
            "property_name": hotel_name,
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
            "property_name": garden_name,
            "property_type": "event_garden",
            "revenue_this_month": event_revenue_month,
            "revenue_total": event_revenue_total,
            "bookings_this_month": len(event_bookings_month),
            "bookings_total": len(event_bookings),
            "pending_payments": event_pending_pay,
            "upcoming_events": len(upcoming_bookings_future),
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
            "today_arrivals": today_arrivals,
            "today_departures": today_departures,
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
        "chart_labels": chart_labels,
        "pending_breakdown": pending_breakdown,
        "upcoming_events": upcoming_events_list,
        "lodging_summary": lodging_summary,
        "alerts": alerts[:12],
        "scope": {"property_ids": scope_ids},
    }

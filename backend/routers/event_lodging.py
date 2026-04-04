from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

from auth import _allowed_property_ids, require_any_module, require_role
from db import db
from models import (
    EventLodgingAssignmentModel,
    EventLodgingSetupRequest,
    EventRoomBlockModel,
    UserModel,
)

router = APIRouter()


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _ensure_event_booking_in_scope(event_doc: dict, current_user: UserModel) -> None:
    allowed = await _allowed_property_ids(current_user)
    if allowed is None:
        return
    if not allowed:
        raise HTTPException(status_code=404, detail="Evento no encontrado")
    if event_doc.get("property_id") not in allowed:
        raise HTTPException(status_code=404, detail="Evento no encontrado")


async def _safe_release_room_if_no_locks(room_id: str) -> None:
    active_assignments = await db.event_lodging_assignments.count_documents(
        {"room_id": room_id, "assignment_status": {"$in": ["held", "reserved"]}}
    )
    active_reservations = await db.reservations.count_documents(
        {"room_id": room_id, "status": {"$in": ["confirmed", "checked_in"]}}
    )
    if active_assignments == 0 and active_reservations == 0:
        await db.rooms.update_one({"id": room_id}, {"$set": {"status": "available"}})


async def _compute_lodging_summary(event_id: str) -> dict:
    assignments = await db.event_lodging_assignments.find(
        {"event_booking_id": event_id}, {"_id": 0, "assignment_status": 1}
    ).to_list(1000)
    counts = {"held": 0, "reserved": 0, "released": 0, "cancelled": 0}
    for a in assignments:
        s = a.get("assignment_status")
        if s in counts:
            counts[s] += 1
    counts["total"] = len(assignments)
    return counts


@router.get("/event-bookings/{event_id}/lodging")
async def get_event_lodging(
    event_id: str,
    current_user: UserModel = Depends(
        require_any_module("jardines", "garden_lodging_integration")
    ),
):
    event_doc = await db.event_bookings.find_one({"id": event_id}, {"_id": 0})
    if not event_doc:
        raise HTTPException(status_code=404, detail="Reserva de evento no encontrada")
    await _ensure_event_booking_in_scope(event_doc, current_user)

    block = await db.event_room_blocks.find_one({"event_booking_id": event_id}, {"_id": 0})
    assignments = await db.event_lodging_assignments.find(
        {"event_booking_id": event_id}, {"_id": 0}
    ).sort("created_at", 1).to_list(1000)
    summary = await _compute_lodging_summary(event_id)
    return {
        "event_id": event_id,
        "lodging_integration_enabled": bool(event_doc.get("lodging_integration_enabled", False)),
        "room_block": block,
        "assignments": assignments,
        "summary": summary,
    }


@router.post("/event-bookings/{event_id}/lodging/setup")
async def setup_event_lodging(
    event_id: str,
    data: EventLodgingSetupRequest,
    _: UserModel = Depends(require_any_module("jardines", "garden_lodging_integration")),
    current_user: UserModel = Depends(require_role("platform_admin", "admin", "receptionist", "manager")),
):
    event_doc = await db.event_bookings.find_one({"id": event_id}, {"_id": 0})
    if not event_doc:
        raise HTTPException(status_code=404, detail="Reserva de evento no encontrada")
    await _ensure_event_booking_in_scope(event_doc, current_user)
    property_id = event_doc.get("property_id")
    if not property_id:
        raise HTTPException(status_code=400, detail="El evento no tiene property_id")

    # Reset current setup for a clean Phase 1 "replace" behavior.
    existing = await db.event_lodging_assignments.find(
        {"event_booking_id": event_id}, {"_id": 0, "room_id": 1}
    ).to_list(1000)
    await db.event_lodging_assignments.delete_many({"event_booking_id": event_id})
    await db.event_room_blocks.delete_many({"event_booking_id": event_id})
    for a in existing:
        await _safe_release_room_if_no_locks(a.get("room_id"))

    if not data.lodging_integration_enabled:
        await db.event_bookings.update_one(
            {"id": event_id},
            {
                "$set": {
                    "lodging_integration_enabled": False,
                    "lodging_summary": {"held": 0, "reserved": 0, "released": 0, "cancelled": 0, "total": 0},
                }
            },
        )
        return {"ok": True, "event_id": event_id, "lodging_integration_enabled": False, "created_assignments": 0}

    # Build special-role assignments (only roles with room_id).
    created_assignments = []
    for s in data.special_rooms:
        if not s.room_id:
            continue
        room = await db.rooms.find_one({"id": s.room_id}, {"_id": 0})
        if not room:
            raise HTTPException(status_code=404, detail=f"Habitación no encontrada: {s.room_id}")
        if room.get("property_id") != property_id:
            raise HTTPException(status_code=400, detail="La habitación especial no pertenece a la propiedad del evento")
        assignment = EventLodgingAssignmentModel(
            event_booking_id=event_id,
            room_id=s.room_id,
            room_property_id=property_id,
            assignment_type="special_role",
            special_role=s.special_role,
            assignment_status="held",
            check_in_date=data.check_in_date or event_doc.get("event_date"),
            check_out_date=data.check_out_date or event_doc.get("event_date"),
            created_by=current_user.id,
            notes=data.notes,
        )
        doc = assignment.model_dump()
        await db.event_lodging_assignments.insert_one(doc)
        await db.rooms.update_one({"id": s.room_id}, {"$set": {"status": "reserved"}})
        created_assignments.append(doc)

    # Build guest block (simple count; auto-pick available rooms).
    block_count = max(int(data.guest_block_count or 0), 0)
    block_doc: Optional[dict] = None
    if block_count > 0:
        available_rooms = await db.rooms.find(
            {"property_id": property_id, "status": "available"}, {"_id": 0}
        ).to_list(2000)
        already_used = {a["room_id"] for a in created_assignments}
        candidate_rooms = [r for r in available_rooms if r.get("id") not in already_used]
        take = candidate_rooms[:block_count]
        blocked_count = len(take)

        block = EventRoomBlockModel(
            event_booking_id=event_id,
            property_id=property_id,
            target_room_count=block_count,
            blocked_room_count=blocked_count,
            status="active",
            notes=data.notes,
            created_by=current_user.id,
        )
        block_doc = block.model_dump()
        await db.event_room_blocks.insert_one(block_doc)

        for r in take:
            a = EventLodgingAssignmentModel(
                event_booking_id=event_id,
                event_room_block_id=block.id,
                room_id=r["id"],
                room_property_id=property_id,
                assignment_type="guest_block",
                assignment_status="held",
                check_in_date=data.check_in_date or event_doc.get("event_date"),
                check_out_date=data.check_out_date or event_doc.get("event_date"),
                created_by=current_user.id,
                notes=data.notes,
            )
            doc = a.model_dump()
            await db.event_lodging_assignments.insert_one(doc)
            await db.rooms.update_one({"id": r["id"]}, {"$set": {"status": "reserved"}})
            created_assignments.append(doc)

    summary = await _compute_lodging_summary(event_id)
    await db.event_bookings.update_one(
        {"id": event_id},
        {"$set": {"lodging_integration_enabled": True, "lodging_summary": summary, "updated_at": _now_iso()}},
    )
    return {
        "ok": True,
        "event_id": event_id,
        "lodging_integration_enabled": True,
        "room_block": block_doc,
        "created_assignments": len(created_assignments),
        "summary": summary,
    }


@router.patch("/event-lodging-assignments/{assignment_id}")
async def update_event_lodging_assignment(
    assignment_id: str,
    data: dict,
    _: UserModel = Depends(require_any_module("jardines", "garden_lodging_integration")),
    current_user: UserModel = Depends(require_role("platform_admin", "admin", "receptionist", "manager")),
):
    doc = await db.event_lodging_assignments.find_one({"id": assignment_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Asignación no encontrada")

    event_doc = await db.event_bookings.find_one({"id": doc.get("event_booking_id")}, {"_id": 0})
    if not event_doc:
        raise HTTPException(status_code=404, detail="Evento no encontrado")
    await _ensure_event_booking_in_scope(event_doc, current_user)

    allowed_status = {"held", "reserved", "released", "cancelled"}
    update = {}
    if "assignment_status" in data:
        new_status = data.get("assignment_status")
        if new_status not in allowed_status:
            raise HTTPException(status_code=400, detail="assignment_status inválido")
        update["assignment_status"] = new_status
    if "notes" in data:
        update["notes"] = data.get("notes")
    if not update:
        raise HTTPException(status_code=400, detail="No hay campos válidos para actualizar")
    update["updated_at"] = _now_iso()

    await db.event_lodging_assignments.update_one({"id": assignment_id}, {"$set": update})
    updated = await db.event_lodging_assignments.find_one({"id": assignment_id}, {"_id": 0})

    if updated.get("assignment_status") in {"released", "cancelled"}:
        await _safe_release_room_if_no_locks(updated.get("room_id"))
    else:
        await db.rooms.update_one({"id": updated.get("room_id")}, {"$set": {"status": "reserved"}})

    summary = await _compute_lodging_summary(updated["event_booking_id"])
    await db.event_bookings.update_one(
        {"id": updated["event_booking_id"]},
        {"$set": {"lodging_summary": summary, "lodging_integration_enabled": summary["total"] > 0, "updated_at": _now_iso()}},
    )
    return updated


@router.delete("/event-lodging-assignments/{assignment_id}")
async def delete_event_lodging_assignment(
    assignment_id: str,
    _: UserModel = Depends(require_any_module("jardines", "garden_lodging_integration")),
    current_user: UserModel = Depends(require_role("platform_admin", "admin", "receptionist", "manager")),
):
    doc = await db.event_lodging_assignments.find_one({"id": assignment_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Asignación no encontrada")

    event_doc = await db.event_bookings.find_one({"id": doc.get("event_booking_id")}, {"_id": 0})
    if not event_doc:
        raise HTTPException(status_code=404, detail="Evento no encontrado")
    await _ensure_event_booking_in_scope(event_doc, current_user)

    if doc.get("reservation_id"):
        raise HTTPException(status_code=400, detail="No se puede eliminar una asignación con reservation_id enlazada")

    await db.event_lodging_assignments.delete_one({"id": assignment_id})
    await _safe_release_room_if_no_locks(doc.get("room_id"))

    summary = await _compute_lodging_summary(doc["event_booking_id"])
    await db.event_bookings.update_one(
        {"id": doc["event_booking_id"]},
        {"$set": {"lodging_summary": summary, "lodging_integration_enabled": summary["total"] > 0, "updated_at": _now_iso()}},
    )
    return {"deleted": True}

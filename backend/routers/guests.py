from fastapi import APIRouter, Depends, HTTPException

from auth import get_current_user, require_role, _allowed_property_ids, _ensure_guest_in_scope
from db import db
from models import GuestCreate, GuestModel, UserModel

router = APIRouter()


@router.get("/guests")
async def get_guests(current_user: UserModel = Depends(get_current_user)):
    allowed = await _allowed_property_ids(current_user)
    if allowed is None:
        return await db.guests.find({}, {"_id": 0}).to_list(1000)
    if not allowed:
        return []
    # Guests have no property_id; scope by guests who appear in reservations for allowed properties.
    res_list = await db.reservations.find({"property_id": {"$in": allowed}}, {"guest_id": 1}).to_list(10000)
    guest_ids = list({r["guest_id"] for r in res_list})
    if not guest_ids:
        return []
    return await db.guests.find({"id": {"$in": guest_ids}}, {"_id": 0}).to_list(1000)


@router.post("/guests")
async def create_guest(data: GuestCreate, current_user: UserModel = Depends(get_current_user)):
    guest = GuestModel(**data.model_dump())
    await db.guests.insert_one(guest.model_dump()); return guest.model_dump()


@router.get("/guests/{guest_id}")
async def get_guest(guest_id: str, current_user: UserModel = Depends(get_current_user)):
    guest = await db.guests.find_one({"id": guest_id}, {"_id": 0})
    if not guest: raise HTTPException(status_code=404, detail="Huésped no encontrado")
    await _ensure_guest_in_scope(guest_id, current_user)
    return guest


@router.put("/guests/{guest_id}")
async def update_guest(guest_id: str, data: GuestCreate, current_user: UserModel = Depends(get_current_user)):
    await _ensure_guest_in_scope(guest_id, current_user)
    update_dict = {k: v for k, v in data.model_dump().items() if v is not None}
    result = await db.guests.find_one_and_update({"id": guest_id}, {"$set": update_dict}, return_document=True)
    if not result: raise HTTPException(status_code=404, detail="Huésped no encontrado")
    result.pop("_id", None); return result


@router.delete("/guests/{guest_id}")
async def delete_guest(guest_id: str, current_user: UserModel = Depends(get_current_user)):
    await _ensure_guest_in_scope(guest_id, current_user)
    await db.guests.delete_one({"id": guest_id}); return {"message": "Huésped eliminado"}


@router.patch("/guests/{guest_id}/vip")
async def toggle_vip(guest_id: str, current_user: UserModel = Depends(require_role("admin", "receptionist"))):
    guest = await db.guests.find_one({"id": guest_id})
    if not guest: raise HTTPException(status_code=404, detail="Huésped no encontrado")
    await _ensure_guest_in_scope(guest_id, current_user)
    new_vip = not guest.get("is_vip", False)
    await db.guests.update_one({"id": guest_id}, {"$set": {"is_vip": new_vip}})
    guest["is_vip"] = new_vip; guest.pop("_id", None); return guest


@router.get("/guests/{guest_id}/reservations")
async def guest_reservations(guest_id: str, current_user: UserModel = Depends(get_current_user)):
    await _ensure_guest_in_scope(guest_id, current_user)
    allowed = await _allowed_property_ids(current_user)
    if allowed is None:
        q = {"guest_id": guest_id}
    else:
        q = {"guest_id": guest_id, "property_id": {"$in": allowed}}
    res = await db.reservations.find(q, {"_id": 0}).sort("check_in_date", -1).to_list(50)
    total_spent = sum(r.get("total_amount", 0) for r in res if r.get("status") not in ["cancelled"])
    return {"reservations": res, "total_spent": total_spent, "total_stays": len([r for r in res if r.get("status") in ["checked_in","checked_out"]])}

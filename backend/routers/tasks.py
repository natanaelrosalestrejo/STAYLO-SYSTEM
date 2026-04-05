"""
Tasks API routes: list, create, update status, delete.
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from auth import require_module
from db import db
from models import TaskCreate, TaskModel, UserModel

router = APIRouter()


@router.get("/tasks")
async def get_tasks(current_user: UserModel = Depends(require_module("tasks"))):
    if current_user.role in ["receptionist", "manager"]:
        return await db.tasks.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return await db.tasks.find(
        {"$or": [{"assigned_to": current_user.id}, {"assigned_by": current_user.id}]},
        {"_id": 0},
    ).sort("created_at", -1).to_list(1000)


@router.post("/tasks")
async def create_task(
    data: TaskCreate, current_user: UserModel = Depends(require_module("tasks"))
):
    assigned_to_name = None
    if data.assigned_to:
        assignee = await db.users.find_one({"id": data.assigned_to})
        if assignee:
            assigned_to_name = assignee["name"]
    room_number = None
    if data.room_id:
        room = await db.rooms.find_one({"id": data.room_id})
        if room:
            room_number = room["number"]
    task = TaskModel(
        title=data.title,
        description=data.description,
        assigned_to=data.assigned_to,
        assigned_to_name=assigned_to_name,
        assigned_by=current_user.id,
        assigned_by_name=current_user.name,
        room_id=data.room_id,
        room_number=room_number,
        priority=data.priority,
        category=data.category,
        due_date=data.due_date,
    )
    await db.tasks.insert_one(task.model_dump())
    return task.model_dump()


@router.patch("/tasks/{task_id}/status")
async def update_task_status(
    task_id: str, data: dict, current_user: UserModel = Depends(require_module("tasks"))
):
    result = await db.tasks.find_one_and_update(
        {"id": task_id},
        {
            "$set": {
                "status": data.get("status"),
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
        },
        return_document=True,
    )
    if not result:
        raise HTTPException(status_code=404, detail="Tarea no encontrada")
    result.pop("_id", None)
    return result


@router.delete("/tasks/{task_id}")
async def delete_task(
    task_id: str, current_user: UserModel = Depends(require_module("tasks"))
):
    await db.tasks.delete_one({"id": task_id})
    return {"message": "Tarea eliminada"}

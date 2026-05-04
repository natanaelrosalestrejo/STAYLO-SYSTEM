from fastapi import APIRouter, Depends, HTTPException

from auth import require_role
from db import db
from models import TenantCreate, TenantModel, UserModel

router = APIRouter()


@router.get("/tenants")
async def list_tenants(current_user: UserModel = Depends(require_role("platform_admin", "manager", "owner"))):
    return await db.tenants.find({}, {"_id": 0}).to_list(100)


@router.post("/tenants")
async def create_tenant(data: TenantCreate, current_user: UserModel = Depends(require_role("platform_admin"))):
    t = TenantModel(**data.model_dump())
    await db.tenants.insert_one(t.model_dump())
    return t.model_dump()


@router.patch("/tenants/{tenant_id}")
async def update_tenant(tenant_id: str, data: dict, current_user: UserModel = Depends(require_role("platform_admin"))):
    await db.tenants.update_one({"id": tenant_id}, {"$set": data})
    t = await db.tenants.find_one({"id": tenant_id}, {"_id": 0})
    if not t:
        raise HTTPException(status_code=404, detail="Tenant no encontrado")
    return t


@router.get("/tenants/{tenant_id}")
async def get_tenant(tenant_id: str, current_user: UserModel = Depends(require_role("platform_admin", "manager", "owner"))):
    t = await db.tenants.find_one({"id": tenant_id}, {"_id": 0})
    if not t:
        raise HTTPException(status_code=404, detail="Tenant no encontrado")
    return t


@router.delete("/tenants/{tenant_id}")
async def delete_tenant(tenant_id: str, current_user: UserModel = Depends(require_role("platform_admin"))):
    props = await db.properties.count_documents({"tenant_id": tenant_id})
    if props > 0:
        raise HTTPException(
            status_code=400,
            detail=f"No se puede eliminar: el tenant tiene {props} propiedad(es) asignada(s). Desasígnalas primero.",
        )
    await db.tenants.delete_one({"id": tenant_id})
    return {"deleted": True}

"""
One-shot data migration: legacy business role `admin` -> `manager`.

Run from repo `backend/` with the same env as the API (MONGO_URL / DB_NAME):
  python -m scripts.migrate_legacy_admin_to_manager

Deploy order: run this against production/staging DB *before* deploying code that
removes DEFAULT_ROLE_PERMISSIONS["admin"] and legacy compatibility paths.
"""
from __future__ import annotations

import asyncio
from datetime import datetime, timezone

from db import db
from models import DEFAULT_ROLE_PERMISSIONS


async def main() -> None:
    # 1) Users
    ur = await db.users.update_many({"role": "admin"}, {"$set": {"role": "manager"}})
    print(f"[migrate] users: matched={ur.matched_count}, modified={ur.modified_count}")

    # 2) role_permissions: merge `admin` modules into `manager`, then delete `admin`
    admin_doc = await db.role_permissions.find_one({"role": "admin"}, {"_id": 0})
    if admin_doc:
        mgr_doc = await db.role_permissions.find_one({"role": "manager"}, {"_id": 0})
        mgr_mods = list((mgr_doc or {}).get("modules") or [])
        if not mgr_mods:
            mgr_mods = list(DEFAULT_ROLE_PERMISSIONS.get("manager", []))
        adm_mods = list(admin_doc.get("modules") or [])
        seen: set[str] = set()
        merged: list[str] = []
        for m in mgr_mods + adm_mods:
            if m not in seen:
                seen.add(m)
                merged.append(m)
        now = datetime.now(timezone.utc).isoformat()
        await db.role_permissions.update_one(
            {"role": "manager"},
            {"$set": {"role": "manager", "modules": merged, "updated_at": now}},
            upsert=True,
        )
        dr = await db.role_permissions.delete_one({"role": "admin"})
        print(f"[migrate] role_permissions: merged admin -> manager, deleted admin docs={dr.deleted_count}")
    else:
        print("[migrate] role_permissions: no document with role=admin")

    # 3) Verification
    left_users = await db.users.count_documents({"role": "admin"})
    left_rp = await db.role_permissions.count_documents({"role": "admin"})
    print(f"[migrate] verify remaining users with role=admin: {left_users}")
    print(f"[migrate] verify remaining role_permissions with role=admin: {left_rp}")


if __name__ == "__main__":
    asyncio.run(main())

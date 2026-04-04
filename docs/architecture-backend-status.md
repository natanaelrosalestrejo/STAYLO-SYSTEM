> **Ubicación:** `docs/architecture-backend-status.md` (movido desde `backend/BACKEND_STABILIZATION_STATUS.md`). Estado vivo del refactor backend.

---

# Backend stabilization — current status and next steps

**Last updated:** After Phase 2 (models extraction).  
**Goal:** Finish modular refactor safely without breaking the running app.

---

## 1. Current backend structure (after previous refactor)

| Component | Location | Status |
|-----------|----------|--------|
| Config / env | `config.py` | ✅ Done (Phase 1) |
| MongoDB client | `db.py` | ✅ Done (Phase 1) |
| Scoring helpers | `services/scoring.py` | ✅ Done (Phase 1) |
| Pydantic models | `models/schemas.py` + `models/__init__.py` | ✅ Done (Phase 2) |
| Auth + scope helpers | `server.py` | ⏳ Pending (Phase 3) |
| Seed functions | `server.py` | ⏳ Pending (Phase 4) |
| All route handlers | `server.py` | ⏳ Pending (Phases 5–10) |

`server.py` still contains: auth (pwd_context, oauth2_scheme, verify_password, hash_password, create_token, get_current_user, require_role, _allowed_property_ids, _ensure_*_in_scope), all seed_* functions, and every API route. Only config, db, scoring, and **models** have been extracted.

---

## 2. Permissions: where they are and how they work

### 2.1 Where role/module permissions are stored

- **Per-role (platform):** MongoDB collection `role_permissions`. Each document: `{ "role": "receptionist", "modules": ["dashboard", "reservations", ...], "updated_at": "..." }`. Defaults live in code: `DEFAULT_ROLE_PERMISSIONS` (now in `models/catalog.py` / re-exported from `models`).
- **Per-user overrides:** Field `custom_permissions: Optional[List[str]]` on the user document in `users` collection. Used for staff (e.g. manager) to restrict which modules a user can see.

### 2.2 How they are loaded (backend)

- **User (for auth/scope):** On every request, `get_current_user` decodes JWT → reads `user_id` from `sub` → loads full user from `db.users` (including `role`, `custom_permissions`, `property_id`, `tenant_id`). So permission/role changes apply on the next request; no re-login required for backend enforcement.
- **Role permissions (for platform admin UI):** `GET /api/role-permissions` merges `DEFAULT_ROLE_PERMISSIONS` with documents from `db.role_permissions` and returns one object keyed by role. Used only by the frontend to display/edit the module list per role.

### 2.3 How the frontend consumes them

- **Sidebar / nav:** `Layout.js` filters `navItems` by:
  1. `user.role` (from `/api/auth/me` → AuthContext).
  2. If `user.custom_permissions` is set, only items whose module key is in `custom_permissions` are shown.
- **Platform Admin:** `PlatformAdmin.js` calls `GET /api/role-permissions` to show/edit per-role modules and `PUT /api/role-permissions/{role}` to update. User create/edit forms send `custom_permissions` for staff users.

### 2.4 Do permission changes apply after re-login?

- **Backend:** Yes, and even without re-login. Each request loads the user from DB; so if an admin changes a user’s `role` or `custom_permissions`, the next API call already sees the new data.
- **Frontend:** The UI state (sidebar, available pages) comes from the user object in AuthContext, which is set at login (and when calling `/auth/me`). So for the **user whose permissions were changed**, they need to **re-login** (or the app could refresh `/auth/me` and update context) to see the new sidebar. For **role_permissions** (module list per role), the Platform Admin page fetches them when opened; no re-login needed for that screen.

---

## 3. What was still pending from the modular refactor (before Phase 2)

- **Phase 2 — Models:** Move all Pydantic models and `DEFAULT_ROLE_PERMISSIONS` out of `server.py` into a `models/` package. ✅ Done in this pass.
- **Phase 3:** Extract auth and scope helpers to `auth.py`.
- **Phase 4:** Extract seed logic to `seeds/run.py`.
- **Phases 5–10:** Extract routers (auth, messages, tasks, users, rooms, guests, reservations, reports, AI, properties, event_spaces, hotel_spaces, event_bookings, corporate, platform, public).

---

## 4. Safest next refactor chunk (after Phase 2)

**Phase 3 — Auth and scope helpers** is the next safest step:

- Move to `auth.py`: `pwd_context`, `oauth2_scheme`, `verify_password`, `hash_password`, `create_token`, `get_current_user`, `require_role`, `_allowed_property_ids`, `_ensure_room_in_scope`, `_ensure_reservation_in_scope`, `_ensure_guest_in_scope`.
- Dependencies: `auth` will import `db`, `config` (SECRET_KEY, ALGORITHM, TOKEN_EXPIRE_MINUTES), and `UserModel` from `models`. No router imports in `auth`, so no circular dependency if routers later import from `auth`.
- Risk: Medium (many call sites); mitigated by keeping the same function signatures and importing them in `server.py` as `from auth import get_current_user, require_role, ...`.

---

## 5. Step-by-step implementation plan (Phase 2 — completed)

1. Create `backend/models/` package.
2. Add `models/schemas.py` with all Pydantic models and `DEFAULT_ROLE_PERMISSIONS` (same definitions as in `server.py`), with imports only for `pydantic`, `typing`, `datetime`, `uuid`.
3. Add `models/__init__.py` that re-exports every model and `DEFAULT_ROLE_PERMISSIONS` so `from models import UserModel, RoomModel, ...` works.
4. In `server.py`: remove the models block (classes and `DEFAULT_ROLE_PERMISSIONS`); add `from models import (...)` with all symbols used in `server.py`.
5. Run backend tests and a quick smoke test (login, one report) to confirm no regressions.

---

## 6. Risks introduced by Phase 2

- **None expected.** Models are pure data definitions; no route or auth logic changed. Only risk would be a typo in an import or a missing re-export, which tests should catch.

---

## 7. Optional: later split of `models/schemas.py`

For maintainability, `schemas.py` can later be split into domain files (e.g. `user.py`, `room.py`, `booking.py`, `catalog.py`) and `__init__.py` can re-export from those. Phase 2 kept a single file to avoid any cross-file model dependencies (e.g. `PublicBookingCreate` using `ExtrasRequest`) and to minimize diff size.

> **Archived document.** Plan inicial de modularización; el trabajo real posterior está resumido en [architecture-backend-status.md](../architecture-backend-status.md).  
> Solo referencia histórica.

---

# Backend Modular Refactor Plan — server.py

**Purpose:** Split `backend/server.py` (~2125 lines) into maintainable modules while preserving API behavior, auth, payments, and tenant/property isolation. No route changes, no schema changes, no frontend changes.

**Status:** Planning only. No code modified.

---

## 1. Proposed backend folder structure

```
backend/
├── server.py                 # Becomes thin entry: create app, config, register routers, startup/shutdown only
├── config.py                 # Env loading, production checks, CORS list, constants (EXTRAS_CATALOG, etc.)
├── db.py                     # Mongo client and db instance (or keep in config.py)
├── auth.py                   # pwd_context, oauth2_scheme, get_current_user, require_role, scope helpers
├── models/                   # Pydantic request/response and domain models
│   ├── __init__.py           # Re-export all for backward compatibility
│   ├── user.py
│   ├── room.py
│   ├── guest.py
│   ├── reservation.py
│   ├── message.py
│   ├── task.py
│   ├── property.py           # Property, EventSpace, HotelSpace, EventBooking
│   ├── tenant.py
│   ├── catalog.py            # RoomType, Amenity, RolePermissionUpdate, DEFAULT_ROLE_PERMISSIONS
│   └── booking.py            # PublicBookingCreate, PendingBookingModel, PaymentTransactionModel, ExtrasRequest
├── routers/
│   ├── __init__.py
│   ├── auth.py               # POST /auth/login, GET /auth/me
│   ├── users.py
│   ├── rooms.py
│   ├── guests.py
│   ├── reservations.py
│   ├── messages.py
│   ├── tasks.py
│   ├── reports.py            # dashboard, occupancy, insights, export/csv, revenue-breakdown
│   ├── ai.py                 # suggest-reply, summarize, task-suggestion
│   ├── properties.py         # list/create/patch/delete properties, properties/stats
│   ├── event_spaces.py
│   ├── hotel_spaces.py
│   ├── event_bookings.py
│   ├── corporate.py          # GET /corporate/dashboard
│   ├── public.py             # public booking (lookup, availability, create, checkout session, pending, status), webhook
│   └── platform.py           # tenants, room-types, amenities, role-permissions, platform/stats, onboard, features
├── services/                 # Optional: pure or near-pure logic
│   └── scoring.py            # calculate_hotel_score, calculate_garden_score
├── seeds/
│   ├── __init__.py
│   └── run.py                # seed_data, seed_properties, seed_owner, seed_platform_admin, seed_tenants, seed_room_types, seed_amenities
├── requirements.txt
└── tests/
    └── ...
```

**Alternative (flatter):** Omit `models/` subpackages and use a single `models/__init__.py` with multiple model files; or keep one `schemas.py` until Phase 2. Same for `routers/` — one file per domain is the goal.

---

## 2. Sections of server.py and where they should move

| Section in server.py (approx lines) | Content | Move to |
|-------------------------------------|--------|--------|
| 1–63 | Imports, load_dotenv, IS_PRODUCTION, mongo client, db, SECRET_KEY, env vars, EXTRAS_CATALOG, pwd_context, oauth2_scheme, app, api_router | config.py (env, constants), db.py (client, db), auth.py (pwd, oauth2_scheme), server.py (app, api_router creation only) |
| 64–360 | All Pydantic models (User*, Room*, Guest*, Reservation*, Message*, Task*, Property*, EventSpace*, HotelSpace*, EventBooking*, Tenant*, RoomType*, Amenity*, RolePermission*, PublicBooking*, Pending*, Payment*, ExtrasRequest, LoginRequest) | models/ (split by domain as above) |
| 362–436 | verify_password, hash_password, create_token, get_current_user, require_role, _allowed_property_ids, _ensure_room_in_scope, _ensure_reservation_in_scope, _ensure_guest_in_scope | auth.py |
| 438–456 | calculate_hotel_score, calculate_garden_score | services/scoring.py |
| 458–679 | seed_data, seed_properties, seed_owner, seed_platform_admin, seed_tenants, seed_room_types, seed_amenities | seeds/run.py |
| 681–699 | Login, get_me | routers/auth.py |
| 702–766 | Users CRUD + delete | routers/users.py |
| 768–818 | Rooms list/create/update/status/delete | routers/rooms.py |
| 824–859 | Guests list/create/get/update/delete | routers/guests.py |
| 864–936 | Reservations list/create/checkin/checkout/cancel/collect-payment | routers/reservations.py |
| 938–972 | Messages unread-count, list, create, mark_read | routers/messages.py |
| 974–1009 | Tasks list/create/status/delete | routers/tasks.py |
| 1012–1166 | reports/dashboard, occupancy, toggle_vip, guest_reservations, revenue_insights, export/csv, revenue_breakdown | routers/reports.py |
| 1168–1198 | AI suggest-reply, summarize, task-suggestion | routers/ai.py |
| 1200–1308 | Properties CRUD, event-spaces CRUD, hotel-spaces CRUD, event-bookings CRUD | routers/properties.py, routers/event_spaces.py, routers/hotel_spaces.py, routers/event_bookings.py |
| 1310–1500 | corporate/dashboard | routers/corporate.py |
| 1501–1549 | properties/stats | routers/properties.py (or corporate if tightly coupled) |
| 1551–1847 | Public booking (calculate_extras_total, build_extras_summary, find_available_room_of_type, send_booking_confirmation_email, lookup, availability, create, checkout session, pending, checkout status), stripe webhook | routers/public.py (+ optional services/booking.py for helpers) |
| 1859–2092 | Tenants, room-types, amenities, role-permissions, platform/stats, platform/onboard, properties/{id}/features | routers/platform.py |
| 2094–2124 | startup, shutdown, CORS, include_router, add_middleware, logging | server.py (or main.py) only |

---

## 3. Lowest risk to extract first

- **Constants and config (no behavior):** `EXTRAS_CATALOG`, `DEFAULT_ROLE_PERMISSIONS`, `COLORS` (inside seeds), env reads and `IS_PRODUCTION` / CORS build. Moving to `config.py` and importing in server keeps behavior identical.
- **Pure helpers:** `calculate_hotel_score`, `calculate_garden_score` — no `db`, no FastAPI. Move to `services/scoring.py` (or `utils/scoring.py`); routes import from there.
- **Pydantic models:** All `*Model`, `*Create`, `*Update`, `*Response`, and request DTOs. No side effects; only depend on `pydantic`, `typing`, `datetime`, `uuid`. Splitting into `models/` (one file per domain or one `schemas.py` at first) and re-exporting from `models/__init__.py` keeps existing route code working by changing imports to `from models import ...` (or `from models.room import RoomModel, RoomCreate, RoomUpdate`).

---

## 4. Medium risk to extract

- **Auth and scope helpers:** `auth.py` with `verify_password`, `hash_password`, `create_token`, `get_current_user`, `require_role`, `_allowed_property_ids`, `_ensure_room_in_scope`, `_ensure_reservation_in_scope`, `_ensure_guest_in_scope`. They depend on `db`, `UserModel`, `SECRET_KEY`, `oauth2_scheme`, `TOKEN_EXPIRE_MINUTES`. Risk: circular imports if routers import auth and auth imports something that eventually imports a router. Mitigation: auth imports only from `config`, `db`, and `models`; routers import `Depends(get_current_user)` from `auth`; server imports routers and auth. Keep `oauth2_scheme` and `get_current_user` in one place so `tokenUrl` and dependency chain stay correct.
- **DB instance:** Moving `client` and `db` to `db.py` and importing in server and auth (and later in routers that need it) is low risk if no circular import is introduced (db should not import routers).
- **Seed functions:** Move to `seeds/run.py`; they depend on `db` and all model classes. Have `seeds/run.py` import `db` from `db` and models from `models`. Startup in server.py calls `await seeds.run.run_all()` or similar. Risk: seed order and dependencies (e.g. seed_tenants before seed_properties) must stay the same.
- **Simple routers (auth, messages, tasks):** Few dependencies; they use `api_router` (or their own `APIRouter()` with same prefix `/api`), `get_current_user`, `require_role`, and a handful of models. Extract to `routers/auth.py`, `routers/messages.py`, `routers/tasks.py` and in server do `app.include_router(auth.router, prefix="/api")` etc. Route paths and behavior unchanged.

---

## 5. Highest risk — extract last or keep in server longer

- **Public booking + Stripe + email:** `routers/public.py` plus helpers (`find_available_room_of_type`, `calculate_extras_total`, `build_extras_summary`, `send_booking_confirmation_email`). Tight coupling to `db`, `EXTRAS_CATALOG`, Resend, Stripe (emergentintegrations), and reservation/room/guest creation. Webhook must remain consistent with Stripe and existing payment flow. Any mistake can break checkout or double-booking logic. Recommend extracting only after all other routers and auth/config/models are stable, and run full payment/booking tests.
- **Corporate dashboard:** Large handler with many aggregates (reservations, event_bookings, properties, rooms, revenue, scores). Depends on `calculate_hotel_score`, `calculate_garden_score`, `db`. Moving to `routers/corporate.py` is straightforward by import, but the block is long and easy to break when cutting/pasting; test corporate dashboard and properties/stats after move.
- **Platform module:** Tenants, room-types, amenities, role-permissions, platform/stats, platform/onboard, properties/{id}/features. `onboard_property` is large and creates rooms, event_spaces, etc. Depends on many models and db. Extract after corporate and public are stable; run platform-admin and onboarding flows in tests.
- **Reports:** Multiple endpoints (dashboard, occupancy, insights, export CSV, revenue-breakdown) and use of scoring helpers and db. Medium–high risk when splitting (many imports); extract as one `routers/reports.py` and test all report endpoints.

---

## 6. Phased refactor plan

### Phase 1 — Config, constants, pure helpers (lowest risk)

- Add `config.py`: env loading, `IS_PRODUCTION`, `SECRET_KEY`, `MONGO_URL`, `DB_NAME`, `CORS_ORIGINS_LIST`, `EXTRAS_CATALOG`, and other read-only env/constants. No `app` or `db` creation here if that would require importing app.
- Add `db.py`: `client = AsyncIOMotorClient(mongo_url)`, `db = client[db_name]` where `mongo_url` and `db_name` come from config (or from env inside db.py to avoid circular import).
- Add `services/scoring.py`: `calculate_hotel_score`, `calculate_garden_score`.
- In `server.py`: replace in-place env and constants with `from config import ...`, `from db import db`, `from services.scoring import ...`. Keep CORS and JWT production checks in config or server; do not duplicate.
- **Tests before Phase 1:** Run full backend test suite. Smoke test login and one report endpoint that uses scoring.

### Phase 2 — Models

- Create `models/` package and split Pydantic models by domain (user, room, guest, reservation, message, task, property, tenant, catalog, booking). Or start with a single `models/schemas.py` that holds all and move to split in a later iteration.
- `models/__init__.py` re-exports all so existing code can do `from models import UserModel, RoomModel, ...`.
- In `server.py` (and any file that defines routes): change model imports to `from models import ...` or `from models.xxx import ...`. Ensure no model imports server or routers (no circular dependency).
- **Tests before Phase 2:** Full test suite; no API behavior change.

### Phase 3 — Auth and scope

- Add `auth.py`: move `pwd_context`, `oauth2_scheme`, `verify_password`, `hash_password`, `create_token`, `get_current_user`, `require_role`, `_allowed_property_ids`, `_ensure_room_in_scope`, `_ensure_reservation_in_scope`, `_ensure_guest_in_scope`. Import `db` from `db`, config from `config`, `UserModel` from `models`.
- In `server.py`: remove those definitions; add `from auth import get_current_user, require_role, ...`. Ensure `oauth2_scheme` tokenUrl remains `"/api/auth/login"` (or adjust only if intentional).
- **Tests before Phase 3:** Full test suite; especially auth, get_me, and one scope-protected route (e.g. rooms list, reservations list).

### Phase 4 — Seeds

- Add `seeds/run.py` (or `seeds/__init__.py` with a `run_all()`). Move all `seed_*` functions; they import `db` and models.
- In `server.py` startup: replace inline `await seed_*()` with a single call to `seeds.run.run_all()` (or equivalent) that runs the same seed order.
- **Tests before Phase 4:** Run app once, ensure DB seeds correctly; run test suite (tests may assume seeded data).

### Phase 5 — Simple routers (auth, messages, tasks)

- Add `routers/auth.py`: define `router = APIRouter()` and register `POST /auth/login`, `GET /auth/me` (paths relative to router; when including, use prefix `"/api"` so full path stays `/api/auth/login`).
- Add `routers/messages.py` and `routers/tasks.py` with their routes. Each router receives `get_current_user` and `require_role` via import from `auth` and uses `Depends(get_current_user)` etc.
- In `server.py`: `app.include_router(auth.router, prefix="/api")`, same for messages and tasks. Remove the corresponding route blocks from server.py.
- **Tests before Phase 5:** Full test suite; hit auth, messages, and tasks endpoints.

### Phase 6 — Core domain routers (users, rooms, guests, reservations)

- Extract `routers/users.py`, `routers/rooms.py`, `routers/guests.py`, `routers/reservations.py`. Each uses auth (get_current_user, require_role) and scope helpers where already used (rooms, guests, reservations). Import models and db from shared packages.
- Register each in server with prefix `"/api"` (or mount under a single `api_router` that you then include once; current design uses one `api_router` with prefix `/api`, so either each module adds routes to that router via a function `register(api_router)` or each module exposes its own `APIRouter()` and server includes them with prefix `/api`).
- **Tests before Phase 6:** Full test suite; focus on users CRUD, rooms/guests/reservations list and create/update/delete and scope (property/tenant isolation).

### Phase 7 — Reports and AI

- Extract `routers/reports.py` (dashboard, occupancy, insights, export/csv, revenue-breakdown, toggle_vip, guest_reservations) and `routers/ai.py` (suggest-reply, summarize, task-suggestion).
- **Tests before Phase 7:** Full test suite; report endpoints and AI endpoints if covered.

### Phase 8 — Properties, event-spaces, hotel-spaces, event-bookings

- Extract `routers/properties.py`, `routers/event_spaces.py`, `routers/hotel_spaces.py`, `routers/event_bookings.py`.
- **Tests before Phase 8:** Full test suite and any E2E that touch these resources.

### Phase 9 — Corporate and platform

- Extract `routers/corporate.py` (GET /corporate/dashboard, GET /properties/stats if here) and `routers/platform.py` (tenants, room-types, amenities, role-permissions, GET /platform/stats, POST /platform/onboard, properties/{id}/features).
- **Tests before Phase 9:** Full test suite; platform-admin and owner flows (corporate dashboard, platform stats, onboarding).

### Phase 10 — Public booking and Stripe (highest risk)

- Extract public booking helpers and routes to `routers/public.py` (and optionally `services/booking.py` for pure helpers). Keep Stripe webhook in the same module as checkout/status so payment flow stays in one place.
- **Tests before Phase 10:** Full test suite; any tests that hit public booking, checkout session, checkout status, and webhook; manual smoke test of payment flow if possible.

---

## 7. What should remain temporarily in server.py

After all phases, `server.py` should contain only:

- Imports of FastAPI, middleware, and the app factory (if you later move app creation to a factory).
- Creation of `app = FastAPI()` and the main `APIRouter(prefix="/api")` if you still aggregate routes there.
- Imports of config (and CORS list), db (if needed for startup), auth (only if something must be registered at app level), and all routers.
- Registration of routers: `app.include_router(api_router)` or `app.include_router(routers.auth.router, prefix="/api")`, etc.
- `@app.on_event("startup")`: call to `seeds.run.run_all()` (or equivalent) and any other one-time setup.
- `@app.on_event("shutdown")`: e.g. `client.close()`.
- CORS middleware: `app.add_middleware(CORSMiddleware, ...)` using config.
- `logging.basicConfig` and `logger` if you keep them at entry point.

Everything else (models, auth logic, route handlers, seeds implementation, payment and public-booking logic) lives in the new modules. During the refactor, after each phase, server.py still runs the app and delegates to the extracted code; no behavior change.

---

## 8. Test recommendations before each phase

| Phase | Recommended tests |
|-------|--------------------|
| 1 | Run `pytest backend/tests/` (or project test command). Optionally: manual login, GET /api/reports/dashboard. |
| 2 | Same pytest; no new tests required if imports are pure. |
| 3 | Pytest; explicit test of login, GET /api/auth/me, and at least one scope-filtered endpoint (e.g. GET /api/rooms with non–platform_admin user). |
| 4 | Pytest; start app with empty DB, confirm seeds run and at least one seeded entity exists. |
| 5 | Pytest; GET/POST messages, GET/POST tasks, and auth routes. |
| 6 | Pytest; users CRUD, rooms/guests/reservations CRUD and list; if tests exist for property isolation, run them. |
| 7 | Pytest; all report endpoints and AI endpoints. |
| 8 | Pytest; properties, event-spaces, hotel-spaces, event-bookings CRUD. |
| 9 | Pytest; GET /api/corporate/dashboard, GET /api/platform/stats, POST /api/platform/onboard (if testable), GET/PATCH properties/{id}/features. |
| 10 | Pytest; public booking and payment-related tests; manual checkout flow if no automated test. |

**General:** After every phase, run the full backend test suite and fix any import or dependency errors before proceeding. Prefer running tests in the same environment as production (e.g. same Python version and env vars) to catch missing config or DB assumptions.

---

*End of refactor plan. No code has been modified.*

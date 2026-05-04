# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

STAYLO is a full-stack SaaS platform for hotel and event garden management. It supports multi-property operations, reservations, guests, staff, and reports with role-based access control and multi-tenant isolation.

## Tech Stack

**Backend:** FastAPI 0.110.1 + Uvicorn (Python 3.12), MongoDB via Motor async driver, JWT auth (python-jose), pytest for integration tests.

**Frontend:** React 19, React Router v7.5, Tailwind CSS 3.4, Axios, React Hook Form + Zod, Craco (CRA override), Yarn.

## Development Commands

### Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# Run dev server
python -m uvicorn server:app --reload --host 0.0.0.0 --port 8000

# Run all tests
pytest tests/

# Run single test file or filter
pytest tests/test_hotel_api.py -v
pytest tests/ -k "test_login"
pytest --lf  # re-run last failed

# Code quality
black . && isort . && flake8 .
```

### Frontend

```bash
cd frontend
yarn install

# Dev server (http://localhost:3000)
yarn start

# Production build
yarn build
```

### Docker

```bash
docker-compose up --build
# Backend: http://localhost:8000
# Frontend: http://localhost:3000
# Swagger UI: http://localhost:8000/docs
```

### Environment

Copy `.env.example` to `.env` at the repo root. Key vars:
- `MONGO_URL`, `DB_NAME` — required
- `JWT_SECRET_KEY` — must be strong in production (enforced by `config.py`)
- `ENVIRONMENT=production` — enforces strict CORS and JWT checks
- `REACT_APP_BACKEND_URL` — frontend points to backend (default: `http://localhost:8000`)

## Architecture

### Backend Structure

`backend/server.py` is the main FastAPI app (~87KB). It still contains most route handlers — modularization into `backend/routers/` is ongoing. When adding routes, prefer creating or extending a file in `routers/` then including it in `server.py` via `app.include_router(...)`.

Key files:
- `server.py` — all app routes + app factory
- `auth.py` — JWT creation/validation, `get_current_user()`, scope helpers
- `db.py` — Motor async MongoDB client
- `config.py` — env var loading and production validation
- `models/schemas.py` — all Pydantic models
- `routers/` — extracted routers: auth, users, rooms, guests, messages, tasks, event_lodging
- `services/` — scoring logic, permission resolution, report scope filtering

### Permission System

Three-layer resolution (lowest wins):
1. **`DEFAULT_ROLE_PERMISSIONS`** (hardcoded in `auth.py`) — maps role → modules list
2. **`role_permissions` collection** (DB) — per-role module overrides
3. **`user.custom_permissions`** (user doc field) — per-user overrides

Route guards use `require_module("key")` FastAPI dependency. Frontend mirrors this via `canAccessRoute()` in `src/utils/permissions.js`.

Roles: `platform_admin`, `owner`, `manager`, `receptionist`, `sales`.

### Multi-Property Scope Enforcement

Every data-access route calls scope helpers to prevent cross-property leaks:
- `_allowed_property_ids(user)` — returns list of property IDs the user can access
- `_ensure_room_in_scope(room_id, user)` — raises 403 if room not in user's properties
- `_ensure_reservation_in_scope(reservation_id, user)` — same for reservations

Platform admins bypass scope; all other roles are constrained to their `property_id` / `property_ids`.

### Frontend Routing & Auth

- `src/App.js` — React Router setup, all routes wrapped in `<ProtectedRoute>`
- `src/contexts/AuthContext.js` — token + user stored in localStorage; exposes `useAuth()`
- `src/contexts/PropertyContext.js` — selected property for multi-property navigation
- `src/utils/api.js` — Axios instance that injects `Authorization: Bearer <token>`
- `src/components/Layout.js` — sidebar nav filtered by user's effective modules

Default redirect after login by role: `platform_admin` → `/platform-admin`, `owner` → `/corporate`, `manager` → `/corporate` or `/hotels`, others → `/`.

### Data Model Highlights

MongoDB collections (no migrations — schemaless):
- `users`: role, property_id/property_ids, tenant_id, custom_permissions
- `properties`: type (`hotel` | `event_garden`), tenant_id
- `rooms` + `room_types`: linked to property
- `reservations`: guest_id, room_id, check_in/check_out, status
- `event_spaces` + `event_bookings`: for event garden properties
- `role_permissions`: DB-level role overrides
- `tenants`: multi-tenant isolation (SaaS)

### Design System

`design_guidelines.json` at repo root defines canonical colors, typography, and component patterns. Tailwind theme extends these in `frontend/tailwind.config.js`. Icons use Lucide React with 1.5pt stroke width. Toast notifications use Sonner.

## Debugging Common Issues

| Symptom | Check |
|---------|-------|
| 401 Unauthorized | JWT expired (24h TTL); try `GET /api/auth/me` directly |
| 403 Insufficient permissions | User's `modules` list in `/api/auth/me` response; verify `require_module()` guard; check `role_permissions` doc in DB |
| Sidebar item missing | Re-login to refresh `/auth/me`; check `custom_permissions` field on user doc |
| Property scope leak | User doc `property_ids` takes priority over `property_id`; verify room/reservation has matching `property_id` |
| Backend won't start | `MONGO_URL` not set or MongoDB not running; in production, missing `JWT_SECRET_KEY` hard-fails |
| CORS errors in frontend | `CORS_ORIGINS` must list the frontend origin explicitly when `ENVIRONMENT=production` |

## Docs

- `docs/permissions/product-model.md` — roles, modules, scope model
- `docs/permissions/resolution-rfc.md` — permission resolution order
- `docs/architecture-backend-status.md` — modularization phases and status
- `docs/operations/` — DB reset runbook, seeding behavior, data audit

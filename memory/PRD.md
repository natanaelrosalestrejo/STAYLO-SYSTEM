# STAYLO — Multi-Tenant SaaS Hospitality Platform

## Original Problem Statement
Refactor and improve a SaaS hospitality platform "Staylo". Focus on separation between platform-global administration and individual hotel/property management contexts. Preserve all working features and multi-tenant architecture. Refactor, not rebuild.

## Product Requirements

### Branding & Navigation
- ✅ Global login screen: "STAYLO / HOSPITALITY OPERATIONS PLATFORM" branding (no hotel-specific)
- ✅ Platform Admin console: "STAYLO Platform Console" branding
- ✅ Platform Admin: vertical left sidebar replacing horizontal tabs
- ✅ Hotel Admin: distinct sidebar with property-level navigation

### Platform Admin Sidebar Modules (7 sections — no tabs)
- ✅ Resumen (SaaS metrics + tenant list)
- ✅ Tenants
- ✅ Propiedades
- ✅ Permisos
- ✅ Onboarding
- ✅ Usuarios
- ✅ Facturación

### Platform Dashboard Metrics (SaaS-level only)
- ✅ Tenants activos, Propiedades activas, Hoteles activos, Jardines activos
- ✅ MRR estimado, Clientes vencidos, Tenants suspendidos
- ✅ Removed: Usuarios, Habitaciones, Tipos de hab. (property-level metrics)

### Hotel Admin Sidebar
- ✅ "Jardines" (renamed from "Jardines Ops.")
- ✅ "Eventos Hotel" (new — for internal hotel event spaces)
- ✅ "Tipos de Hab." (moved from platform to hotel level)

### Hotel/Garden Spaces — Phase 3
- ✅ "Espacios del Hotel": internal non-room event/meeting spaces (Roof, Palapa, Salón, etc.)
- ✅ "Espacios del Jardín": existing EventGarden.js event_spaces
- ✅ Garden Calendar view: monthly calendar using existing event_bookings
- ✅ HotelEvents.js: manage hotel spaces + hotel event bookings
- ✅ Backend: hotel_spaces collection + CRUD endpoints at /api/hotel-spaces

### Property-Level Management — Phase 4 (partial)
- ✅ Room Types moved to hotel level: /room-types page (admin/manager roles)
- ✅ Image upload from device for room types (base64, preview)
- ✅ Amenities management: allows admin role (not just platform_admin)

### Permissions & Roles (Staff Deletion)
- ✅ Hotel Admin can delete Gerentes and Staff (not themselves, not platform_admin)
- ✅ Gerente can delete Staff only (not other managers, not themselves)
- ✅ Staff cannot delete users
- ✅ Delete button shown in UI based on role hierarchy

### Login Redirection
- ✅ platform_admin → /platform-admin
- ✅ admin/hotel staff → / (hotel dashboard)
- ✅ owner → /corporate

## Tech Stack
- Frontend: React, React Router, TailwindCSS, shadcn/UI, Lucide icons
- Backend: FastAPI, MongoDB (motor), Pydantic v2, JWT auth
- Architecture: Monolithic full-stack, multi-tenant SaaS

## Key Credentials (Development)
- Platform Admin: platform@almasystem.com / platform123
- Hotel Admin: admin@hotel.com / admin123
- Owner: owner@hotel.com / owner123
- Reception: maria@hotel.com / recep123

## DB Schema Key Collections
- tenants: id, name, plan, plan_price, billing_status, next_billing_date, tenant_status, internal_notes
- users: id, role, admin_type, staff_type, name, email, password_hash, property_id, is_active
- properties: id, tenant_id, name, type (hotel|garden), status
- rooms: id, property_id, number, type, floor, status, images
- room_types: id, name, description, base_price, capacity, amenities[], images[], status
- event_spaces: id, property_id, space_name, capacity, status (garden type)
- hotel_spaces: id, property_id, space_name, space_type, capacity, status (hotel type) ← NEW
- event_bookings: id, property_id, event_space_id, client_name, event_date, event_type, total_price, booking_status, payment_status
- reservations: hotel reservations
- tasks, housekeeping, catalog_items, amenities, etc.

## Key API Endpoints

### Platform
- GET/PATCH /api/platform/stats
- GET/POST /api/platform/users
- GET/POST/PATCH/DELETE /api/tenants
- GET/POST/PATCH/DELETE /api/properties

### Hotel Spaces (NEW)
- GET /api/hotel-spaces?property_id=X
- POST /api/hotel-spaces
- PATCH /api/hotel-spaces/{id}
- DELETE /api/hotel-spaces/{id}

### Garden Spaces
- GET/POST /api/event-spaces
- PATCH/DELETE /api/event-spaces/{id} (NEW endpoints added this session)
- GET/POST/DELETE /api/event-bookings

### Users
- GET /api/users, POST /api/users, PUT /api/users/{id}
- DELETE /api/users/{id} — with role hierarchy checks (NEW)

### Room Types
- GET/POST /api/room-types
- PATCH/DELETE /api/room-types/{id}

### Amenities
- GET /api/amenities
- POST /api/amenities — now allows admin role (was platform_admin only)

## Code Architecture
```
/app/
├── backend/
│   └── server.py         # Monolith: ~2000 lines. P0 future: split into routers
├── frontend/src/
│   ├── pages/
│   │   ├── PlatformAdmin.js   # Platform console (sidebar refactored)
│   │   ├── Login.js           # STAYLO branding
│   │   ├── HotelEvents.js     # NEW: hotel spaces + event bookings
│   │   ├── RoomTypes.js       # NEW: hotel-level room type management + image upload
│   │   ├── EventGarden.js     # Garden ops + calendar view (UPDATED)
│   │   ├── Staff.js           # With delete functionality (UPDATED)
│   │   ├── Rooms.js           # Hotel rooms
│   │   └── ... other pages
│   ├── components/
│   │   └── Layout.js          # Context-specific sidebars (UPDATED)
│   ├── contexts/
│   │   ├── AuthContext.js
│   │   └── PropertyContext.js
│   └── App.js                 # Routes: /hotel-events, /room-types added
└── memory/
    └── PRD.md
```

## 3rd Party Integrations
- OpenAI GPT: Configured (Emergent LLM Key), no feature uses it yet
- Stripe (Payments): Test key, used for booking payments
- Resend (Email): Used for reservation confirmations

## What's Been Implemented (Changelog)

### 2026-03-12 (2) — Platform Admin Sidebar Fix + Catalog Dynamic Data
- Platform Admin navigation moved to main left sidebar (7 items: Resumen→/platform-admin, Tenants→/platform-admin/tenants, Propiedades, Permisos, Onboarding, Usuarios, Facturación). URL-driven, no internal sub-sidebar.
- RoomsCatalog.js now reads from /api/room-types dynamically. Removed all static hardcoded room data. Shows room type images, amenities with icons, price from room_types collection. Edit button redirects to /room-types.

### 2026-03-12 — Staylo Platform Refactor (Phases 1-4 + Staff Deletion)
- Phase 1: STAYLO branding on login, Platform Admin vertical sidebar (7 sections, no horizontal tabs, no Tipos de Hab.)
- Phase 2: Platform dashboard SaaS-only metrics (7 cards), removed Propiedades Registradas from Resumen tab, hotel sidebar updated
- Phase 3: HotelEvents.js (hotel spaces + event bookings), EventGarden.js calendar view, hotel_spaces backend collection/CRUD
- Phase 4 partial: RoomTypes.js at hotel level with image upload from device
- Staff deletion: role-based hierarchy in backend + UI

### Earlier (Previous Sessions)
- Multi-tenant architecture with Platform vs Hotel context separation
- "Facturación" module in PlatformAdmin (MRR, tenant plans, billing status)
- TenantModel extended with billing fields
- Tenant suspension logic in get_current_user
- Platform stats endpoint with financial metrics
- Staff management simplified to Gerente/Staff with subtypes
- Delete functionality for tenants and properties

## Prioritized Backlog

### P0 — Critical Technical Debt
- Refactor server.py (2000+ lines) into FastAPI router modules (auth, tenants, properties, rooms, events, staff, billing)

### P1 — Upcoming Features
- Garden Spaces management page (Espacios del Jardín) — currently EventGarden shows spaces inline
- Room-level image upload (not just room types)
- Amenities management at hotel level (currently uses platform amenities)

### P2 — Future Features
- GPT integration feature (configured but unused)
- Real-time notifications via WebSockets
- PWA support
- Advanced reporting and analytics
- Booking confirmation emails (Resend integration)
- Online booking portal for guests (Stripe integration)

# STAYLO — Permissions product model

*(Antes `docs/permissions-architecture.md`; referencia canónica de roles y módulos en producto y código.)*

This document is the single reference for how permissions work in code and product. It aligns with the hybrid model: **Platform Admin > Permisos** = global role templates; **Platform Admin > Usuarios** = per-user overrides; **backend** = source of truth for effective modules.

---

## Roles

| Role | Description | Scope |
|------|-------------|--------|
| `platform_admin` | Platform console: tenants, properties, permisos, onboarding, users, billing | Global (no property/tenant filter) |
| `admin` | Hotel Admin — full operational + corporate views for assigned property/tenant | property_id or tenant_id |
| `owner` | Propietario — strategic/corporate only (dashboard corp., hoteles, jardines, reportes) | property_id or tenant_id |
| `manager` | Gerente — operational + staff + room types; no hotel-level Propiedades | property_id or tenant_id |
| `receptionist` | Recepción — dashboard, reservas, habitaciones, huéspedes, jardines, eventos, inbox, tareas, catálogo | property_id or tenant_id |
| `housekeeping`, `maintenance`, `security`, `restaurant` | Staff — default only Inbox and Tareas | property_id or tenant_id |

**Platform vs hotel roles:** Only `platform_admin` can open `/platform-admin/*`. All other roles are hotel/group roles and are restricted by `property_id` / `tenant_id` for data (rooms, reservations, guests, etc.).

---

## Modules (module keys)

Module keys are used in backend `DEFAULT_ROLE_PERMISSIONS`, `role_permissions.modules`, and user `custom_permissions`. The frontend maps routes to these keys.

| Module key | Route(s) | Description |
|------------|----------|-------------|
| `platform_admin` | /platform-admin, /platform-admin/* | Platform console |
| `dashboard` | / | Dashboard operacional |
| `reservations` | /reservations | Reservas |
| `rooms` | /rooms | Habitaciones |
| `guests` | /guests | Huéspedes |
| `jardines` | /jardines | Jardines (operacional) |
| `hotel-events` | /hotel-events | Eventos Hotel |
| `inbox` | /inbox | Inbox |
| `tasks` | /tasks | Tareas |
| `catalog` | /catalogo | Catálogo |
| `reports` | /reports | Reportes |
| `staff` | /staff | Personal |
| `room-types` | /room-types | Tipos de Hab. |
| `properties` | /properties | Propiedades (hotel) |
| `corporate` | /corporate | Dashboard Corporativo |
| `hotels` | /hotels | Vista Hoteles |
| `event-gardens` | /event-gardens | Vista Jardines |

Public routes (no module check): `/reservar`, `/mi-reserva`, `/catalogo` (catalog can be shown in sidebar by module; route may allow any authenticated user depending on product choice).

---

## Effective permissions logic

1. **Backend** (login and GET /auth/me):
   - Merge role permissions: `merged = DEFAULT_ROLE_PERMISSIONS` + overrides from `db.role_permissions`.
   - If user has `custom_permissions` non-null and non-empty → **effective modules = custom_permissions**.
   - Else → **effective modules = merged[user.role]** (or [] if role not in merged).
   - Response includes `user` (or current user) with a **modules** array = effective modules.

2. **Frontend** (sidebar and route access):
   - **Sidebar:** Show a nav item only if (a) the item’s `roles` include `user.role`, and (b) when `user.modules` exists and is non-empty, the item’s module key is in `user.modules`.
   - **Route access:** User may open a route only if (a) role is in the route’s `allowedRoles` (if defined), and (b) when the route has a module and `user.modules` exists and is non-empty, that module is in `user.modules`.

So: **role** gates “which set of routes is even candidate”; **modules** (from backend) gate “which of those the user is allowed to see and open.” Custom per-user permissions override the role template.

---

## Role vs custom_permissions precedence

- **custom_permissions** on the user document: when set (non-null and length > 0), they **replace** the role’s module list entirely for that user.
- When **custom_permissions** is null or empty, the user gets the **role template** (DEFAULT_ROLE_PERMISSIONS merged with db.role_permissions for that role).

---

## Tenant / property scope

- **Backend:** For non–platform_admin users, `_allowed_property_ids(current_user)` returns:
  - `[current_user.property_id]` if `property_id` is set;
  - else all property ids for `current_user.tenant_id` if `tenant_id` is set;
  - else `[]`.
- **Platform admin:** `_allowed_property_ids` returns `None` → no filter (global visibility).
- **Data:** Rooms, reservations, guests lists (and related APIs) are filtered by these property ids. Tenant suspension is enforced at auth (403 if tenant suspended).

Scope is **independent** of modules: a user may have the “reservations” module but only see reservations for their property/tenant.

---

## Module matrix by role (defaults)

| Module | platform_admin | admin | owner | manager | receptionist | housekeeping | maintenance | security | restaurant |
|--------|----------------|-------|-------|---------|--------------|--------------|-------------|----------|------------|
| platform_admin | ✓ | — | — | — | — | — | — | — | — |
| dashboard | — | ✓ | — | ✓ | ✓ | — | — | — | — |
| reservations | — | ✓ | — | ✓ | ✓ | — | — | — | — |
| rooms | — | ✓ | — | ✓ | ✓ | — | — | — | — |
| guests | — | ✓ | — | ✓ | ✓ | — | — | — | — |
| jardines | — | ✓ | — | ✓ | ✓ | — | — | — | — |
| hotel-events | — | ✓ | — | ✓ | ✓ | — | — | — | — |
| inbox | — | ✓ | — | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| tasks | — | ✓ | — | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| catalog | — | ✓ | — | ✓ | ✓ | — | — | — | — |
| reports | — | ✓ | ✓ | ✓ | — | — | — | — | — |
| staff | — | ✓ | — | ✓ | — | — | — | — | — |
| room-types | — | ✓ | — | ✓ | — | — | — | — | — |
| properties | — | ✓ | — | — | — | — | — | — | — |
| corporate | — | ✓ | ✓ | — | — | — | — | — | — |
| hotels | — | ✓ | ✓ | — | — | — | — | — | — |
| event-gardens | — | ✓ | ✓ | — | — | — | — | — | — |

---

## Source of truth

| Concept | Source of truth |
|--------|------------------|
| Role default modules | Code: `DEFAULT_ROLE_PERMISSIONS` (backend). Overrides: MongoDB `role_permissions`. Editable in Platform Admin > Permisos. |
| Per-user module override | User document field `custom_permissions`. Editable in Platform Admin > Usuarios (and hotel admin/manager when creating/editing users). |
| Effective modules for a user | Computed at request time: custom_permissions if set, else merged role template. Returned in login response and GET /auth/me as `modules`. |
| Tenant/property assignment | User document: `tenant_id`, `property_id`. Usuarios UI. |
| Sidebar visibility | Frontend uses `user.modules` + nav config (route → module, roles). Same as route access. |
| Route access | Frontend: allowedRoles + module check using `user.modules` and central route–module map. |
| API authorization | Backend: require_role(...) and _allowed_property_ids. No module check; role + scope only. |

---

## Recommended hybrid model (current)

- **Permisos:** Global role templates. Define default modules per role. Changes apply to all users with that role (after next login/refresh) unless they have custom_permissions.
- **Usuarios:** Assign role, tenant_id, property_id; optionally set custom_permissions to override the role’s default modules for that user.
- **Backend:** Remains source of truth for effective modules; /auth/me and login return `modules`. Backend API continues to authorize by role + scope only.
- **Frontend:** Single central config for path ↔ module and for “can user access path?”. Sidebar and ProtectedRoute both use it so that hidden modules cannot be opened by URL.

---

## Implementation notes (frontend)

- **Central module config:** `frontend/src/utils/permissions.js` exports `ROUTE_MODULE_MAP`, `getModuleForPath`, `canAccessRoute`, and `getDefaultPathForRole`. Layout and ProtectedRoute use these so sidebar visibility and route access share the same logic.
- **ProtectedRoute:** Uses `canAccessRoute(user, location.pathname, allowedRoles)`. Access is denied if the user's role is not in `allowedRoles` (when defined) or if the route has a module and `user.modules` is set but does not include that module. Redirect uses `getDefaultPathForRole(user.role)`.
- **Manager:** Route guards in App.js include `manager` for `/`, `/reservations`, `/rooms`, `/guests`, `/reports`, and `/staff` so they match backend default modules and sidebar.
- **Verification:** After hiding a module for Hotel Admin in Permisos, log in as that admin: the module disappears from the sidebar and direct URL access redirects to the default path.

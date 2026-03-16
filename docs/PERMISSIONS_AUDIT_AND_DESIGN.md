# STAYLO — Permissions System: Functional Audit and Design Review

**Purpose:** Clarify how permissions work today, where the source of truth is, and recommend a clean product design before changing the UI.  
**Scope:** Analysis and design only — no code or UI changes.

---

## A) Current-State Explanation (Plain Language)

### What Platform Admin can do
- **Who:** Users with role `platform_admin` (and optionally `admin_type`: platform_support, billing_admin, technical_admin, hotel_admin). Only they can open `/platform-admin/*`.
- **Capabilities:**
  - **Tenants:** Create, edit, delete tenants (multi-tenant grouping).
  - **Propiedades:** See all properties across tenants.
  - **Permisos:** Edit which **modules** each **role** can see (admin, owner, receptionist, housekeeping, maintenance, security, restaurant). Changes are stored in MongoDB `role_permissions` and apply to every user with that role (after next login or refresh).
  - **Onboarding:** Create new properties (hotels or event gardens) with rooms/spaces and initial users.
  - **Usuarios:** Create/edit platform_admin, hotel admin, owner, manager, and assign tenant_id / property_id. Set **custom_permissions** per user (overrides role-based modules for that user).
  - **Facturación:** Billing-related view (content may be placeholder).
- **Data scope:** No tenant or property filter — sees all data (backend returns `_allowed_property_ids = None` for platform_admin).

### What Hotel Admin can do
- **Who:** Users with role `admin` (often labeled “Hotel Admin” in the UI). Usually have `property_id` set to one hotel.
- **Capabilities:**
  - Full operational access to **one property** (or more if assigned by tenant): dashboard, reservations, rooms, guests, jardines (event spaces), inbox, tasks, catalog, reports, staff, properties (hotel-level).
  - Access to **Corporate Dashboard** and **Vista Hoteles / Vista Jardines** (same routes as owner) so they can see group-level views.
  - Create/edit/delete users with roles: manager, receptionist, housekeeping, maintenance, security, restaurant (not owner or platform_admin).
  - Create properties (with `require_role("admin", "platform_admin")`).
  - Delete rooms; manage event spaces and hotel spaces; manage features toggles.
- **Data scope:** Backend limits lists (rooms, reservations, guests, etc.) to `property_id` (or all properties of their `tenant_id` if set and no `property_id`).

### What Owner can do
- **Who:** Users with role `owner` (Propietario). Often have `property_id` or `tenant_id` for the group.
- **Capabilities:**
  - **Strategic/corporate only:** Corporate Dashboard, Vista Hoteles, Vista Jardines (event-gardens), Reportes. No day-to-day operational modules (no reservations, rooms, guests, inbox, tasks) unless given by custom_permissions.
  - Cannot create other owners or platform_admins; cannot delete rooms; cannot access Platform Admin console.
- **Data scope:** Same as hotel admin — property_id or tenant_id drives backend scope. Corporate dashboard aggregates across properties they can see.

### What Receptionist can do
- **Who:** Users with role `receptionist`.
- **Capabilities:**
  - Operational: Dashboard, Reservas, Habitaciones, Huéspedes, Jardines, Eventos Hotel, Inbox, Tareas, Catálogo. No Reportes (in default role permissions), no Personal, no Propiedades, no Tipos de Hab.
  - Check-in / check-out, toggle VIP, export CSV (backend allows receptionist for export).
- **Data scope:** Same property/tenant scope as other hotel roles.

### What each staff subtype can do
- **Housekeeping, Maintenance, Security, Restaurant:** Same pattern. Default modules are **only Inbox and Tareas**. No dashboard, reservations, rooms, guests, or reports unless custom_permissions add them.
- **Data scope:** Same property/tenant logic; in practice they only see tasks and messages relevant to their scope.

### What Manager can do (if that role exists)
- **Who:** Users with role `manager` (Gerente).
- **Capabilities (from backend defaults):** Dashboard, Reservas, Habitaciones, Huéspedes, Jardines, Eventos Hotel, Inbox, Tareas, Catálogo, Reportes, Personal, Tipos de Hab. **No Propiedades** (no `/properties` in default). Can create staff and other managers (backend logic).
- **Important:** In **Platform Admin > Permisos**, the **manager** role is **not** in the editable list (`ROLES_EDITABLE`). So Platform Admin cannot change manager’s modules from the UI; only admin, owner, receptionist, housekeeping, maintenance, security, restaurant are editable there. Manager’s modules come only from `DEFAULT_ROLE_PERMISSIONS` in code (or DB if someone calls the API).

### How platform roles differ from hotel roles
- **Platform role:** `platform_admin`. No property/tenant scope; global visibility; only role that can open Platform Admin and manage tenants, role permissions, onboarding, and platform users.
- **Hotel/group roles:** `admin`, `owner`, `manager`, `receptionist`, `housekeeping`, `maintenance`, `security`, `restaurant`. They have **property_id** and/or **tenant_id** and see only data for those. Their “menu” is a mix of operational (dashboard, reservations, etc.) and/or strategic (corporate, hotels, event-gardens, reports) depending on role. Permisos (and custom_permissions) control which **modules** they see in the sidebar; backend **require_role** and **_allowed_property_ids** control which APIs they can call and which data they get.

---

## B) Current Module Matrix (Visibility / Allowed)

Default behaviour: **sidebar** shows an item only if (1) the route’s `roles` include the user’s role, and (2) the user’s **effective modules** (from backend: custom_permissions or merged role_permissions) include that module key. **Route guard** in App.js uses only **role** (`allowedRoles`), not modules.

Legend: **✓** = in default modules for that role and in Layout roles for that route (so visible in sidebar); **—** = not in default modules or not in route roles; **R** = route allows this role but default modules may not (or vice versa), so possible mismatch.

| Module (sidebar label)        | platform_admin | admin (Hotel Admin) | owner | manager | receptionist | housekeeping | maintenance | security | restaurant |
|------------------------------|----------------|---------------------|-------|---------|---------------|--------------|-------------|----------|------------|
| Resumen (platform)           | ✓              | —                   | —     | —       | —             | —            | —           | —        | —          |
| Tenants                      | ✓              | —                   | —     | —       | —             | —            | —           | —        | —          |
| Propiedades (platform)       | ✓              | —                   | —     | —       | —             | —            | —           | —        | —          |
| Permisos                     | ✓              | —                   | —     | —       | —             | —            | —           | —        | —          |
| Onboarding                   | ✓              | —                   | —     | —       | —             | —            | —           | —        | —          |
| Usuarios (platform)          | ✓              | —                   | —     | —       | —             | —            | —           | —        | —          |
| Facturación                  | ✓              | —                   | —     | —       | —             | —            | —           | —        | —          |
| Dashboard Operacional        | —              | ✓                   | —     | ✓       | ✓             | —            | —           | —        | —          |
| Reservas                     | —              | ✓                   | —     | ✓       | ✓             | —            | —           | —        | —          |
| Habitaciones                 | —              | ✓                   | —     | ✓       | ✓             | —            | —           | —        | —          |
| Huéspedes                    | —              | ✓                   | —     | ✓       | ✓             | —            | —           | —        | —          |
| Jardines (operacional)       | —              | ✓                   | —     | ✓       | ✓             | —            | —           | —        | —          |
| Eventos Hotel                | —              | ✓                   | —     | ✓       | ✓             | —            | —           | —        | —          |
| Inbox                        | —              | ✓                   | —     | ✓       | ✓             | ✓            | ✓           | ✓        | ✓          |
| Tareas                       | —              | ✓                   | —     | ✓       | ✓             | ✓            | ✓           | ✓        | ✓          |
| Catálogo Público             | —              | ✓                   | —     | ✓       | ✓             | —            | —           | —        | —          |
| Reportes                     | —              | ✓                   | —     | ✓       | —             | —            | —           | —        | —          |
| Personal                     | —              | ✓                   | —     | ✓       | —             | —            | —           | —        | —          |
| Tipos de Hab.                | —              | ✓                   | —     | ✓       | —             | —            | —           | —        | —          |
| Propiedades (hotel)          | —              | ✓                   | —     | —       | —             | —            | —           | —        | —          |
| Dashboard Corporativo        | —              | ✓                   | ✓     | —       | —             | —            | —           | —        | —          |
| Vista Hoteles                | —              | ✓                   | ✓     | —       | —             | —            | —           | —        | —          |
| Vista Jardines               | —              | ✓                   | ✓     | —       | —             | —            | —           | —        | —          |

Notes:
- **Manager:** Default modules include dashboard, reservations, rooms, guests, jardines, hotel-events, inbox, tasks, catalog, reports, staff, room-types (no properties). But in **App.js**, `/` (Dashboard), `/reservations`, `/rooms`, `/guests` use `allowedRoles={['admin','receptionist']}` **only** — manager is not in the list. So manager sees those items in the sidebar (from modules) but is **redirected** when opening them. Only `/jardines`, `/hotel-events`, `/room-types`, `/inbox`, `/tasks`, `/reports` include `manager` in allowedRoles. So manager’s **effective** access is inconsistent: sidebar suggests more than routes allow.
- **Reports:** Layout shows reports for admin, owner, manager; App.js allows only admin and owner. So manager sees “Reportes” in sidebar but cannot open the page.
- **Catalog:** Route has no `allowedRoles` (any logged-in user can open). So visibility is only from sidebar modules.

---

## C) Source-of-Truth Model

### When role permissions apply
- **Stored:** Default list per role in code (`DEFAULT_ROLE_PERMISSIONS` in `models/schemas.py`). Overrides per role in MongoDB collection `role_permissions` (documents: `role`, `modules`, `updated_at`).
- **Used:** On **login** and **GET /auth/me**, the backend merges defaults + DB into a single map, then for the current user returns **effective modules**: either `custom_permissions` (if non-empty) or `merged[user.role]`.
- **Who can change:** Only **platform_admin** can call `PUT /api/role-permissions/{role}`. Hotel admin can call `GET /api/role-permissions` (read-only for UI display). So the **source of truth for “what modules does role X have”** is: **code defaults + `role_permissions` collection**, editable only from Platform Admin > Permisos.

### When custom user permissions override role permissions
- **Stored:** On the **user** document: `custom_permissions` (array of module keys, or null/empty).
- **Used:** In `_effective_modules_for_user`: if `custom_permissions` is not null and has at least one element, that list is returned as **modules**; otherwise the merged role list for `user.role` is used.
- **Who can set:** Platform Admin (and hotel admin/manager when creating or editing users, depending on backend rules) can set `custom_permissions` in the user form. So the **source of truth for “what modules does this specific user have”** is: **user.custom_permissions** when set; otherwise the role’s modules.

### Whether /auth/me returns effective modules
- **Yes.** The response includes a **modules** field: the effective list of module keys (either custom_permissions or the merged role_permissions for the user’s role). The frontend stores this (and refreshes it on load via /auth/me) and uses it for sidebar visibility.

### How the sidebar decides what to show
1. **Step 1:** Take all `navItems` whose `roles` array includes the current user’s **role** (`roleFiltered`).
2. **Step 2:** If the user has a non-empty **modules** array (from backend), filter `roleFiltered` so that only items whose `PATH_TO_MODULE[n.to]` is in **modules** remain. If **modules** is empty or missing, show all of `roleFiltered`.
- So the **source of truth for sidebar visibility** is: **backend** (effective modules from login/auth/me). The frontend does not hardcode which role sees which module; it only hardcodes the **route–module** mapping (`PATH_TO_MODULE`) and the **roles** that are *candidates* for each route (navItems). The final visibility is **backend modules × role candidate set**.

### Whether backend authorization matches frontend visibility
- **Not fully.** Backend authorization is **role + scope**:
  - **Role:** Many endpoints use `require_role("admin", "receptionist", ...)` — so a fixed set of roles can call that endpoint. There is **no** backend check like “user must have module X”.
  - **Scope:** For data (rooms, reservations, guests), backend uses `_allowed_property_ids(current_user)` and filters or raises 404. So visibility is by property/tenant, not by “module”.
- **Gaps:**
  - If Platform Admin removes “Jardines” from admin’s modules, the admin no longer sees the Jardines link in the sidebar, but if they open `/jardines` directly, **App.js** only checks `allowedRoles` (admin is allowed), so they can still see the page. Backend also allows admin to call event-spaces APIs. So **hiding a module only hides the link**, it does not enforce access.
  - **Route guards** in App.js use **role only** (allowedRoles), not **modules**. So any alignment between “what the sidebar shows” and “what the user can open” is by convention (same roles that get a module also in allowedRoles), not by a single “effective permissions” check.

---

## D) Design Recommendation (Options)

### Option 1: Keep “Permisos” in sidebar as global role-permission management, and keep per-user overrides inside Usuarios
- **Idea:** Permisos = templates per role (applied to everyone with that role). Usuarios = optional custom_permissions per user that override the role template.
- **Pros:** Clear separation: “what does the role get by default” vs “exceptions per user”. Platform Admin can tune roles once and only touch Usuarios for exceptions. Fits current backend and current UX.
- **Cons:** Two places to look (Permisos and Usuarios). Confusion when a user has custom_permissions: “is this coming from role or from my user?”. Manager (and possibly others) not editable in Permisos UI today.
- **Risk of admin mistakes:** Accidentally changing a role in Permisos affects all users of that role; easy to forget that a specific user has custom overrides.
- **Scalability for multi-tenant SaaS:** Good: one set of role templates, tenant admins don’t touch Permisos (only platform does). Per-tenant customization would require either more roles or more use of custom_permissions.
- **Ease for non-technical operators:** Medium. They must understand “role = default menu”, “user = optional override”.

### Option 2: Remove “Permisos” from sidebar and manage only user-level permissions inside Usuarios
- **Idea:** No global role-permission UI. Every user’s modules are set explicitly on the user (e.g. checkboxes in Usuarios). Role becomes a label + backend auth (require_role), but sidebar visibility is 100% from that user’s permission list.
- **Pros:** Single place: only Usuarios. No “template vs override” mental model. Very explicit per user.
- **Cons:** Onboarding new users requires selecting every module (or copying from another user). Bulk changes (“all receptionists lose Jardines”) require editing many users. Defaults would have to live in code or in “new user template” per role.
- **Risk of admin mistakes:** High: forgetting to assign a module to a new user, or inconsistent assignment across users of the same role.
- **Scalability:** Poor for many users; good only if user count is small.
- **Ease for non-technical operators:** Simple to understand (“this person has these checkboxes”) but tedious to maintain.

### Option 3: Hybrid with clear separation — global role templates in Permisos, user overrides in Usuarios, tenant/property in Usuarios
- **Idea:** Keep current model but make the separation explicit in UX and docs. Permisos = “Default modules per role (used for every user of that role unless overridden).” Usuarios = “User: role, tenant, property, and optional custom modules (override).” Same backend; clearer copy and flows.
- **Pros:** Keeps one source of truth for “role default” (Permisos + DB) and one for “user override” (user.custom_permissions). Tenant/property assignment stays in Usuarios. Aligns with current implementation.
- **Cons:** Still two places; manager (and platform_admin) should be added to Permisos UI if they are to be configurable.
- **Risk of admin mistakes:** Same as Option 1, but reduced if UI clearly states “Role defaults” vs “User overrides” and shows effective result in Usuarios (e.g. “Uses role default” vs “Custom”).
- **Scalability:** Same as Option 1; good for SaaS. Optional: later allow “tenant-level role overrides” (e.g. role “receptionist” for tenant A has different modules than default) without touching every user.
- **Ease for non-technical operators:** Best if UI text and flows explain “we set the default for Recepcionista here; in Usuarios you can give one person more or less.”

---

## E) Final Recommendation for STAYLO

**Recommendation: Option 3 (Hybrid) with small, explicit improvements.**

**Why Option 3 for this project:**
1. You already have role-based defaults (DEFAULT_ROLE_PERMISSIONS + role_permissions) and per-user overrides (custom_permissions), and auth/me returns effective modules. The **model** is right; the main issues are **clarity** and **consistency** (e.g. manager in Permisos, route guards vs modules).
2. Option 1 is the same model but without making the “template vs override” distinction clear in the product; Option 2 would force every user to be configured by hand, which does not scale for hotels with many staff.
3. STAYLO is multi-tenant SaaS: different tenants may want the same role name (e.g. “receptionist”) to have different default modules later. Keeping Permisos as the place for “global role template” allows a future tenant-level override layer without redesigning the whole system.

**Concrete next steps (implementation plan, no code in this doc):**
1. **Align route protection with modules (optional but recommended):** Either (a) have ProtectedRoute also check that the current route’s module is in `user.modules`, or (b) document that “sidebar = UX only; URL access = role only” and accept that hiding a module only hides the link. Prefer (a) so that “no module” implies “no page access”.
2. **Fix inconsistencies:** Add **manager** (and optionally **platform_admin**) to the Permisos tab’s editable roles so that all roles that have default modules can be tuned from the UI. Align App.js `allowedRoles` with the roles that actually have that module in defaults (e.g. manager + Dashboard, Reservations, Rooms, Guests; and Reports for manager).
3. **Clarify in UI:** In Permisos: short line of copy, e.g. “These are the default modules for each role. Users get these unless you set custom permissions in Usuarios.” In Usuarios (edit user): show “Using role default” vs “Custom permissions” and list effective modules when custom is set.
4. **Single source of truth in docs:** Document that “effective modules = custom_permissions if set, else role_permissions (merged with defaults). Sidebar and (if implemented) route guard use effective modules; backend API continues to use role + scope.”
5. **Keep tenant/property in Usuarios:** No change; assignment of user to tenant and property stays in the user form. Scope (what data they see) remains driven by property_id/tenant_id in backend.

This keeps the backend as the single source of truth for effective permissions, keeps the UI predictable for operators, and leaves a clear path for future tenant-specific role templates if needed.

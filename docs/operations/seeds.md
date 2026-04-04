> **Nota:** Este documento vive en `docs/operations/seeds.md` (antes `backend/SEED_ANALYSIS.md`). La lógica de seed en código puede estar en `backend/seeds/run.py` y arranque en `server.py`.

---

# Backend seed logic — analysis

This document explains exactly how the local database gets its baseline data (Alma Hospitality Group, Alma Hotel Boutique, Jardín de Amargati, demo users, tasks, room types, amenities, permissions) and what is **not** seeded.

---

## 1. Collections populated automatically on startup

Startup runs exactly **seven** seed functions in a fixed order. Each function only inserts data when a **guard condition** is true (usually “collection is empty” or “role is missing”).

| Collection(s)        | Populated by    | When it runs |
|---------------------|-----------------|--------------|
| `users`             | seed_data       | Only when `users.count_documents({}) == 0` |
| `rooms`             | seed_data       | Same run as above (only when no users exist) |
| `guests`            | seed_data       | Same run |
| `reservations`      | seed_data       | Same run |
| `tasks`             | seed_data       | Same run |
| `messages`          | seed_data       | Same run |
| `properties`        | seed_properties | Only when `properties.count_documents({}) == 0` |
| `event_spaces`      | seed_properties | Same run as properties (only when no properties) |
| `event_bookings`    | seed_properties | Same run (3 sample event bookings) |
| `users` (extra)     | seed_owner      | Only when no user has `role == "owner"` |
| `users` (extra)     | seed_platform_admin | Only when no user has `role == "platform_admin"` |
| `tenants`           | seed_tenants    | Only when `tenants.count_documents({}) == 0` |
| `properties` (link) | seed_tenants    | After creating tenant: `update_many` sets `tenant_id` on all properties that had `tenant_id` None |
| `room_types`        | seed_room_types | Only when `room_types.count_documents({}) == 0` |
| `amenities`         | seed_amenities  | Only when `amenities.count_documents({}) == 0` |

No other collections are written by any seed. In particular:

- **`role_permissions`** — never seeded (API uses in-code `DEFAULT_ROLE_PERMISSIONS` and optionally DB overrides).
- **`pending_bookings`** — never seeded (runtime only, Stripe/booking flow).
- **`payment_transactions`** — never seeded (runtime only).
- **`hotel_spaces`** — never seeded (only `event_spaces` for the garden are seeded).

---

## 2. Seed functions that run on startup

From `@app.on_event("startup")` in `server.py`:

```python
async def startup():
    await seed_data()
    await seed_properties()
    await seed_owner()
    await seed_platform_admin()
    await seed_tenants()
    await seed_room_types()
    await seed_amenities()
```

Order is fixed and matters: e.g. `seed_tenants` assigns the new tenant to existing properties, so it must run after `seed_properties`.

---

## 3. What each seed function creates

### seed_data()

- **Guard:** `if await db.users.count_documents({}) > 0: return`  
  If **any** user exists, the whole function exits and **nothing** below is created.

- **Creates (in one run):**
  - **6 users:** Admin Hotel (admin@hotel.com, admin123), María García (maria@hotel.com, recep123), Carlos López (carlos@hotel.com, house123), Ana Martínez (ana@hotel.com, maint123), Director General (owner@hotel.com, owner123), Platform Admin (platform@almasystem.com, platform123).  
  Roles: admin, receptionist, housekeeping, maintenance, owner, platform_admin.  
  None of these users get `property_id` or `tenant_id` in the seed.
  - **40 rooms:** numbers "1"–"40", floors 1–4, types double/junior_suite, prices 1500/2500. No `property_id` set (model has no such field in seed path).
  - **4 guests:** Juan Pérez, Sophie Martin, James Wilson, Isabella Ferrari.
  - **4 reservations:** linked to those guests and some of the rooms; `property_id` is the model default `"alma_hotel"` (string, not the UUID of the seeded hotel property).
  - **3 tasks:** e.g. “Limpiar habitación 305”, “Revisar AC habitación 204”, “Preparar bienvenida VIP suite 104”.
  - **3 messages:** staff-to-staff and staff-to-guest sample threads.

### seed_properties()

- **Guard:** `if await db.properties.count_documents({}) > 0: return`

- **Creates:**
  - **2 properties:**  
    - **Alma Hotel Boutique** — type `hotel`, status active.  
    - **Jardín de Amargati** — type `event_garden`, status active.  
  - **3 event_spaces** (all for Jardín de Amargati): Jardín Principal, Salón de Eventos, Terraza VIP.  
  - **3 event_bookings:** sample wedding, corporate, birthday (Familia Rodríguez, Innovatec S.A., Lucía Fernández).

### seed_owner()

- **Guard:** `if await db.users.count_documents({"role": "owner"}) > 0: return`

- **Creates:** One user with role `owner` (Director General, owner@hotel.com, owner123) **only if** there is no owner yet.  
  On a **fresh** DB, `seed_data` already inserted an owner, so this typically does nothing.

### seed_platform_admin()

- **Guard:** `if await db.users.count_documents({"role": "platform_admin"}) > 0: return`

- **Creates:** One platform_admin user **only if** none exists. On a fresh DB, `seed_data` already inserted one, so this typically does nothing.

### seed_tenants()

- **Guard:** `if await db.tenants.count_documents({}) > 0: return`

- **Creates:**
  - **1 tenant:** **Alma Hospitality Group** (plan enterprise, status active, contact_email admin@almahotel.com).  
  - Then: `db.properties.update_many({"tenant_id": None}, {"$set": {"tenant_id": tenant.id}})` so **Alma Hotel Boutique** and **Jardín de Amargati** get this tenant’s id.

### seed_room_types()

- **Guard:** `if await db.room_types.count_documents({}) > 0: return`

- **Creates:** 4 room types: Estándar, Deluxe, Junior Suite, Suite Master (with base_price, capacity, amenities, status active). No `property_id` in seed.

### seed_amenities()

- **Guard:** `if await db.amenities.count_documents({}) > 0: return`

- **Creates:** ~20 amenities (WiFi, Smart TV, Aire Acondicionado, Baño Privado, Jacuzzi, Minibar, Balcón, etc.) with category and icon.

---

## 4. Records that are guaranteed baseline/demo data

On a **completely empty** database, after the first startup you are guaranteed:

- **Tenant:** Alma Hospitality Group (1).
- **Properties:** Alma Hotel Boutique (hotel), Jardín de Amargati (event_garden) (2).
- **Users:** 6 demo users (admin, receptionist, housekeeping, maintenance, owner, platform_admin) with the known emails/passwords from PRD.
- **Rooms:** 40 rooms (1–40).
- **Guests:** 4 demo guests.
- **Reservations:** 4 demo reservations (property_id default `"alma_hotel"`).
- **Tasks:** 3 demo tasks.
- **Messages:** 3 demo messages.
- **Event spaces:** 3 (Jardín Principal, Salón de Eventos, Terraza VIP).
- **Event bookings:** 3 sample event bookings.
- **Room types:** 4 (Estándar, Deluxe, Junior Suite, Suite Master).
- **Amenities:** ~20 catalog entries.

“Permissions” in the UI come from **code**: `DEFAULT_ROLE_PERMISSIONS` in `server.py`. The `role_permissions` collection is **not** seeded; the API merges that constant with optional DB overrides. So the baseline permissions are guaranteed by code, not by seed.

---

## 5. Are Alma Hotel Boutique and Jardín de Amargati recreated if deleted?

**No**, not unless the **entire** collection is empty.

- **seed_properties** runs only when `properties.count_documents({}) == 0`.
- If you delete one or both properties but **leave any other property** in the DB, the count is still > 0 and `seed_properties` does nothing — so **Alma Hotel Boutique** and **Jardín de Amargati** are **not** re-created.
- If you delete **all** properties, then on the **next** startup `seed_properties` runs and creates again **only** those two (Alma Hotel Boutique and Jardín de Amargati) plus the 3 event_spaces and 3 event_bookings.

Same idea for **Alma Hospitality Group**:

- **seed_tenants** runs only when `tenants.count_documents({}) == 0`.
- Delete “Alma Hospitality Group” but leave another tenant → it is **not** re-created.
- Delete **all** tenants → next startup creates one tenant again (Alma Hospitality Group) and re-assigns `tenant_id` on all properties that have `tenant_id` None.

So: nothing is “re-created on every startup”. Seeds only run when the corresponding collection (or role) is empty/missing.

---

## 6. Seed vs persisted: where does the data in the app come from?

- **First run (empty DB):** All of the data listed in section 4 comes **from the seed logic**. What you see in the app (Alma Hospitality Group, Alma Hotel Boutique, Jardín de Amargati, demo users, tasks, room types, amenities, and the default permissions from code) is exactly that seeded baseline.
- **Later runs (DB already has data):** The app shows **whatever is in the database**. The seeds do not run again for those collections that already have documents (or already have an owner/platform_admin). So the same data is **persisted**; it is not re-seeded each time unless you clear the relevant collection or roles.

So: **tenants, properties, users, rooms, guests, reservations, tasks, messages, event_spaces, event_bookings, room_types, amenities** that you see in the current local app are either (a) from the first seed run, or (b) from later creates/edits; they are not “re-seeded” on each startup once the guards are false.

---

## 7. What is NOT seeded and is lost when switching to a new MongoDB

When you point the app at a **new** MongoDB (empty database), seeds run again and you get the baseline above. You **lose** everything that was only in the old DB and is **not** recreated by any seed:

- **role_permissions** — Any stored overrides (custom per-role permissions) are gone. The app still works with the in-code `DEFAULT_ROLE_PERMISSIONS` only.
- **pending_bookings** — Any pending public bookings (pre-checkout) are lost; no seed for this collection.
- **payment_transactions** — Any Stripe session/transaction records are lost; no seed.
- **hotel_spaces** — No seed exists for `hotel_spaces`; only `event_spaces` (garden) are seeded. Any hotel spaces you had are lost.
- **Custom/extra data** — Any additional tenants, properties, users, rooms, guests, reservations, tasks, messages, event_bookings, room types, or amenities that were created after the initial seed are lost; seeds do not recreate “deleted” or “extra” records unless the whole collection (or role) is empty.

So after switching to a new DB you get a **clean baseline** (tenant, two properties, 6 users, 40 rooms, 4 guests, 4 reservations, 3 tasks, 3 messages, 3 event spaces, 3 event bookings, 4 room types, ~20 amenities, and code-based permissions). Everything else that existed only in the old DB must be recreated manually or by normal app usage.

---

## Summary

### Seeded baseline data (guaranteed on first run on empty DB)

- **Tenant:** Alma Hospitality Group (and properties linked to it).
- **Properties:** Alma Hotel Boutique, Jardín de Amargati (plus 3 event_spaces and 3 event_bookings for the garden).
- **Users:** 6 demo users (admin, receptionist, housekeeping, maintenance, owner, platform_admin).
- **Rooms:** 40 (no property_id in seed).
- **Guests:** 4 demo guests.
- **Reservations:** 4 demo reservations.
- **Tasks:** 3 demo tasks.
- **Messages:** 3 demo messages.
- **Room types:** 4 (Estándar, Deluxe, Junior Suite, Suite Master).
- **Amenities:** ~20 catalog entries.
- **Permissions:** Baseline is in-code `DEFAULT_ROLE_PERMISSIONS`; no seed for `role_permissions`.

### Non-seeded data (must be recreated manually or at runtime)

- **role_permissions** — Stored overrides (optional); default comes from code.
- **pending_bookings** — Created only by the public booking flow.
- **payment_transactions** — Created only by Stripe checkout/webhook.
- **hotel_spaces** — No seed; must be created via API if needed.
- Any **extra** tenants, properties, users, rooms, guests, reservations, tasks, messages, event_bookings, room types, or amenities beyond the seeded set.

### Data that is protected or re-created automatically

- **Nothing is re-created on every startup.** Seeds run only when the corresponding collection is empty (or, for owner/platform_admin, when that role is missing).
- If you **delete** Alma Hotel Boutique or Jardín de Amargati but **keep at least one other property**, they are **not** re-created.
- If you **delete all properties**, the **next** startup runs `seed_properties` and recreates only those two properties plus the 3 event_spaces and 3 event_bookings.
- Same idea for **tenants**: re-creation only if **all** tenants are deleted; then one tenant (Alma Hospitality Group) is created and properties with `tenant_id` None are linked to it.

So: the seed logic provides a **one-time baseline** on an empty DB and does **not** “restore” individual deleted records; it only fills empty collections (or missing roles) once.

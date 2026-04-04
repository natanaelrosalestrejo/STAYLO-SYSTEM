# Plan de reset limpio y controlado — base `staylo` solamente

**Alcance:** MongoDB database name `staylo` (config `DB_NAME`). **No** tocar otros databases del cluster (`hotel_system`, `admin`, `local`, `sample_mflix`, etc.).

**Objetivo:** Demo estable y pequeña para desarrollo y pruebas: 1 `platform_admin`, 1 tenant demo, 1 hotel (Alma Hotel Boutique, 40 habitaciones), 2 jardines (Jardín Margati, Jardín Alma), datos mínimos coherentes.

**No incluye:** módulo financiero, rediseño de producto, ejecución automática de borrados (este documento es plan y referencia).

---

## A. Estrategia de reset seguro

### 1. Colecciones que conviene **vaciar por completo** (en `staylo`)

| Colección | Motivo |
|-----------|--------|
| `users` | Sustituir por el set demo acotado; evitar usuarios huérfanos o con `tenant_id`/`property_id` rotos. |
| `rooms` | Eliminar inventario masivo (p. ej. 250 habitaciones) y recrear exactamente 40. |
| `guests` | Empezar con 4–6 huéspedes demo coherentes. |
| `reservations` | Eliminar reservas masivas o inconsistentes; recrear 3–5 de ejemplo con fechas actuales. |
| `properties` | Sustituir por exactamente 3 propiedades (1 hotel + 2 jardines) con IDs estables. |
| `tenants` | Un solo tenant demo (o vaciar y uno nuevo). |
| `event_spaces` | Reconstruir ligado a los 2 jardines nuevos. |
| `hotel_spaces` | Reconstruir ligado a `alma_hotel` (o vaciar si no se usan en la demo). |
| `event_bookings` | Pocos eventos demo (p. ej. 2–4 total) con `property_id` correcto. |
| `event_lodging_assignments` | Vaciar (evita habitaciones bloqueadas por datos viejos). |
| `event_room_blocks` | Vaciar (mismo motivo). |
| `tasks` | Vaciar o 2–3 tareas demo alineadas a números de habitación reales (1–40). |
| `messages` | Vaciar o 2–3 mensajes demo. |
| `pending_bookings` | Vaciar (cola de Stripe / pendientes). |
| `payment_transactions` | Vaciar (evita referencias a reservas borradas). |
| `role_permissions` | **Eliminar todos los documentos** para que `/auth/login` use solo `DEFAULT_ROLE_PERMISSIONS` del código (sin overrides obsoletos). |

### 2. Colecciones a **reconstruir limpiamente** (tras el vaciado)

- `tenants` → 1 documento.
- `properties` → 3 documentos (`alma_hotel` + 2 jardines con nombres finales).
- `rooms` → 40 documentos en `alma_hotel` (4× `junior_suite`, 36× `double`).
- `users` → `platform_admin` + usuarios del tenant (owner, admin, recepcionista, opcional housekeeping/maintenance para tareas/inbox).
- `guests`, `reservations`, `event_spaces`, `hotel_spaces`, `event_bookings`, opcionalmente `tasks`, `messages`.

### 3. Qué **puede preservarse** si ya es “bueno”

| Colección | Criterio |
|-----------|----------|
| `room_types` | Catálogo de referencia; **opcional** mantener si no está corrupto. Si se quiere máxima limpieza: vaciar y dejar que `seed_room_types()` vuelva a insertar (idempotente solo si `count==0` — en reset total debería insertarse de nuevo). |
| `amenities` | Igual que `room_types`. |

**Recomendación práctica:** en un reset “duro” de demo, **vaciar también** `room_types` y `amenities` y volver a ejecutar el seed de catálogo **o** un script que inserte el mismo contenido que `seeds/run.py` (`seed_room_types`, `seed_amenities`). Así no quedan IDs viejos mezclados.

### 4. `role_permissions`

**Sí: eliminar todos los documentos** en `staylo.role_permissions`. El merge en `auth.py` parte de `DEFAULT_ROLE_PERMISSIONS`; sin documentos en BD, los módulos efectivos coinciden con el código actual.

---

## B. Forma objetivo de los datos (estado final deseado)

### IDs estables recomendados (reproducibles en código y pruebas)

| Entidad | ID sugerido | Notas |
|---------|-------------|--------|
| Tenant demo | UUID fijo o `tenant_alma_demo` | Un documento en `tenants`. |
| Hotel | `alma_hotel` | Coincide con `DEMO_PROPERTY_ID` en `seeds/run.py` hoy. |
| Jardín 1 | `garden_margati` | `type: event_garden`, nombre **Jardín Margati**. |
| Jardín 2 | `garden_alma` | `type: event_garden`, nombre **Jardín Alma**. |

### `tenants` (1 documento)

- `name`: p. ej. `Alma Hospitality Group` (o “Demo Tenant”).
- `status`: `active`.
- `plan`: `enterprise` (o el que use el seed).
- `contact_email`: email de contacto demo.

### `properties` (3 documentos)

1. **Alma Hotel Boutique** — `id: alma_hotel`, `type: hotel`, `status: active`, `tenant_id` = id del tenant.
2. **Jardín Margati** — `id: garden_margati`, `type: event_garden`, `status: active`, mismo `tenant_id`.
3. **Jardín Alma** — `id: garden_alma`, `type: event_garden`, `status: active`, mismo `tenant_id`.

### `rooms` (40 documentos, todos `property_id: alma_hotel`)

- **4** habitaciones `type: junior_suite` (p. ej. números 5, 15, 25, 35 como en el seed actual).
- **36** habitaciones `type: double`.
- Distribución por planta: p. ej. 10 por piso × 4 pisos (números 1–40).
- `status`: mayoría `available`; 1–2 `occupied`/`reserved`/`cleaning` según reservas demo.
- `property_id` siempre `alma_hotel`.

### `users` (mínimo viable + estable)

| Rol | Email (ejemplo actual repo) | Notas |
|-----|-----------------------------|--------|
| `platform_admin` | `platform@almasystem.com` | Sin `tenant_id` / `property_id` (alcance global). |
| `owner` | `owner@hotel.com` | **`tenant_id`** = tenant demo (importante para `/corporate/dashboard`); `property_id` opcional `alma_hotel`. |
| `admin` | `admin@hotel.com` | `tenant_id` + `property_id: alma_hotel`. |
| `receptionist` | `maria@hotel.com` | `tenant_id` + `property_id: alma_hotel`. |
| Opcional | housekeeping / maintenance | Solo si se quieren tareas demo; mismo `tenant_id` y `property_id`. |

Contraseñas: mantener las documentadas en el proyecto (`platform123`, `owner123`, `admin123`, `recep123`, …).

**Crítico:** el `owner` (y idealmente admin/recepción) deben tener **`tenant_id`** relleno para que `_corporate_scope_property_ids` incluya las 3 propiedades del grupo. El seed actual solo asigna `tenant_id` a `properties`; conviene **actualizar usuarios** con el mismo `tenant_id` tras crear el tenant.

### `guests` (4–6 documentos)

- Perfiles ficticios con emails únicos; sin requisito de `property_id` (el vínculo es vía `reservations`).

### `reservations` (3–5 documentos)

- Todas con `property_id: alma_hotel`.
- `room_id` / `room_number` coherentes con las 40 habitaciones.
- Mezcla de estados: al menos una `checked_in`, una `confirmed`, una `checked_out` (fechas relativas a “hoy”).
- `created_by` = id de un usuario válido (p. ej. recepcionista).

### `event_spaces` (por jardín)

- **Jardín Margati:** 1–2 espacios (p. ej. “Jardín principal”, “Salón”).
- **Jardín Alma:** 1–2 espacios.
- `property_id` debe ser `garden_margati` o `garden_alma` según corresponda.

### `hotel_spaces` (hotel)

- 2–4 espacios en `alma_hotel` con `space_type` variado (`terrace`, `rooftop`, `pool`, `salon`, etc.) para probar la UI de eventos hotel.

### `event_bookings` (2–4 documentos)

- Repartidos entre `garden_margati` y `garden_alma`.
- `event_space_id` debe existir en `event_spaces`.
- Fechas futuras/pasadas y `booking_status` / `payment_status` variados para gráficos demo.

### `tasks` / `messages` (opcional)

- **Tasks:** 2–3 tareas con `room_number` entre 1 y 40 (el seed antiguo mencionaba 305/204 — **incorrecto** para 40 habitaciones; usar p. ej. “Habitación 15”).
- **Messages:** 2 hilos staff; opcional 1 staff-to-guest.

---

## C. Plan de implementación paso a paso (solo en DB `staylo`)

1. **Backup:** snapshot Atlas o `mongodump --db staylo` antes de cualquier borrado.
2. **Conectar** a Mongo (Compass o `mongosh`) seleccionando explícitamente `use staylo`.
3. **Eliminar overrides:** `db.role_permissions.deleteMany({})`.
4. **Vaciar datos operativos** (orden sugerido para reducir frustraciones de FK lógicas; Mongo no tiene FK, pero ayuda a no dejar basura):
   - `event_lodging_assignments`, `event_room_blocks`
   - `payment_transactions`, `pending_bookings`
   - `messages`, `tasks`
   - `reservations`
   - `event_bookings`
   - `hotel_spaces`, `event_spaces`
   - `rooms`
   - `guests`
   - `properties`
   - `users`
   - `tenants`
   - Opcional: `room_types`, `amenities` si se desea catálogo limpio.
5. **Insertar** tenant → properties (3) con `tenant_id` en cada una.
6. **Insertar** 40 rooms con `property_id: alma_hotel`.
7. **Insertar** users con hashes bcrypt correctos (`hash_password` del backend) y **`tenant_id`** en owner/admin/recepción/staff.
8. **Insertar** guests → reservations → ajustar `status` de habitaciones afectadas.
9. **Insertar** event_spaces (×2 jardines) → hotel_spaces (×1 hotel) → event_bookings.
10. Opcional: tasks, messages.
11. **Re-seed catálogo** si se vació: ejecutar aplicación con lógica de `seed_room_types` / `seed_amenities` o script equivalente.
12. **Verificación rápida:** queries del documento [`mongo-data-audit.md`](./mongo-data-audit.md) (huérfanos = 0).
13. **Probar login** y vistas owner/admin/recepción.

### Alternativa: script único

Implementar (en otro PR) un script `scripts/reset_staylo_demo.py` que use el mismo `MONGO_URL` y `DB_NAME=staylo`, ejecute los pasos 3–11 en orden, y **no** se ejecute en producción sin confirmación. Este documento no lo implementa.

---

## D. Alineación con el código actual (`seeds/run.py`)

El seed actual ya genera **40 habitaciones** (4 junior en 5,15,25,35 + 36 double) y **1 jardín** (“Jardín de Amargati”). Para el objetivo de **2 jardines** con nombres **Jardín Margati** y **Jardín Alma**:

- Ampliar `seed_properties()` para insertar **dos** propiedades `event_garden` con IDs fijos y nombres correctos.
- Repartir `event_spaces` y `event_bookings` entre ambos.
- Asegurar `seed_tenants()` asigna `tenant_id` a **las tres** propiedades.
- Tras seed, **script de backfill** `tenant_id` en `users` del tenant (owner, admin, recepción, etc.).

Hasta que el código de seed se actualice, el reset manual siguiendo la sección **B** es suficiente.

---

## E. Validación post-reset (UI)

- Login: `platform@almasystem.com` → consola plataforma.
- Login: `owner@hotel.com` → corporativo: **3 propiedades** en scope; ingresos hotel + jardines coherentes con `/hotels` y `/event-gardens`.
- Login: `admin@hotel.com` → dashboard habitaciones = **40**; lista habitaciones alineada.
- Login: `maria@hotel.com` → módulos operativos; mismos totales acotados al hotel.
- Eventos: reservas de jardín visibles por propiedad; espacios hotel en Alma Hotel Boutique.

---

*Documento de planificación. Ejecutar borrados solo tras backup y confirmación.*

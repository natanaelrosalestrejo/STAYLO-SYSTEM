# Auditoría de datos MongoDB / Atlas y plan de limpieza segura (STAYLO)

**Alcance:** modelo de datos en uso según el código backend actual. **No** incluye módulo financiero. **No** ejecuta borrados: es guía de inspección y corrección.

**Fecha:** 2025-03-26

---

## 1. Resumen ejecutivo

- **Coherencia de vistas** depende de que: (1) `properties.id` ↔ `tenant_id` estén alineados por tenant; (2) `rooms.property_id` y `reservations.property_id` apunten a propiedades **existentes** y del **tipo correcto** (hotel vs jardín); (3) `users.property_id` / `users.tenant_id` permitan al API calcular `_allowed_property_ids` y `_corporate_scope_property_ids` de forma consistente.
- **Inconsistencias** típicas en Atlas: habitaciones huérfanas o con `property_id` obsoleto; reservas con `room_id` inexistente o `property_id` que no coincide con la habitación; usuarios staff con `property_id` de otro hotel o sin `tenant_id`; documentos en `role_permissions` que **sustituyen** por completo los defaults por código y ocultan módulos (p. ej. `hotel-events`).
- **Riesgo de código** (no solo datos): algunos endpoints de reportes (`/reports/occupancy`, `/reports/insights`) agregan **sin filtrar por alcance** de usuario; si el frontend los usa, los números pueden **discrepar** del dashboard corporativo o de `/reports/dashboard` aunque la base de datos sea correcta. Validar en UI qué endpoint consume cada pantalla.

---

## 2. Modelo en uso: colección por colección

### A. `properties`

| Aspecto | Detalle |
|--------|---------|
| **Campos críticos** | `id` (UUID), `type` (`hotel` \| `event_garden`), `status` (`active` \| `inactive`), `tenant_id` (opcional pero clave multisitio). |
| **Relaciones** | Un tenant puede tener varias propiedades. `users.tenant_id` y `users.property_id` enlazan staff/owner a este universo. |
| **Inconsistencias que explican bugs** | Propiedades sin `tenant_id` en un entorno multisitio; `type` mal puesto (hotel vs jardín) → métricas hotel/jardín del corporativo y `/properties/stats` no coinciden; propiedades `inactive` que aún tienen reservas activas. |

### B. `rooms`

| Aspecto | Detalle |
|--------|---------|
| **Campos críticos** | `id`, `number`; `property_id` (debe existir en `properties` y ser **hotel**); `status` (available, occupied, reserved, cleaning, maintenance); `type`, `floor`, `price_per_night`. |
| **Relaciones** | Muchas habitaciones → una propiedad hotel. `reservations.room_id` → `rooms.id`. |
| **Inconsistencias** | `property_id` vacío o apuntando a `event_garden`; `number` duplicado global (el API rechaza creación en duplicado, pero datos legacy pueden existir); estado de habitación desincronizado con reservas activas (p. ej. `available` pero hay reserva `confirmed`). |

### C. `reservations`

| Aspecto | Detalle |
|--------|---------|
| **Campos críticos** | `id`, `guest_id`, `room_id`, `room_number`, `property_id`, `check_in_date`, `check_out_date`, `status`, `total_amount`, `payment_status`, `payment_source`, `reservation_source`. |
| **Relaciones** | `guest_id` → `guests.id`; `room_id` → `rooms.id`; `property_id` debe alinearse con la habitación y ser **hotel** para reservas de alojamiento. |
| **Inconsistencias** | `room_id` sin documento en `rooms`; `property_id` ≠ `rooms.property_id` del mismo `room_id`; reservas con `property_id` de jardín; fechas inconsistentes; `status` checked_in pero habitación no `occupied`. |

### D. `guests`

| Aspecto | Detalle |
|--------|---------|
| **Campos críticos** | `id`, `first_name`, `last_name`, `email` (opcional); `is_vip`, notas. |
| **Relaciones** | Referenciados por `reservations.guest_id`. Listados de huéspedes suelen derivar de reservas en propiedades permitidas (`guests` router). |
| **Inconsistencias** | Huéspedes sin reservas (huérfanos) — no crítico; huéspedes referenciados en reservas borradas — inconsistente. |

### E. `users`

| Aspecto | Detalle |
|--------|---------|
| **Campos críticos** | `id`, `email`, `role`, `password_hash`, `is_active`; `property_id`, `tenant_id` (alcance); `custom_permissions` (opcional, sustituye lista de módulos si se usa). |
| **Relaciones** | `tenant_id` → `tenants` (lógica); `property_id` → `properties.id`. |
| **Inconsistencias** | `property_id` que no existe en `properties`; `tenant_id` que no coincide con el de `properties` del mismo hotel; `owner`/`admin` sin `tenant_id` cuando el corporativo espera grupo; recepcionista con `property_id` de un hotel y habitaciones en otro. |

### F. `role_permissions`

| Aspecto | Detalle |
|--------|---------|
| **Campos críticos** | `role` (string), `modules` (array de strings), `updated_at` (según uso en API). |
| **Relaciones** | Un documento por rol; **reemplaza** el array por rol para `DEFAULT_ROLE_PERMISSIONS` en código al hacer merge en login (`auth.py`). |
| **Inconsistencias** | `modules` incompletos vs código actual → UI “incompleta” (recepcionista sin inbox, admin sin `hotel-events`); **módulos obsoletos** o nombres distintos a los del frontend (`hotel-events` vs `hotel_events`). |

### G. `event_spaces`

| Aspecto | Detalle |
|--------|---------|
| **Campos críticos** | `id`, `property_id` (debe ser propiedad **event_garden**), `space_name`, `capacity`, `status`, `price_per_event`. |
| **Relaciones** | Espacios de **jardín** de eventos; no confundir con `hotel_spaces`. |
| **Inconsistencias** | `property_id` apuntando a hotel o propiedad inexistente; espacios huérfanos. |

### H. `hotel_spaces`

| Aspecto | Detalle |
|--------|---------|
| **Campos críticos** | `id`, `property_id` (hotel), `space_name`, `space_type`, `capacity`, `status`, `price_per_event`. |
| **Relaciones** | Espacios de evento **dentro** del hotel (terraza, rooftop, pool, etc.). |
| **Inconsistencias** | `property_id` de jardín; propiedad inexistente; duplicados de nombre por propiedad (no siempre validado en código). |

### I. `event_bookings`

| Aspecto | Detalle |
|--------|---------|
| **Campos críticos** | `id`, `property_id`, `event_space_id`, `event_space_name`, `event_date`, `booking_status`, `payment_status`, `total_price`, `client_name`. |
| **Relaciones** | `event_space_id` suele referenciar `event_spaces` (jardín); en flujos hotel también puede vincularse a espacios hotel según UI. **Verificar** en datos reales que `event_space_id` exista en la colección correspondiente. |
| **Inconsistencias** | `property_id` hotel vs jardín mezclado con tipo de espacio; `event_space_id` roto; ingresos del mes en corporativo vs vista jardines si fechas o `booking_status` no son uniformes. |

### J. `event_lodging_assignments`

| Aspecto | Detalle |
|--------|---------|
| **Campos críticos** | `id`, `event_booking_id`, `room_id`, `room_property_id`, `assignment_status`, `check_in_date`, `check_out_date`, `reservation_id` (opcional). |
| **Relaciones** | `event_booking_id` → `event_bookings.id`; `room_id` → `rooms.id`; `room_property_id` debe ser el hotel donde está la habitación. |
| **Inconsistencias** | Asignaciones a habitaciones inexistentes; `room_property_id` ≠ `rooms.property_id`; estados `held`/`reserved` pero habitación `available` o reserva hotel duplicada. |

---

## 3. Checklist práctico en Atlas / MongoDB

Para cada colección, ejecutar consultas de **exploración** (no destructivas).

### `properties`

- [ ] Listar `tenant_id` nulos vs esperados en tu modelo de negocio.
- [ ] Verificar que cada `id` referenciado en `users.property_id` / `rooms.property_id` exista.
- [ ] Contar por `type` y `status`; marcar `inactive` con reservas activas.

### `rooms`

- [ ] `property_id` que no existe en `properties`.
- [ ] `property_id` que apunta a `type: event_garden`.
- [ ] Duplicados de `number` (globales).
- [ ] Habitaciones sin `property_id` (legacy).

### `reservations`

- [ ] `room_id` sin documento en `rooms`.
- [ ] `property_id` distinto de `rooms.property_id` para el mismo `room_id`.
- [ ] `property_id` que no existe en `properties`.
- [ ] `guest_id` sin guest (opcional según política).
- [ ] Reservas `confirmed`/`checked_in` con `check_out_date` pasada (lógica de negocio).

### `guests`

- [ ] Huérfanos sin reservas (informativo).
- [ ] Emails duplicados (si el negocio exige unicidad).

### `users`

- [ ] `property_id` inválido o inexistente.
- [ ] `tenant_id` inconsistente con las propiedades del usuario.
- [ ] Roles operativos sin `property_id`/`tenant_id` cuando el API espera alcance.
- [ ] `custom_permissions` no vacío que recorta módulos.

### `role_permissions`

- [ ] Documentos por rol; comparar `modules` con `DEFAULT_ROLE_PERMISSIONS` en `backend/models/schemas.py`.
- [ ] Detectar **sustitución total** que borría módulos nuevos del código.

### `event_spaces`

- [ ] `property_id` que no existe o no es `event_garden`.

### `hotel_spaces`

- [ ] `property_id` que no existe o no es `hotel`.

### `event_bookings`

- [ ] `property_id` inexistente.
- [ ] `event_space_id` sin documento en `event_spaces` o `hotel_spaces` (según origen del flujo).
- [ ] Fechas y `booking_status` coherentes para métricas mensuales.

### `event_lodging_assignments`

- [ ] `event_booking_id` sin `event_bookings`.
- [ ] `room_id` sin `rooms`.
- [ ] `room_property_id` ≠ `rooms.property_id` del `room_id`.

---

## 4. Causas raíz más probables en Mongo (datos)

1. **Mezcla de tenants** (`properties`/`users`/`rooms`) sin `tenant_id` consistente.
2. **IDs de propiedad** cambiados o reseed parcial → referencias rotas.
3. **`rooms.property_id`** desalineado con reservas o con usuarios.
4. **`role_permissions`** desactualizado frente al código.
5. **Reservas y estados de habitación** no actualizados tras cancelaciones o pruebas manuales.
6. **Datos demo** en el mismo cluster que producción sin etiquetar.

---

## 5. Plan de limpieza segura (sin ejecutar aquí)

### Qué se puede limpiar con bajo riesgo

- Corregir **referencias** (`property_id` en `rooms`/`reservations`) cuando haya un mapeo claro id→id.
- **Eliminar** documentos claramente de prueba (mismo `tenant_id` demo, emails `@test.com`) si el negocio lo aprueba.
- **Actualizar o eliminar** documentos `role_permissions` que **sustituyen** por completo los defaults — preferir **eliminar** el documento para volver a defaults de código, o **fusionar** listas con el código actual (manual).

### Qué preservar como histórico

- **Reservas** (`checked_out`, `cancelled`) y **event_bookings** cerradas o canceladas.
- **Guests** con historial de visitas (aunque no tengan reserva activa).
- **Asignaciones de lodging** finalizadas (`released`, `cancelled`) si aportan auditoría.

### Qué puede reseedearse

- **Habitaciones** solo si el inventario es irrecuperable (duplicados masivos, `property_id` erróneo en todo el set) y tras **exportar** backup.
- **Propiedades** solo en entornos demo o con migración de tenant coordinada.
- **No** reseedear ciegamente sin backup de `reservations`/`guests`.

### Qué corregir manualmente en lugar de borrar

- **Usuarios** (`property_id`/`tenant_id`) — unos pocos cambios de campo.
- **role_permissions** — alinear lista o borrar documento.
- **Una reserva** con `property_id` incorrecto — patch puntual si el negocio lo valida.

---

## 6. Reseed vs no reseed

| Situación | Acción recomendada |
|-----------|---------------------|
| Pocos `rooms` con `property_id` incorrecto conocido | **PATCH** masivo por `property_id` correcto. |
| Inventario duplicado o mezclado entre tenants | **Backup** → corrección selectiva o reseed **solo** `rooms` en una propiedad. |
| Demo mezclado con real | Separar por `tenant_id` o borrar solo tenant demo tras exportación. |
| `role_permissions` vacío o desfasado | **Eliminar** documento del rol para usar defaults de código. |

---

## 7. Validación en UI después de limpieza/corrección

- **Por rol** (owner, admin, recepcionista): dashboard hotel, `/rooms`, `/reservations`, corporativo, `/hotels`, `/event-gardens` — totales y sumas **coherentes** entre sí.
- **Recepcionista:** lista de módulos y datos solo del hotel/tenant esperado.
- **Eventos:** `event_bookings` y espacios hotel/jardín visibles según propiedad.
- **Sin cambios esperados:** flujo público de reserva si `rooms` y `properties` siguen correctos.

---

## 8. Ejemplos de agregaciones (Mongo shell / Compass)

> Solo lectura; no ejecutar `$out` / `$merge` sin revisión.

**Habitaciones con `property_id` inválido:**

```javascript
db.rooms.aggregate([
  { $lookup: { from: "properties", localField: "property_id", foreignField: "id", as: "p" } },
  { $match: { $or: [ { p: { $size: 0 } }, { "p.type": { $ne: "hotel" } } ] } },
  { $project: { id: 1, number: 1, property_id: 1 } }
])
```

**Reservas con `room_id` huérfano:**

```javascript
db.reservations.aggregate([
  { $lookup: { from: "rooms", localField: "room_id", foreignField: "id", as: "r" } },
  { $match: { r: { $size: 0 } } },
  { $project: { id: 1, room_id: 1, property_id: 1, status: 1 } }
])
```

**Reservas donde `property_id` ≠ habitación:**

```javascript
db.reservations.aggregate([
  { $lookup: { from: "rooms", localField: "room_id", foreignField: "id", as: "r" } },
  { $unwind: "$r" },
  { $match: { $expr: { $ne: ["$property_id", "$r.property_id"] } } },
  { $project: { id: 1, property_id: 1, room_property_id: "$r.property_id" } }
])
```

---

## 9. Referencia de código (no datos)

- Alcance: `backend/auth.py` — `_allowed_property_ids`.
- Corporativo y stats: `backend/server.py` — `_corporate_scope_property_ids`, `/corporate/dashboard`, `/properties/stats`.
- **Nota:** `/reports/occupancy` y `/reports/insights` pueden usar agregaciones **globales**; si la UI muestra discrepancias, contrastar con el endpoint que consume cada pantalla.

---

*Fin del documento. No ejecuta borrados; solo orienta auditoría y planificación.*

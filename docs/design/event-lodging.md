## 1. Executive summary

STAYLO ya tiene una base sólida para eventos (`event_bookings`) y hospedaje (`rooms`, `reservations`), pero hoy ambos mundos están desacoplados.  
La recomendación para **EVENT + LODGING INTEGRATION** es:

- Mantener `RoomModel` como modelo único de inventario de habitaciones (hotel y jardín).
- Agregar una capa de enlace explícito entre evento y hospedaje con un modelo nuevo: `event_lodging_assignments`.
- Introducir bloques de habitaciones por evento y asignaciones por tipo de rol (bride, groom, parents, family, guest_block).
- Avanzar en 3 fases: **MVP vendible rápido**, luego control operacional, luego analítica/finanzas avanzadas.

Esto minimiza riesgo, evita refactor masivo y es totalmente compatible con la arquitectura actual (FastAPI, MongoDB, propiedad por `property_id`, métricas corporativas existentes).

---

## 2. Recommended architecture

### 2.1 Principio principal

Separar claramente tres capas:

1. **Evento comercial**  
   - Ya existe en `event_bookings`.
2. **Inventario físico de habitaciones**  
   - Ya existe en `rooms`.
3. **Vinculación evento ↔ hospedaje**  
   - Nueva capa explícita (`event_lodging_assignments` + `event_room_blocks`) para orquestar reglas y trazabilidad.

### 2.2 Decisión clave

No acoplar todo dentro de `event_bookings` ni dentro de `reservations`.  
En lugar de eso, crear modelos intermedios de integración:

- `event_room_blocks`: define el “bloque” de habitaciones reservadas para un evento.
- `event_lodging_assignments`: define asignaciones individuales (especiales o de invitados) y el estado de cada una.

Esto permite escalar desde un MVP simple hasta control granular sin romper modelos actuales.

---

## 3. Proposed models

## A) DATA MODEL DESIGN

### A1. ¿Reutilizar `RoomModel` o crear otro?

**Recomendación: reutilizar `RoomModel`** como inventario de habitaciones, agregando campos de clasificación mínimos.

**Por qué:**
- Ya existe lógica de disponibilidad, estatus y reservas en torno a `rooms`.
- Evita duplicación de lógica (dos inventarios paralelos).
- Permite manejar habitaciones de jardín como habitaciones “normales” con metadata adicional.

**Campos sugeridos a `RoomModel` (nuevos):**
- `inventory_source`: `"hotel" | "event_garden"`  
  (de dónde proviene operativamente la habitación).
- `lodging_mode`: `"general" | "event_priority" | "event_only"`  
  (si la habitación puede venderse libremente o priorizarse para eventos).
- `property_id` (si no está estandarizado en todos los rooms legacy, volverlo obligatorio para nuevas altas).
- `tags`: array opcional (ej. `["bridal_suite"]`).

> Nota: no se propone un `GardenRoomModel` separado para no fragmentar el motor de reservas.

---

### A2. Representar habitaciones especiales (bride/groom/family/guest block)

No guardarlo fijo en `RoomModel` (porque una habitación puede ser “bridal” para un evento y “normal” para otro).  
Representarlo en la capa de asignación:

- `assignment_type`:  
  - `special_role` (bride/groom/parents/family)
  - `guest_block`
  - `guest_final`
- `special_role`:
  - `bride`
  - `groom`
  - `parents`
  - `close_family`
  - `other_vip`

Así, el rol especial vive en el contexto del evento, no como atributo permanente de la habitación.

---

### A3-A4. ¿Cómo vincular `EventBooking` con lodging?

**Recomendación: modelo separado (`event_lodging_assignments`) + referencia opcional a `reservation_id`.**

No usar sólo `room_ids` ni sólo `reservation_ids`:

- `room_ids` solos no trazan ciclo de vida (hold, release, reservado, cancelado).
- `reservation_ids` solos no sirven en etapas tempranas (cuando aún no hay huésped nominal).

Por eso conviene una capa intermedia que permita:
- Estado previo a reserva nominal (bloqueo/hold).
- Conversión a reserva final cuando el huésped se confirma.
- Auditoría y cancelación controlada.

---

### A5. Campos propuestos (nuevos modelos)

#### 1) `event_room_blocks` (nuevo)

Propósito: bloque agregado de habitaciones por evento.

Campos sugeridos:
- `id`
- `event_booking_id`
- `property_id` (hotel o jardín que aporta habitaciones)
- `source_property_type`: `"hotel" | "event_garden"`
- `block_name` (ej. "Boda Pérez - Bloque Hotel")
- `target_room_count`
- `blocked_room_count`
- `released_room_count`
- `status`: `"draft" | "active" | "partially_released" | "released" | "cancelled"`
- `hold_until` (fecha límite para liberar no usadas)
- `notes`
- `created_by`, `created_at`, `updated_at`

#### 2) `event_lodging_assignments` (nuevo)

Propósito: registro granular por habitación vinculada al evento.

Campos sugeridos:
- `id`
- `event_booking_id`
- `event_room_block_id` (nullable, para casos especiales sin bloque)
- `room_id`
- `room_property_id`
- `room_property_type`: `"hotel" | "event_garden"`
- `assignment_type`: `"special_role" | "guest_block" | "guest_final"`
- `special_role`: `"bride" | "groom" | "parents" | "close_family" | "other_vip" | null`
- `guest_label` (texto libre temporal, ej. “Familia novia 1”)
- `reservation_id` (nullable; se llena al convertir a reserva real)
- `assignment_status`: `"held" | "reserved" | "checked_in" | "checked_out" | "released" | "cancelled"`
- `check_in_date`, `check_out_date`
- `price_mode`: `"standard" | "event_rate" | "complimentary"`
- `event_rate_amount` (nullable)
- `created_by`, `created_at`, `updated_at`

#### 3) Extensiones a `EventBookingModel` (mínimas)

Agregar campos de resumen para performance rápida:
- `lodging_integration_enabled: bool`
- `lodging_summary` (objeto):
  - `special_rooms_count`
  - `guest_block_count`
  - `assigned_count`
  - `released_count`
  - `lodging_revenue_estimated`
  - `lodging_revenue_real`

#### 4) Extensiones a `ReservationModel` (mínimas)

- `event_booking_id` (nullable)
- `event_assignment_id` (nullable)
- `reservation_source_detail`: `"event_special" | "event_block" | "event_direct" | ..."`

Con esto, reportes pueden calcular impacto real sin joins costosos manuales.

---

## 4. Proposed relationships

Relaciones objetivo:

- `EventBooking` 1 --- N `EventRoomBlock`
- `EventBooking` 1 --- N `EventLodgingAssignment`
- `EventRoomBlock` 1 --- N `EventLodgingAssignment`
- `Room` 1 --- N `EventLodgingAssignment` (en el tiempo)
- `Reservation` 0..1 --- 1 `EventLodgingAssignment`

Esto soporta:
- Habitaciones especiales fijas para evento (novia/familia).
- Bloque de huéspedes masivo.
- Conversión gradual de bloque a reservas reales.

---

## 5. Operational flow design

## B) OPERATIONAL FLOW

### B1. Crear evento con hospedaje

Flujo recomendado (wizard corto de 3 pasos):

1. **Datos del evento**  
   - Lo actual: espacio, fecha, tipo, cliente, precio.
2. **Hospedaje (opcional)**  
   - Toggle: “Este evento requiere hospedaje”.
   - Selección de rango check-in/check-out.
   - Definir:
     - habitaciones especiales (bride/groom/parents/family),
     - bloque de habitaciones para invitados.
3. **Confirmación**  
   - Resumen evento + resumen lodging.
   - Crea `event_booking` + bloques/asignaciones en estado `held`.

### B2. Asignar habitaciones especiales

Dentro del detalle del evento:
- Sección “Habitaciones especiales”.
- Cada rol (bride, groom, parents, close_family) muestra:
  - habitación asignada,
  - estado (`held/reserved/...`),
  - acción “reemplazar / liberar”.

Regla: una habitación especial puede pasar de `held` a `reserved` al nominalizar huésped.

### B3. Bloquear habitaciones de hotel para invitados

Sección “Bloque de huéspedes”:
- Definir cantidad objetivo por tipo (opcional en Fase 2).
- Sistema sugiere habitaciones disponibles.
- Confirmar bloqueo -> crea `event_room_block` + `event_lodging_assignments` en `held`.
- Al confirmar nombres:
  - se crean `reservations` y se vinculan por `reservation_id`.

### B4. Cancelación y efectos

Política recomendada por estado:

- Si `assignment_status = held` y sin `reservation_id`:
  - liberar automáticamente.
- Si ya existe `reservation_id`:
  - mostrar opciones:
    1. cancelar reserva ligada,
    2. desvincular del evento y mantener reserva hotel.
- Si evento se cancela:
  - asistente de cancelación con resumen de impacto:
    - cuántas asignaciones en hold,
    - cuántas reservas reales,
    - qué se libera y qué se conserva.

### B5. UX sin complejidad excesiva

Principio: no meter toda la complejidad en la pantalla de creación.

UI recomendada:
- Crear evento: simple + toggle “Agregar hospedaje”.
- Gestión avanzada: en “Detalle del evento” con 3 sub-tabs:
  - `Resumen`,
  - `Habitaciones especiales`,
  - `Bloque de huéspedes`.

Esto evita fricción comercial y mantiene flujo demo-friendly.

---

## 6. Product strategy and phased roadmap

## C) PRODUCT STRATEGY

### Phase 1 (MVP vendible rápido)

Objetivo: demo comercial sólida en poco tiempo.

Incluye:
- Toggle de “evento con hospedaje”.
- Asignar habitaciones especiales básicas (bride, groom, parents, close_family) como holds.
- Crear bloque simple de N habitaciones hotel (holds sin huésped nominal).
- Vista de resumen de impacto en evento:
  - rooms held,
  - rooms confirmed,
  - lodging estimate.

No incluye:
- Reglas automáticas complejas,
- pricing avanzado por subgrupo,
- analítica financiera profunda.

**Valor comercial inmediato**: “Con un evento puedes apartar hospedaje ligado desde el mismo flujo”.

---

### Phase 2 (control operacional enriquecido)

Incluye:
- Conversión de holds a reservas nominales con vínculo `reservation_id`.
- Reasignación masiva, liberación parcial y expiración por `hold_until`.
- Tarifas por evento (`event_rate`, complimentary, standard).
- Gestión de cancelación con wizard de decisiones por reserva ligada.
- Filtros en `Reservations` por `event_booking_id`.

**Valor operativo**: control real de front desk y coordinación eventos-hotel.

---

### Phase 3 (analytics + financial linkage)

Incluye:
- Reportes de impacto total por evento:
  - `event revenue`,
  - `lodging revenue linked`,
  - `total event impact`.
- Métricas en corporate dashboard:
  - ocupación atribuible a eventos,
  - ADR y RevPAR de reservas ligadas a evento,
  - comparación por propiedad/tenant.
- Forecast: eventos próximos y su demanda esperada de habitaciones.

**Valor ejecutivo**: argumento fuerte para expansión multi-propiedad y pricing estratégico.

---

### Qué construir primero para vender/demo pronto

Orden recomendado:

1. **Fase 1 completa** (bloques + habitaciones especiales en modo hold + resumen impacto).
2. Mini-enhancement: “convertir hold a reserva” para 1-2 casos reales de demo.
3. Dashboard simple de “ingreso evento + hospedaje estimado/real”.

Con eso ya puedes demostrar:
- integración real evento-hospedaje,
- reserva de habitaciones para novia/familia,
- impacto económico del evento más allá del salón.

---

## 7. Risks and complexity notes

1. **Complejidad de estados**
   - Riesgo: inconsistencias entre `rooms.status`, `reservations.status` y `assignment_status`.
   - Mitigación: definir máquina de estados simple y centralizada.

2. **Colisiones de inventario**
   - Riesgo: bloquear habitaciones para evento y venderlas por otro canal.
   - Mitigación: tratar `held` como estado de disponibilidad real en búsquedas internas y públicas (según fase).

3. **Cancelaciones**
   - Riesgo: borrar evento y perder trazabilidad financiera/histórica.
   - Mitigación: soft-cancel con snapshots y acciones explícitas sobre reservas vinculadas.

4. **UX demasiado pesada**
   - Riesgo: recepcionista no adopta el flujo.
   - Mitigación: creación simple + gestión avanzada en detalle del evento.

5. **Compatibilidad legacy**
   - Riesgo: reservas existentes sin `event_booking_id`.
   - Mitigación: campos nuevos opcionales y migración progresiva no disruptiva.

---

## 8. Cierre

La opción más limpia y escalable para STAYLO es **integrar eventos y hospedaje con modelos intermedios** (`event_room_blocks` + `event_lodging_assignments`) y mantener `RoomModel` como inventario único.  
Esto permite llegar rápido a un MVP demostrable y evolucionar después a operación avanzada y analítica financiera completa sin rediseñar la base.


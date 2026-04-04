> **Archived document.** Mantenido solo como referencia histórica (snapshot de auditoría).  
> **Superseded by / canonical today:** modelo de permisos en [permissions/product-model.md](../permissions/product-model.md), RFC en [permissions/resolution-rfc.md](../permissions/resolution-rfc.md), diseño en [design/garden-roles.md](../design/garden-roles.md) y [design/event-lodging.md](../design/event-lodging.md).  
> Para índice general: [docs/README.md](../README.md).

---

## 1. Resumen ejecutivo

- **Jardines / eventos**: El sistema ya soporta un modelo completo para **jardines de eventos** como propiedades de tipo `event_garden`, con **espacios de evento** (`event_spaces`), **espacios internos del hotel** para eventos (`hotel_spaces`) y **reservas de eventos** (`event_bookings`). El frontend tiene vistas operacionales (`/jardines`, `/hotel-events`) y de grupo (`/event-gardens`, `/corporate`) plenamente funcionales. No existe hoy lógica explícita para **habitaciones propias del jardín** ni vinculación automática entre reservas de eventos y ocupación hotelera a nivel de habitaciones concretas.
- **Roles / acceso**: La arquitectura de permisos está bien definida y documentada en `docs/permissions/product-model.md` y (histórico) `docs/archive/permissions-audit-legacy.md`. El backend expone plantillas de módulos por rol (`DEFAULT_ROLE_PERMISSIONS` y `/api/role-permissions`), y el frontend aplica estos módulos para sidebar y rutas a través de `ROUTE_MODULE_MAP` y `canAccessRoute`. Hay ligeras **inconsistencias** entre módulos por rol y `allowedRoles` de algunas rutas.
- **Relación eventos ↔ hotel**: Hay una relación **analítica/estratégica** entre reservas de eventos y desempeño del hotel (vía `/corporate/dashboard`, `/properties/stats`, `/reports/revenue-breakdown`), pero no una relación **operativa** a nivel de “este evento reserva estas habitaciones específicas para novia/familia”.
- **Siguiente paso recomendado**: Diseñar y luego implementar (en otra fase) un modelo explícito para **habitaciones de jardín / habitaciones reservadas por evento**, y alinear la protección de rutas del frontend con los módulos efectivos del backend para evitar accesos inconsistentes.

---

## 2. Estado actual de jardines / eventos

### 2.1 Modelos y esquemas backend relevantes

Archivo principal: `backend/models/schemas.py`.

1. **Propiedad (incluye jardines vs hoteles)**
   - `PropertyModel` (`type: "hotel" | "event_garden"`, `status`, `description`, `address`, `tenant_id`, `feature_toggles`).
   - `PropertyCreate` (mismas propiedades clave).
   - Esta es la pieza que diferencia **hoteles** de **jardines de eventos** a nivel de propiedad.

2. **Espacios de evento de jardín**
   - `EventSpaceModel`:
     - Campos: `id`, `property_id`, `space_name`, `capacity`, `status`, `description`, `price_per_event`, `created_at`.
     - Representa espacios individuales dentro de una propiedad de tipo `event_garden` (e.g. “Jardín Principal”).
   - `EventSpaceCreate` (misma estructura sin campos calculados).

3. **Espacios de evento dentro del hotel**
   - `HotelSpaceModel`:
     - Campos: `id`, `property_id`, `space_name`, `space_type`, `capacity`, `status`, `description`, `price_per_event`, `created_at`.
     - `space_type` cubre tipos como `salon`, `conference`, `rooftop`, `terrace`, `pool`, `general`.
   - `HotelSpaceCreate` (campos equivalentes).

4. **Reservas de eventos**
   - `EventBookingModel`:
     - Campos: `id`, `property_id`, `event_space_id`, `event_space_name`, `client_name`, `client_email`, `client_phone`, `event_date`, `event_type`, `attendees`, `total_price`, `booking_status`, `payment_status`, `notes`, `reservation_source`, `created_by`, `created_at`.
     - No referencia habitaciones ni huéspedes de hotel; representa exclusivamente la reserva del espacio de evento.
   - `EventBookingCreate` (entrada para crear nuevas reservas; incluye `property_id`, `event_space_id`, `event_type`, `attendees`, etc., pero **no** habitaciones).

5. **Reservas de habitaciones de hotel (pueden marcar si vienen de un evento)**
   - `ReservationModel`:
     - Campos relevantes: `guest_id`, `guest_name`, `room_id`, `room_number`, `check_in_date`, `check_out_date`, `status`, `total_amount`, `adults`, `children`, `notes`, `created_by`, `payment_status`, `payment_source`, `reservation_source`, `event_name`, `property_id`, `property_type`.
     - `event_name: Optional[str]` permite etiquetar una reserva de habitación como asociada a un evento, pero **no** vincula a `EventBookingModel` ni a un `event_space_id`.
   - `ReservationCreate` (no incluye `event_name`; esa etiqueta se usa sobre todo en reservas públicas con eventos).

6. **Habitaciones (hotel)**
   - `RoomModel`, `RoomCreate`, `RoomUpdate` representan habitaciones normales de hotel:
     - `id`, `number`, `type`, `floor`, `status` (`available`, `reserved`, `occupied`, etc.), `amenities`, `price_per_night`, `capacity`, `description`, `created_at`.
     - No hay ningún campo que vincule una habitación con un jardín o un espacio de evento (solo con `property_id` cuando se crean vía onboarding).

7. **Relación propiedades ↔ jardines / hoteles**
   - La lógica de onboarding en `backend/server.py` (función `/api/platform/onboard`) crea:
     - Para `property_type == "hotel"`: habitaciones de hotel (`rooms`) multipiso.
     - Para `property_type == "event_garden"`: **espacios de evento** (`EventSpaceModel`) usando `data["spaces"]`.
   - En `corporate_dashboard` y `properties_stats` se diferencia explícitamente entre:
     - `prop["type"] == "hotel"` → métricas basadas en `reservations`.
     - `prop["type"] == "event_garden"` → métricas basadas en `event_bookings`.

**Conclusión A1**:  
Ya existen modelos explícitos para **propiedades tipo jardín de eventos**, sus **espacios de evento** y las **reservas de eventos**, además de los modelos estándar de hotel (habitaciones y reservas de habitaciones). Sin embargo, no existe hoy un modelo que represente **habitaciones propias de un jardín** ni un enlace estructural entre una `EventBooking` y un conjunto de `Reservation` u otras habitaciones especiales.

---

### 2.2 Endpoints y routers relacionados con jardines / eventos

Archivo principal: `backend/server.py`.

1. **Propiedades (incluye tipo jardín/hotel)**
   - `GET /api/properties` → lista todas las propiedades (`PropertyModel`) sin filtro por tenant/propiedad en este endpoint.
   - `POST /api/properties` (`require_role("admin", "platform_admin")`) → crea nueva propiedad.
   - `PATCH /api/properties/{prop_id}` (`require_role("admin", "platform_admin")`) → actualiza datos de la propiedad (incl. `tenant_id`).
   - `DELETE /api/properties/{prop_id}` → elimina propiedad si no tiene reservas activas.
   - `GET /api/properties/stats` → devuelve estadísticas por propiedad; distingue hoteles (`type == "hotel"`) de jardines (`type == "event_garden"`).
   - `GET /api/properties/{prop_id}/features` / `PATCH /api/properties/{prop_id}/features` → feature toggles por propiedad (afecta módulos como inbox, tasks, reports, etc., no específicamente jardines).

2. **Espacios de evento (garden event spaces)**
   - `GET /api/event-spaces`:
     - Parámetro opcional `property_id`.
     - Devuelve documentos de `db.event_spaces`.
   - `POST /api/event-spaces` (`require_role("admin", "receptionist")`):
     - Crea un `EventSpaceModel` a partir de `EventSpaceCreate`.
   - `PATCH /api/event-spaces/{space_id}` (`require_role("admin", "receptionist")`):
     - Actualiza campos arbitrarios de un espacio de evento.
   - `DELETE /api/event-spaces/{space_id}` (`require_role("admin")`).
   - **Estado funcional**: no hay lógica placeholder; todos los endpoints realizan operaciones reales sobre Mongo (`insert_one`, `update_one`, `delete_one`, `find`).

3. **Espacios de evento de hotel (hotel event spaces)**
   - `GET /api/hotel-spaces`:
     - Parámetro opcional `property_id`; devuelve documentos de `db.hotel_spaces`.
   - `POST /api/hotel-spaces` (`require_role("admin", "manager")`).
   - `PATCH /api/hotel-spaces/{space_id}` (`require_role("admin", "manager")`).
   - `DELETE /api/hotel-spaces/{space_id}` (`require_role("admin", "manager")`).
   - **Estado funcional**: idéntico patrón a `event-spaces`, también 100% operativo.

4. **Reservas de eventos (compartidas entre jardines y hotel)**
   - `GET /api/event-bookings`:
     - Parámetro opcional `property_id`.
     - Devuelve `db.event_bookings` ordenadas por `event_date`.
   - `POST /api/event-bookings`:
     - Carga el espacio de evento desde `db.event_spaces` por `event_space_id` para obtener `event_space_name`.
     - Crea un `EventBookingModel` con `created_by=current_user.id`.
   - `PATCH /api/event-bookings/{booking_id}/status`:
     - Permite actualizar `booking_status`, `payment_status` y `notes`.
   - `DELETE /api/event-bookings/{booking_id}` (`require_role("admin", "receptionist")`).
   - **Estado funcional**:
     - Endpoints usados activamente por el frontend (`EventGarden.js` y `HotelEvents.js`).
     - No hay lógica parcial ni comentarios de “TODO”; la funcionalidad de CRUD de reservas está completa.

5. **Dashboard corporativo y métricas de jardines**
   - `GET /api/corporate/dashboard`:
     - Calcula métricas hotel vs jardines:
       - `hotel_*` (reservas, ocupación, revenue) a partir de `db.reservations`.
       - `event_gardens` (ingresos, número de eventos, pending payments, upcoming events) a partir de `db.event_bookings`.
     - `garden_score = calculate_garden_score(len(upcoming_events), event_pending_pay, len(event_bookings))` (`backend/services/scoring.py`).
     - Construye un ranking de propiedades donde se incluye una entrada “garden” (`type: "event_garden"`).
   - `GET /api/properties/stats`:
     - Para cada `PropertyModel`:
       - Si `type == "hotel"` → reservas y revenue basado en `db.reservations`.
       - Si `type == "event_garden"` → estadísticas con `db.event_bookings`.

6. **Reports / revenue breakdown (hoteles vs eventos)**
   - `GET /api/reports/revenue-breakdown`:
     - Trabaja exclusivamente sobre `reservations` y el campo `event_name` para distinguir ingresos de eventos vs hotel en el contexto de habitaciones; **no** mira `event_bookings`.
     - Complementa la visión de ingresos pero no enlaza directamente reservas de habitaciones y reservas de eventos estructuradas.

**Conclusión A2–A3 (endpoints y madurez)**:  
Los endpoints para **propiedades**, **espacios de evento** (jardín y hotel) y **reservas de eventos** están totalmente implementados y en uso por el frontend. No hay endpoints “sólo plantilla” para jardines; la funcionalidad es completa a nivel CRUD y métricas. Lo que **no existe** es lógica de negocio que:
- Bloquee o compute disponibilidad de habitaciones en función de reservas de eventos.
- Modele “habitaciones de jardín” o suites nupciales asociadas a un `EventBooking`.

---

### 2.3 Páginas / componentes frontend para jardines / eventos

Rutas principales definidas en `frontend/src/App.js`:

- `/jardines` → `EventGarden` (operación sobre un único jardín “Jardín de Amargati”).
- `/event-gardens` → `EventGardensOverview` (vista de grupo para todos los jardines).
- `/hotel-events` → `HotelEvents` (espacios y reservas de eventos internos del hotel).
- `/corporate` → `CorporateDashboard` (trae métricas hotel vs jardines).

Componentes clave:

1. **`EventGardensOverview` (`frontend/src/pages/EventGardensOverview.js`)**
   - Llama a `GET /api/properties/stats` y filtra `type === 'event_garden' && status !== 'inactive'`.
   - Muestra:
     - Jardines activos (`gardens.length`).
     - Ingresos del mes (`monthly_revenue` por jardín).
     - Eventos próximos (`upcoming_events`).
   - Cada tarjeta de jardín hace `navigate('/jardines')` → entra en la vista operacional del jardín.
   - **Funcionalidad real**: usa datos de backend, sin placeholders.

2. **`EventGarden` (`frontend/src/pages/EventGarden.js`)**
   - Usa `PropertyContext` para encontrar la propiedad de tipo `event_garden` (primer jardín).
   - Hace llamadas concurrentes a:
     - `GET /api/event-spaces?property_id={gardenProp.id}` → lista espacios del jardín.
     - `GET /api/event-bookings?property_id={gardenProp.id}` → lista reservas de eventos del jardín.
   - Funcionalidad para el usuario:
     - **KPI**: ingresos totales, eventos confirmados, próximos, cobros pendientes.
     - **Tabs**:
       - `Reservas`: tabla con filtros + acciones:
         - Crear reserva (modal `Nueva Reserva` → `POST /api/event-bookings`).
         - Cambiar estado (`booking_status`, `payment_status`) vía `PATCH /api/event-bookings/{id}/status`.
         - Eliminar reserva (`DELETE /api/event-bookings/{id}`) para admins.
         - Ver detalle de reserva (modal de detalle).
       - `Espacios`: tarjetas informativas de cada `event_space` (nombre, capacidad, precio, descripción).
       - `Calendario`: vista de calendario mensual que agrega reservas por día y permite abrir detalles.
   - **Qué puede hacer hoy el usuario en UI para jardines**:
     - Gestionar íntegramente la **agenda de eventos de un jardín**, incluyendo creación, actualización de estado y visualización de calendario.
     - Consultar y filtrar reservas por cliente o tipo de evento.

3. **`HotelEvents` (`frontend/src/pages/HotelEvents.js`)**
   - Usa `PropertyContext` para localizar la propiedad de tipo `hotel`.
   - Llama a:
     - `GET /api/hotel-spaces?property_id={hotelProp.id}` → espacios de eventos del hotel.
     - `GET /api/event-bookings?property_id={hotelProp.id}` → reservas de eventos asociadas al hotel.
   - Funcionalidad:
     - **Espacios tab**:
       - Crear/editar/borrar `hotel_spaces` (`POST /api/hotel-spaces`, `PATCH /api/hotel-spaces/{id}`, `DELETE /api/hotel-spaces/{id}`) para roles `admin`/`manager`.
       - Ver capacidad y precio por evento para cada espacio.
     - **Bookings tab**:
       - Crear reservas de evento para espacios de hotel (`POST /api/event-bookings`) con `property_id` del hotel.
       - Ver tabla con cliente, espacio, fecha, tipo, asistentes, precio y estado.
       - Borrar reservas de evento de hotel (`DELETE /api/event-bookings/{id}`) para `admin`/`manager`.

4. **`CorporateDashboard` (`frontend/src/pages/CorporateDashboard.js`)**
   - Consume `GET /api/corporate/dashboard`.
   - Presenta:
     - Métricas de grupo (ingresos totales, ingresos esperados, revenue proyectado).
     - Sección “event_gardens”: ingresos, bookings, pending payments, upcoming events, performance score.
     - Comparación de ingresos hotel vs jardines en el tiempo.
     - Ranking de propiedades (hotel vs jardín).
   - Rol de negocio: vínculo **estratégico** entre desempeño de hotel y jardines.

5. **`HotelsOverview` (`frontend/src/pages/HotelsOverview.js`)**
   - Similar a `EventGardensOverview` pero filtrando `type === 'hotel'`.
   - Permite ver a nivel de grupo la situación de los hoteles (ocupación, revenue).

**Conclusión A4–A5**:  
El frontend ofrece un set completo de vistas para:
- Gestionar **eventos en jardines** (`/jardines`) y ver su performance agregada (`/event-gardens`, `/corporate`).
- Gestionar **eventos internos del hotel** (`/hotel-events`).
Un usuario con los roles correctos puede:
- Crear y administrar espacios del jardín y del hotel.
- Crear, actualizar, consultar y eliminar reservas de eventos para ambos tipos de propiedad.
- Visualizar métricas de ingresos y volumen tanto a nivel propiedad como grupo.

---

### 2.4 Relaciones actuales entre reservas de evento y hotel / habitaciones

1. **Entre `EventBooking` y ocupación hotelera**
   - `corporate_dashboard` combina:
     - `reservations` para métricas de hotel (ocupación, revenue).
     - `event_bookings` para métricas de jardines (ingresos, número de eventos).
   - Sin embargo, **no hay ningún cálculo que derive ocupación hotelera desde reservas de eventos**:
     - No se suman asistentes de eventos para proyectar reservas de habitaciones.
     - No se marca ninguna relación tipo “un evento incrementa esperada ocupación del hotel”.

2. **Entre `EventBooking` y `Reservation` / `RoomModel`**
   - La única conexión indirecta es el campo `event_name` en `ReservationModel`/`PublicBookingCreate`:
     - En reservas públicas (`/public/booking/create`), se puede enviar `event_name` y se guarda en la reserva.
     - `GET /api/reports/revenue-breakdown` separa ingresos de reservas con `event_name` (event_revenue) vs sin `event_name` (hotel_revenue).
   - No existe:
     - Campo `event_booking_id` en `ReservationModel`.
     - Campo de enlace en `EventBookingModel` que liste `room_ids` o `reservation_ids`.
     - Campo en `RoomModel` que indique “habitación especial de jardín”.

3. **Jardín con sus propias habitaciones / habitaciones especiales (novia/familia)**
   - El modelo de datos actual no contempla:
     - Habitaciones definidas sobre `event_garden` (todas las habitaciones son de tipo hotel y se crean sobre propiedades `type == "hotel"`).
     - Propiedades de tipo `event_garden` con `rooms` asociadas en `db.rooms`.
     - Tipos de habitación específicos para jardines.
   - Cualquier habitación usada para novia/familia tendría que ser conceptualmente una habitación de hotel y se gestionaría con `ReservationModel`, `RoomModel` y las rutas de reservas estándar.

4. **Reservas públicas vs reservas de jardín**
   - `PublicBookingCreate` y endpoints `/api/public/*` están orientados a reservas **de habitaciones de hotel** (vía `find_available_room_of_type`).
   - No hay flujo público para reservar **eventos de jardín**; las reservas de eventos se crean desde la UI interna (`EventGarden`, `HotelEvents`) llamando a `/api/event-bookings`.

**Conclusión A6–A8**:  
- Hay una relación **analítica** entre ingresos por eventos y reservas de hotel (vía `event_name` y dashboards), pero no existe una modelación **operativa** que conecte directamente reservas de eventos con ocupación de habitaciones.
- No hay soporte actual para:
  - **Múltiples jardines con habitaciones propias**: sí hay múltiples jardines (`properties` con `type == "event_garden"`), pero sus “habitaciones” no existen aún; sólo tienen `event_spaces`.
  - **Habitaciones dedicadas a novia/novio/familia** a nivel de jardín.
  - Lógica que traduzca “N asistentes al evento” en “N habitaciones ocupadas” ni que haga block de habitaciones automáticamente.

---

### 2.5 Qué falta para soportar el caso de negocio propuesto

Caso de negocio deseado:
- Un jardín puede tener sus propias habitaciones.
- Algunas habitaciones están reservadas para novia/novio/familia.
- El resto de invitados puede alojarse en el hotel.
- Los eventos en jardines pueden incrementar la ocupación del hotel.

**Piezas que ya existen y se reutilizan:**
- Distinción clara entre **hoteles** y **jardines de eventos** (`PropertyModel.type`).
- Modelos y endpoints para:
  - Espacios de evento de jardín (`EventSpaceModel`, `/api/event-spaces`).
  - Espacios de evento de hotel (`HotelSpaceModel`, `/api/hotel-spaces`).
  - Reservas de eventos (`EventBookingModel`, `/api/event-bookings`).
- Dashboards que ya combinan métricas de hotel y jardines:
  - `GET /api/corporate/dashboard` + `CorporateDashboard`.
  - `GET /api/properties/stats` + `HotelsOverview` / `EventGardensOverview`.
- Lógica de reservas de hotel y cálculo de disponibilidad:
  - `ReservationModel`, `RoomModel`, `/api/reservations`, `/api/public/*`.

**Gaps concretos respecto al caso de negocio:**

1. **Modelo de “habitaciones de jardín”**
   - Falta:
     - Extendido de `RoomModel` o nuevo modelo que permita habitaciones asociadas a propiedades `type == "event_garden"`, potencialmente con tipos especiales (suite nupcial, habitación familia, etc.).
     - Campos para marcar habitaciones como “uso exclusivo de jardín” vs “compartidas con hotel”.

2. **Vínculo estructural entre un `EventBooking` y habitaciones / reservas**
   - Falta:
     - Campo en `EventBookingModel` que refiera explícitamente:
       - `event_room_ids` o `linked_reservation_ids`.
       - O un subdocument con asignaciones (e.g. `{ room_id, guest_id, role: "bride" | "groom" | "family" | "guest" }`).
     - Lógica de backend para:
       - Crear automáticamente reservas de habitación ligadas a una reserva de evento.
       - Asegurar consistencia (si se cancela el evento, qué pasa con las reservas de habitación asociadas).

3. **Clasificación de habitaciones especiales (novia / novio / familia)**
   - Falta:
     - Atributo a nivel `RoomModel` (o un submodelo) que marque una habitación como “especial de evento”.
     - O bien, un modelo adicional que configure por propiedad (hotel o jardín) qué habitaciones se reservan siempre para eventos.

4. **Lógica de demanda hotelera driven por eventos**
   - Falta:
     - Algoritmos o reglas que, al crear un `EventBooking`, sugieran o bloqueen un número de habitaciones en el hotel:
       - Proyección: `attendees / occupancy_per_room` → reservas esperadas.
       - Regla: siempre reservar X habitaciones para novia/familia + bloque opcional de habitaciones para invitados.
     - Métricas que conecten explícitamente: “N eventos → ∆ ocupación esperada / real del hotel”.

5. **UI para gestionar habitaciones de jardín y bloques de hotel vinculados**
   - Falta:
     - Secciones en `EventGarden` para:
       - Configurar habitaciones de jardín (si se modelan).
       - Ver y gestionar habitaciones asignadas a un evento (tanto de jardín como de hotel).
     - Secciones en `Reservations` o `HotelEvents` que muestren reservas de habitaciones asociadas a un evento específico.

**Respuesta A9 (resumen)**:  
El sistema ya distingue claramente jardines vs hoteles y tiene un modelo sólido para espacios de evento y reservas de eventos. Para soportar el caso de negocio propuesto se necesitarían, en fases posteriores:
- Un modelo explícito para **habitaciones de jardín** o una manera de etiquetar habitaciones de hotel como “habitaciones de jardín / especiales de evento”.
- Un vínculo estructural entre `EventBooking` y `Reservation`/`RoomModel` que permita:
  - Reservar habitaciones específicas para novia/novio/familia.
  - Asignar y bloquear bloques de habitaciones para invitados.
  - Hacer que las reservas de eventos impacten en la ocupación esperada y real del hotel.

---

## 3. Estado actual de accesos y roles

### 3.1 Roles definidos y módulos por defecto (backend)

Fuente principal: `backend/models/schemas.py` (`DEFAULT_ROLE_PERMISSIONS`) y documentación en `docs/permissions/product-model.md`.

Roles:
- `platform_admin`
- `admin` (hotel admin)
- `owner` (propietario)
- `manager`
- `receptionist`
- `housekeeping`
- `maintenance`
- `security`
- `restaurant`

Módulos por defecto (`DEFAULT_ROLE_PERMISSIONS`):

```python:backend/models/schemas.py
"platform_admin": ["platform_admin"],
"admin": ["dashboard", "reservations", "rooms", "guests", "jardines", "inbox", "tasks", "catalog", "reports", "staff", "properties"],
"owner": ["corporate", "hotels", "event-gardens", "reports"],
"manager": ["dashboard", "reservations", "rooms", "guests", "jardines", "hotel-events", "inbox", "tasks", "catalog", "reports", "staff", "room-types"],
"receptionist": ["dashboard", "reservations", "rooms", "guests", "jardines", "inbox", "tasks", "catalog"],
"housekeeping": ["inbox", "tasks"],
"maintenance": ["inbox", "tasks"],
"security": ["inbox", "tasks"],
"restaurant": ["inbox", "tasks"],
```

Notas:
- El módulo único de `platform_admin` es `platform_admin` (internamente se mapea a todas las secciones `/platform-admin/*`).
- `owner` es puramente estratégico: `corporate`, `hotels`, `event-gardens`, `reports`.
- `manager` tiene un set amplio (similar a admin pero **sin** `properties` y **con** `hotel-events` y `room-types`).
- Staff (`housekeeping`, `maintenance`, `security`, `restaurant`) sólo tienen `inbox` y `tasks`.

### 3.2 Módulos y rutas en frontend

Archivo de referencia: `frontend/src/utils/permissions.js` (`ROUTE_MODULE_MAP`, `getModuleForPath`, `canAccessRoute`, `getDefaultPathForRole`).

Mapa ruta → módulo:

- Plataforma (`platform_admin`):
  - `/platform-admin`, `/platform-admin/tenants`, `/platform-admin/propiedades`, `/platform-admin/permisos`, `/platform-admin/onboarding`, `/platform-admin/usuarios`, `/platform-admin/facturacion` → módulo `platform_admin`.
- Hotel / operación:
  - `/` → `dashboard`
  - `/reservations` → `reservations`
  - `/rooms` → `rooms`
  - `/guests` → `guests`
  - `/jardines` → `jardines`
  - `/hotel-events` → `hotel-events`
  - `/inbox` → `inbox`
  - `/tasks` → `tasks`
  - `/catalogo` → `catalog`
  - `/reports` → `reports`
  - `/staff` → `staff`
  - `/room-types` → `room-types`
  - `/properties` → `properties`
- Corporativo:
  - `/corporate` → `corporate`
  - `/hotels` → `hotels`
  - `/event-gardens` → `event-gardens`

Rutas públicas (sin módulo): `/catalogo`, `/reservar`, `/mi-reserva` (sólo chequeo de login si aplica).

Reglas frontend de acceso:
- `ProtectedRoute` (`App.js`) recibe `allowedRoles` y usa `canAccessRoute(user, pathname, allowedRoles)`:
  - Si el rol del usuario no está en `allowedRoles` (cuando se define) → acceso denegado.
  - Si la ruta tiene módulo y `user.modules` está presente y no vacío:
    - Sólo se permite abrir si el módulo de la ruta está en `user.modules`.

### 3.3 Roles vs rutas y módulos (por tipo de rol)

Esta sección combina:
- `DEFAULT_ROLE_PERMISSIONS` (backend).
- `ROUTE_MODULE_MAP` y `navItems` de `Layout.js`.
- `allowedRoles` en `App.js`.

#### 3.3.1 `platform_admin`

- **Módulos por defecto**: `["platform_admin"]`.
- **Rutas / páginas**:
  - Plataforma:
    - `/platform-admin` (Resumen).
    - `/platform-admin/tenants` → `TenantTab` (gestión de tenants, asignación de plan/estado).
    - `/platform-admin/propiedades` → `PropertiesTab` (lista propiedades, asignación de tenant, feature toggles por propiedad).
    - `/platform-admin/permisos` → `RolePermissionsTab` (plantillas de módulos por rol).
    - `/platform-admin/onboarding` → `OnboardingWizard` (creación de hoteles y jardines con seeds).
    - `/platform-admin/usuarios` → pestaña de usuarios (gestión multi-rol, incluyendo platform_admin y owner).
    - `/platform-admin/facturacion` → `BillingTab`.
  - Hoteles / jardines:
    - En `Layout.js`, `navItems` para `/corporate`, `/hotels`, `/event-gardens` están restringidos a roles `admin`, `owner` (no `platform_admin`), así que **platform_admin no ve** estos menús en la UI actual.
- **CRUD y capacidades**:
  - Tenants: `GET/POST/PATCH/DELETE /api/tenants*`.
  - Propiedades: `GET/POST/PATCH/DELETE /api/properties`, toggles de features.
  - Role permissions: `GET/PUT /api/role-permissions`.
  - Onboarding: `POST /api/platform/onboard` (crea propiedades, rooms/spaces y usuarios owner/admin).
  - Usuarios: `GET/POST/PUT/DELETE /api/users` con restricciones mínimas (puede borrar cualquiera).
  - Stats plataforma: `GET /api/platform/stats`.
- **Tipo de control de acceso**:
  - Backend: sólo `require_role("platform_admin")` para muchos endpoints de plataforma.
  - Frontend: rutas `/platform-admin/*` tienen `allowedRoles={['platform_admin']}` y módulo `platform_admin`.

#### 3.3.2 `admin` (hotel admin)

- **Módulos por defecto**:
  - `["dashboard", "reservations", "rooms", "guests", "jardines", "inbox", "tasks", "catalog", "reports", "staff", "properties"]`.
- **Rutas / páginas accesibles (App.js + Layout.js)**:
  - Operación hotel:
    - `/` → `Dashboard` (allowedRoles `['admin','receptionist','manager']` → admin OK, módulo `dashboard`).
    - `/reservations` → `Reservations` (allowedRoles `['admin','receptionist','manager']` → admin OK, módulo `reservations`).
    - `/rooms` → `Rooms` (módulo `rooms`).
    - `/guests` → `Guests` (módulo `guests`).
    - `/jardines` → `EventGarden` (módulo `jardines`).
    - `/hotel-events` → `HotelEvents` (módulo `hotel-events`; admin tiene indirectamente acceso vía `manager` route guard, aunque no esté en su lista de módulos por defecto; ver nota de inconsistencia abajo).
    - `/inbox` → `Inbox` (módulo `inbox`).
    - `/tasks` → `Tasks` (módulo `tasks`).
    - `/catalogo` → `RoomsCatalog` (módulo `catalog`).
    - `/reports` → `Reports` (allowedRoles `['admin','owner','manager']` → admin OK, módulo `reports`).
    - `/staff` → `Staff` (allowedRoles `['admin','platform_admin','manager']` → admin OK, módulo `staff`).
    - `/room-types` → `RoomTypes` (allowedRoles `['admin','manager']` → admin OK; módulo `room-types` **no está** en la lista de módulos por defecto de admin, pero sí lo puede abrir vía rol).
    - `/properties` → `PropertyManagement` (allowedRoles `['admin']` → sólo admin; módulo `properties`).
  - Corporativo:
    - `/corporate` → `CorporateDashboard` (allowedRoles `['admin','owner']`; módulo `corporate` forma parte de módulos del `owner`, no de `admin`, pero ruta permite admin).
    - `/hotels` → `HotelsOverview` (allowedRoles `['admin','owner']`; módulo `hotels` sólo en módulos del `owner`).
    - `/event-gardens` → `EventGardensOverview` (allowedRoles `['admin','owner']`; módulo `event-gardens` sólo en módulos del `owner`).
- **CRUD y capacidades**:
  - Puede crear usuarios de tipo `manager` y staff vía `POST /api/users` (restricciones en `routers/users.py`: admin no puede crear otros admin/owner/platform_admin).
  - Puede gestionar properties (`/api/properties`, excepto algunos campos restringidos).
  - Puede operar casi todo el módulo hotel (reservas, habitaciones, huéspedes, tareas, reportes, staff).
- **Tipo de control**:
  - Backend: `require_role("admin", ...)` en muchos endpoints (rooms, room-types, amenities, role-permissions lectura, properties).
  - Frontend: combinación de `allowedRoles` por ruta y `modules` efectivos.

#### 3.3.3 `owner`

- **Módulos por defecto**: `["corporate", "hotels", "event-gardens", "reports"]`.
- **Rutas**:
  - `/corporate` → Dashboard corporativo (módulo `corporate`).
  - `/hotels` → Vista de hoteles (módulo `hotels`).
  - `/event-gardens` → Vista de jardines (módulo `event-gardens`).
  - `/reports` → Reportes (allowedRoles incluye `owner`, módulo `reports`).
- **CRUD y capacidades**:
  - No se le permite crear/editar usuarios admin/owner/platform_admin; su rol es principalmente de visualización estratégica.
  - Backend endpoints de datos (reservas, propiedades) usan scope por `property_id`/`tenant_id`.
- **Acceso basado en**:
  - Backend: `require_role("admin", "owner")` en algunos endpoints de stats (`/corporate/dashboard`, `/tenants` GET).
  - Frontend: combinación de rol en `allowedRoles` y módulos efectivos.

#### 3.3.4 `manager`

- **Módulos por defecto**:
  - `["dashboard", "reservations", "rooms", "guests", "jardines", "hotel-events", "inbox", "tasks", "catalog", "reports", "staff", "room-types"]`.
- **Rutas**:
  - Sidebar (`Layout.js`) muestra:
    - `/`, `/reservations`, `/rooms`, `/guests`, `/jardines`, `/hotel-events`, `/inbox`, `/tasks`, `/catalogo`, `/reports`, `/staff`, `/room-types`.
  - `App.js`:
    - `allowedRoles` para `/`, `/reservations`, `/rooms`, `/guests` **incluye `manager`**.
    - `allowedRoles` para `/reports` **incluye `manager`** (ya corregido según docs).
    - `allowedRoles` para `/staff`, `/room-types`, `/hotel-events`, `/jardines`, `/inbox`, `/tasks` también incluyen `manager`.
- **CRUD y capacidades**:
  - Según `routers/users.py`, un `manager` puede:
    - Crear usuarios `manager` y staff (`MANAGER_ALLOWED = {"manager"} | STAFF_ROLES`).
    - No puede crear admin/owner/platform_admin.
    - Borrar usuarios de staff, no otros managers ni admins.
  - En `HotelEvents`, se considera `isAdmin = ['admin','manager'].includes(user.role)` para permitir crear/borrar espacios y reservas de eventos de hotel.
- **Tipo de control**:
  - Backend: muchos endpoints usan `require_role("admin", "platform_admin", "manager")` para crear/editar usuarios.
  - Frontend: rutas y módulos bastante alineados, salvo que `manager` no aparece en `ROLES_EDITABLE` del `RolePermissionsTab`, por lo que sus módulos por defecto no son editables vía UI de plataforma.

#### 3.3.5 `receptionist`

- **Módulos por defecto**:
  - `["dashboard", "reservations", "rooms", "guests", "jardines", "inbox", "tasks", "catalog"]`.
- **Rutas**:
  - Sidebar:
    - `/`, `/reservations`, `/rooms`, `/guests`, `/jardines`, `/inbox`, `/tasks`, `/catalogo`.
  - `App.js`:
    - `allowedRoles` para estas rutas incluyen `receptionist`.
    - No tiene acceso a `/reports`, `/staff`, `/room-types`, `/properties`, `/corporate`, `/hotels`, `/event-gardens`.
- **CRUD y capacidades**:
  - Reservas de habitaciones (`/reservations`):
    - Crear reservas (`POST /api/reservations`).
    - Hacer check-in/out, marcar pagos, cancelar.
  - Jardines:
    - En `EventGarden`, `isReceptionist = ['admin','receptionist'].includes(user.role)`:
      - Puede crear reservas de evento de jardín.
      - Puede cambiar estado de reservas (`booking_status`, `payment_status`).
      - Puede eliminar reservas si es `admin`; `receptionist` no ve botón de delete para bookings, pero sí para actualización de estado.
  - No puede crear/editar usuarios ni propiedades.

#### 3.3.6 Staff operacional (`housekeeping`, `maintenance`, `security`, `restaurant`)

- **Módulos por defecto**:
  - `["inbox", "tasks"]` para todos estos roles.
- **Rutas**:
  - Sidebar:
    - `/inbox` (mensajería interna).
    - `/tasks` (tareas asignadas).
  - No tienen acceso a dashboard, reservas, habitaciones, huéspedes, jardines, reportes, etc., salvo que se les otorguen permisos personalizados.
- **CRUD y capacidades**:
  - Dependientes de endpoints `/api/messages` y `/api/tasks` (routers separados).
  - No hay endpoints que les permitan modificar configuración global ni usuarios.

### 3.4 Naturaleza del control de acceso (rol vs módulos vs custom)

Resumen basado en `docs/permissions/product-model.md`, `backend/server.py` y `frontend/src/utils/permissions.js`:

- **Backend**:
  - Controla acceso API mediante:
    - `require_role("...")` (rol puro).
    - `_allowed_property_ids(current_user)` para filtrar datos por propiedad/tenant.
  - **No** utiliza explícitamente la lista de módulos (`modules`) para autorizar APIs; el concepto de módulo es puramente “qué módulos aparecen en la UI”.
- **Frontend**:
  - Usa:
    - `allowedRoles` en rutas (rol puro).
    - `user.modules` (efectivos) + `ROUTE_MODULE_MAP` para controlar:
      - Qué elementos se muestran en el sidebar.
      - Si el usuario puede abrir una ruta (cuando `user.modules` no está vacío).
- **custom_permissions**:
  - A nivel `UserModel` (`schemas.py` y `UserCreate/UserUpdate`).
  - `_sanitize_custom_permissions_for_role` en `routers/users.py`:
    - Ignora custom_permissions para `platform_admin` y staff base (homekeeping, etc.) para evitar “romper” el rol.
    - Para `owner` sólo permite módulos estratégicos (`corporate`, `hotels`, `event-gardens`, `reports`).
    - Para `manager` sólo permite módulos en su set por defecto.
  - `auth/me` y login (en `server.py`) devuelven **modules efectivos**:
    - Si `custom_permissions` no está vacío → se usan tal cual (con las restricciones anteriores).
    - Si está vacío → se usan los módulos para el rol desde `DEFAULT_ROLE_PERMISSIONS` + overrides guardados en `db.role_permissions`.

---

## 4. Piezas backend existentes (resumen)

- **Modelos Pydantic**:
  - `PropertyModel`, `PropertyCreate` (hotel vs event_garden).
  - `EventSpaceModel`, `EventSpaceCreate`.
  - `HotelSpaceModel`, `HotelSpaceCreate`.
  - `EventBookingModel`, `EventBookingCreate`.
  - `ReservationModel`, `ReservationCreate` (+ `event_name` como etiqueta opcional).
  - `RoomModel`, `RoomCreate`, `RoomUpdate`.
  - `RoomTypeModel`, `RoomTypeCreate`, `AmenityModel`, `AmenityCreate`.
  - `UserModel`, `UserCreate`, `UserUpdate`, `UserResponse`.
  - `TenantModel`, `TenantCreate`.
  - `TaskModel`, `TaskCreate`, `MessageModel`, `MessageCreate`.
  - `PublicBookingCreate`, `PendingBookingModel`, `PaymentTransactionModel`.
  - `DEFAULT_ROLE_PERMISSIONS`, `RolePermissionUpdate`, `LoginRequest`.

- **Endpoints clave**:
  - Jardines / eventos:
    - `/api/event-spaces` (CRUD).
    - `/api/hotel-spaces` (CRUD).
    - `/api/event-bookings` (CRUD de reservas de eventos).
    - `/api/properties`, `/api/properties/stats`, `/api/corporate/dashboard`, `/api/platform/onboard`.
  - Hotel / reservas habitaciones:
    - `/api/rooms`, `/api/reservations`, `/api/guests`, `/api/reports/*`, `/api/tasks`, `/api/messages`.
  - Plataforma:
    - `/api/tenants`, `/api/role-permissions`, `/api/platform/stats`, `/api/platform/onboard`.

---

## 5. Piezas frontend existentes (resumen)

- **Layout y navegación**:
  - `Layout.js`:
    - Define `navItems` con `roles` permitidos por ítem y los iconos/etiquetas.
    - Aplica filtro por rol (`roles.includes(user.role)`) y luego por módulos efectivos (`user.modules` + `getModuleForPath`).
    - Diferencia marca visual para plataforma (`STAYLO PLATFORM CONSOLE`) vs hotel (`ALMA HOSPITALITY SYSTEM`).
  - `App.js`:
    - Define todas las rutas y `allowedRoles` por ruta.
    - Usa `ProtectedRoute` + `canAccessRoute`.

- **Páginas de plataforma** (`PlatformAdmin.js`):
  - `TenantTab`: gestión CRUD de tenants; plan, estado, contacto.
  - `PropertiesTab`: propiedades (tipo hotel/jardín), asignación a tenants, toggles de módulos.
  - `RoomTypesTab`: catálogo de tipos de habitación y amenidades.
  - `RolePermissionsTab`: edición de módulos por rol (solo `admin`, `owner`, `receptionist`, `housekeeping`, `maintenance`, `security`, `restaurant`).
  - `OnboardingWizard`: alta guiada de propiedades `hotel` o `event_garden` con creación de rooms/spaces y usuarios owner/admin.
  - `BillingTab`: overview y control de estado de facturación por tenant.

- **Páginas hotel / operación**:
  - `Dashboard.js`: KPIs de ocupación, reservas, tareas, ingresos (`/api/reports/dashboard`).
  - `Reservations.js`: CRUD de reservas de habitaciones, checkin/out, cobro, filtros.
  - `Rooms.js`, `Guests.js`, `Tasks.js`, `Inbox.js`, `Reports.js`, `RoomsCatalog.js`.
  - `Staff.js`: gestión de personal (manager + staff), con soporte para `custom_permissions` en managers.
  - `RoomTypes.js`: gestión avanzada de tipos de habitación y amenidades (también accesible desde Platform Admin).
  - `PropertyManagement.js`: vista de propiedades a nivel hotel admin (no de plataforma).

- **Páginas jardines / eventos**:
  - `EventGardensOverview.js`: vista grupo de jardines.
  - `EventGarden.js`: operación diaria del jardín (reservas, espacios, calendario).
  - `HotelEvents.js`: espacios y reservas de eventos internos del hotel.
  - `CorporateDashboard.js`: visión grupo hotel + jardines.

- **Páginas públicas**:
  - `BookingWizard.js`, `BookingLookup.js`, `RoomsCatalog.js`: flujo de reservas públicas de habitaciones (hotel).

---

## 6. Gaps, inconsistencias y piezas faltantes

### 6.1 Inconsistencias rol ↔ módulos ↔ rutas

1. **Manager no editable en “Permisos” de plataforma**
   - `DEFAULT_ROLE_PERMISSIONS` define módulos específicos para `manager`.
   - `RolePermissionsTab` solo permite editar: `admin`, `owner`, `receptionist`, `housekeeping`, `maintenance`, `security`, `restaurant`.
   - **Efecto**: Los permisos de `manager` sólo se pueden cambiar via API directa (`PUT /role-permissions/manager`), no desde la UI de plataforma, aunque el modelo de permisos está preparado para ello.

2. **Diferencias entre módulos por rol y rutas permitidas**
   - Ejemplos:
     - `admin`:
       - Módulos: no incluyen `hotel-events`, `room-types`, `corporate`, `hotels`, `event-gardens`, pero:
         - Rutas `/hotel-events`, `/room-types`, `/corporate`, `/hotels`, `/event-gardens` sí permiten `admin` en `allowedRoles`.
       - Eso significa que un admin podría abrir esas páginas aunque el módulo no aparezca necesariamente en `user.modules` (según cómo se configuren overrides).
     - `manager`:
       - Módulos incluyen `reports`, `staff`, `room-types`, `hotel-events`, etc.
       - Rutas correspondientes sí permiten `manager`, lo cual está alineado, pero los `manager` no se pueden configurar desde `Permisos`.

3. **Catalog (`/catalogo`)**
   - Se mapea a módulo `catalog`.
   - Rutas: no tiene `allowedRoles`, así que cualquier usuario autenticado que pase los checks de `canAccessRoute` puede abrirlo.

4. **Backend vs frontend**
   - Backend **no valida módulos**; sólo roles y scope.
   - Por lo tanto:
     - Quitar un módulo a un rol en `Permisos` oculta el ítem de la UI, pero no impide que la ruta se abra directamente si `allowedRoles` del frontend permite ese rol y `canAccessRoute` no lo filtra por módulos (actualmente sí lo hace, pero depende de `user.modules`).

### 6.2 Gaps funcionales jardines / eventos vs habitaciones

Ya descritos en la sección 2.5, sintetizados aquí:

- No hay modelo para habitaciones específicas de jardín ni para marcar habitaciones especiales (novia/familia).
- No hay vínculo muchos-a-muchos entre `EventBooking` y reservas de habitaciones (`Reservation`).
- No hay mecánicas de bloqueo de habitaciones ni proyección de ocupación hotelera basadas en reservas de eventos.

### 6.3 Soporte para múltiples jardines y tipos de jardín

- **Múltiples jardines**:
  - Soportados a través de múltiples `PropertyModel` con `type == "event_garden"`.
  - `EventGardensOverview` y `properties/stats` ya manejan listas de jardines (no se limitan a uno).
- **Tipos de jardín**:
  - No hay un campo específico de “tipo de jardín” en `PropertyModel`; los tipos se manejan a nivel de `EventSpaceModel` (capacidad, descripción) y métricas.
  - Una implementación de tipos de jardín (“jardín boutique”, “hacienda”, etc.) requeriría campos adicionales.

---

## 7. Recomendaciones de siguiente orden de construcción

Sin implementar aún (solo recomendación de roadmap), y respetando las limitaciones de esta fase:

1. **Diseño de modelo para habitaciones especiales de jardín / evento**
   - Definir, a nivel de backend, cómo se representarán:
     - Habitaciones propias del jardín (asociadas a `PropertyModel` con `type == "event_garden"`).
     - Habitaciones especiales en el hotel dedicadas a eventos (novia, familia).
   - Decidir si esto se modela con:
     - Extensión de `RoomModel` (añadiendo campos de tipo de propiedad / categoría de evento).
     - O un nuevo modelo específico (`EventLodgingUnit`, por ejemplo) vinculado a `EventBooking`.

2. **Vínculo estructural entre `EventBooking` y reservas de alojamiento**
   - Añadir (en iteraciones futuras) un diseño de campos que permita:
     - Relacionar explícitamente `EventBooking.id` con una lista de `Reservation.id` u otro objeto que agrupe las habitaciones asociadas al evento.
     - Incluir etiquetas de tipo de uso: `bride_suite`, `family_room`, `guest_block`, etc.
   - Extender `CorporateDashboard` y `reports` para mostrar:
     - Cuántas habitaciones están vinculadas a eventos en un periodo dado.
     - Ingresos cruzados por evento (espacio + hospedaje).

3. **UI operacional para bloques de habitaciones por evento**
   - En `EventGarden`:
     - Añadir (en una fase posterior) subsecciones para:
       - Ver y gestionar el bloque de habitaciones asociadas a cada evento (tanto de jardín como de hotel).
       - Marcar qué habitaciones están reservadas para novia/familia.
   - En `Reservations`:
     - Enriquecer el uso de `event_name` o introducir un selector de `EventBooking` al crear reservas de huéspedes invitados a un evento.

4. **Alineación completa de permisos manager / admin con la consola de “Permisos”**
   - Extender `RolePermissionsTab` para incluir `manager` (y opcionalmente `platform_admin` como sólo lectura o con advertencias).
   - Verificar que las rutas en `App.js` usen `allowedRoles` consistentes con los módulos por defecto de cada rol:
     - En particular, revisar:
       - `hotel-events`, `room-types`, `corporate`, `hotels`, `event-gardens` para `admin` vs `owner`.

5. **Refinamiento de relación eventos ↔ ocupación hotelera**
   - En futuras iteraciones, aprovechar ya las métricas de `corporate_dashboard` para:
     - Mostrar explícitamente cómo la agenda de eventos correlaciona con ocupación e ingresos de habitaciones.
     - Añadir filtros / gráficos específicos de “event-driven demand”.

Estas recomendaciones se basan exclusivamente en el estado actual del código y la documentación existente, sin cambios en lógica ni nuevas features en esta fase.  


## 1. Executive summary

Event gardens en STAYLO no deberían sentirse como “otro hotel”: requieren su propio modelo operativo, lenguaje y responsabilidades.  
La recomendación es introducir **roles específicos de jardín** (`garden_admin`, `garden_manager`, `garden_sales`, `garden_reception`, `garden_staff`) que:

- Se apoyan en la arquitectura actual (roles + módulos + custom_permissions).
- Mantienen **owner** como rol estratégico/corporativo unificado para grupo (hotel + jardines).
- Usan un **set de módulos orientados a eventos** (garden dashboard, bookings, spaces, lodging integration, guest list, sales, inbox, tasks, reports, staff).
- Pueden ser configurados desde Platform Admin > Permisos como una “familia de roles garden” claramente separada de roles hotel.

La implementación se recomienda en 3 fases:
1. **Fase 1**: definir roles garden + plantillas de permisos (sin grandes cambios de UI).
2. **Fase 2**: navegación y contexto de usuario para operación de jardín (branding, landing diferente, vistas propias).
3. **Fase 3**: wizard de onboarding de jardín + módulos avanzados (leads, paquetes, invitaciones, etc.).

---

## 2. Recommended garden roles

### A) ROLE DESIGN

### A1. ¿Roles totalmente nuevos o mapeados sobre los actuales?

**Recomendación:** crear **roles nuevos específicos de jardín**, no sobrecargar los roles hotel.

Propuesta de nuevos valores de `role`:
- `garden_admin`
- `garden_manager`
- `garden_sales`
- `garden_reception`
- `garden_staff`

Motivos:
- Evitar mezclar semántica hotelera (`receptionist`, `housekeeping`, …) con operación de eventos (leads, invitaciones, montaje).
- Facilitar métricas y autorización claras por tipo de operación (hotel vs jardín).
- Preparar el producto a que haya propiedades sólo jardín, sólo hotel o mixtas.

Relación con roles actuales:
- `platform_admin`: sigue siendo plataforma.
- `owner`: se mantiene como rol corporativo que ve **ambos**: hoteles y jardines.
- `admin` / `manager` / `receptionist` / `housekeeping` / etc.: se mantienen para operación hotelera.

Se podría permitir que un usuario tenga:
- rol `garden_*` + `property_id` de un jardín, o
- rol hotel (`admin`, `manager`, etc.) + propiedad tipo hotel.

En una evolución futura se podría considerar multi-role por usuario, pero no es necesario aún para el diseño.

---

### A2. Permisos / módulos por rol de jardín

Basado en los módulos garden propuestos (ver sección 3) y en la arquitectura de módulos actual (`DEFAULT_ROLE_PERMISSIONS` + `role_permissions`), se sugiere:

#### `garden_admin`
- Enfocado a: configuración completa del jardín, operación diaria, staff y visión financiera básica.
- Módulos garden:
  - `garden_dashboard`
  - `garden_event_bookings`
  - `garden_event_spaces`
  - `garden_lodging_integration`
  - `garden_guest_list`
  - `garden_sales`
  - `inbox`
  - `tasks`
  - `staff`
  - `reports`
- Módulos corporativos (heredados según diseño actual, vía owner/admin o custom):
  - Normalmente no se le daría acceso a `corporate` / `hotels` / `event-gardens` (eso es de `owner`),
  - pero sí podría ver `event-gardens` si se desea (opcional vía custom_permissions).

#### `garden_manager`
- Enfocado a: ejecución y calendarización diaria.
- Módulos garden:
  - `garden_dashboard`
  - `garden_event_bookings`
  - `garden_event_spaces`
  - `garden_lodging_integration`
  - `garden_guest_list`
  - `inbox`
  - `tasks`
  - `reports` (solo operativos / resumen jardín, no facturación detallada).
  - (Opcional) `staff` para ver equipo y su carga, sin acceso a crear usuarios.

#### `garden_sales`
- Enfocado a: leads, cotizaciones, funnel de venta, pipeline de eventos.
- Módulos garden:
  - `garden_dashboard` (vista KPI de funnel).
  - `garden_sales` (leads, cotizaciones, pipeline).
  - `garden_event_bookings` (sólo lectura o edición limitada sobre estado de venta).
  - `inbox`
  - `tasks`
  - (Opcional) `reports` filtrados a ventas (conversiones, pipeline).

#### `garden_reception`
- Enfocado a: check-in de invitados y control de acceso el día del evento (tablet/teléfono).
- Módulos garden:
  - `garden_guest_list` (modo “evento de hoy” / “evento seleccionado”).
  - `garden_event_bookings` (sólo lectura, para conocer detalles).
  - `inbox`
  - `tasks`
  - (Opcional y más adelante) `garden_lodging_integration` en modo lectura (para saber qué habitaciones están asignadas al evento).

#### `garden_staff`
- Enfocado a: ejecución operativa (montaje, catering, limpieza post-evento, etc.).
- Módulos garden:
  - `inbox`
  - `tasks`
- Nada más por defecto. Igual que roles staff hotel, pero orientados a tareas relacionadas con eventos.

---

### A3. Reutilización vs separación con roles hotel

**Reutilizar:**
- Patrón de staff: `garden_staff` se comporta análogamente a `housekeeping` / `maintenance` / `security` / `restaurant`:
  - Sólo `inbox` + `tasks` por defecto.
- Owner (propietario) como visión estratégica: `owner` ve dashboards corporativos que ya incluyen métricas de jardines (`corporate`, `event-gardens`, `reports`).

**Mantener separados:**
- Roles de operación diaria hotel (`admin`, `manager`, `receptionist`) no deberían usarse para operar jardines:
  - Los flujos de reservas hotel vs reservas de eventos son diferentes.
  - El lenguaje y KPIs son distintos.

Sin embargo, a nivel producto se puede permitir:
- Que un mismo humano tenga dos cuentas (hotel y jardín) o
- A futuro, multi-role + context switching (no requerido para este diseño).

---

### A4. Visibilidad en Platform Admin > Permisos

**Recomendación:**  
Sí, los roles garden deben ser visibles y editables en Platform Admin > Permisos, como una segunda sección clara:

- Sección “Roles Hotel” (actual: admin, owner, manager, receptionist, housekeeping, maintenance, security, restaurant).
- Sección “Roles Jardín” (nuevo: garden_admin, garden_manager, garden_sales, garden_reception, garden_staff).

Reglas sugeridas:
- `platform_admin` edita plantillas para ambos grupos.
- Hotel admins y garden admins **no** editan las plantillas de rol global (sólo per-user custom_permissions).

Esto mantiene el modelo actual (Permisos = plantillas por rol) pero añade claridad visual de que hay “familia hotel” y “familia jardín”.

---

## 3. Recommended module matrix

### B) MODULE DESIGN

Propuesta de módulos garden (clave → descripción):

- `garden_dashboard`: vista de resumen operacional del jardín (eventos próximos, ingresos, ocupación de agenda, tareas críticas).
- `garden_event_bookings`: gestión de reservas de eventos del jardín (ya existe backend de `event_bookings`, sería vista especializada por propiedad tipo jardín).
- `garden_event_spaces`: gestión de espacios físicos del jardín (salones, áreas del jardín, capilla, etc.) basados en `event_spaces`.
- `garden_lodging_integration`: integración de habitaciones (del hotel o del propio jardín) con eventos (Phase 1 ya iniciada).
- `garden_guest_list`: gestión de invitados / listas, check-in, pases, códigos QR (futuro).
- `garden_sales`: leads, cotizaciones, seguimiento comercial, pipeline.
- `inbox`: mensajería interna (reutilizada).
- `tasks`: tareas operativas (reutilizada).
- `reports`: reportes de jardín (ingresos, pipeline, eficiencia operativa).
- `staff`: gestión de personal de jardín (creación/edición de usuarios garden_*).

### B2. Matriz módulos × roles

| Módulo                    | garden_admin | garden_manager | garden_sales | garden_reception | garden_staff |
|---------------------------|--------------|----------------|--------------|------------------|--------------|
| `garden_dashboard`        | ✓            | ✓              | ✓ (resumen)  | —                | —            |
| `garden_event_bookings`   | ✓ (full)     | ✓ (full)       | ✓ (lectura/estado venta) | lectura       | —            |
| `garden_event_spaces`     | ✓ (CRUD)     | ✓ (CRUD básico)| lectura      | —                | —            |
| `garden_lodging_integration` | ✓ (config) | ✓ (config limitada) | lectura | lectura opcional | —        |
| `garden_guest_list`       | ✓            | ✓              | lectura      | ✓ (operación)    | —            |
| `garden_sales`            | ✓            | lectura        | ✓ (full)     | —                | —            |
| `inbox`                   | ✓            | ✓              | ✓            | ✓                | ✓            |
| `tasks`                   | ✓            | ✓              | ✓ (comerciales) | ✓             | ✓            |
| `reports`                 | ✓ (completos)| ✓ (operativos) | ✓ (ventas)   | —                | —            |
| `staff`                   | ✓ (gestión)  | lectura        | —            | —                | —            |

Notas:
- Se puede reutilizar `inbox` y `tasks` tal como hoy, sólo filtrando/etiquetando por propiedad de tipo jardín.
- `garden_lodging_integration` puede inicialmente ser sólo visible para `garden_admin` y `garden_manager` (Phase 1) y opcionalmente lectura para otros en fases siguientes.

---

## 4. Suggested UX differences vs hotel

### C) USER EXPERIENCE

### C1. Diferencias clave en experiencia de usuario jardín vs hotel

1. **Lenguaje y foco**  
   - Hotel: “habitaciones, huéspedes, reservas, check-in/out, ocupación, RevPAR”.  
   - Jardín: “eventos, clientes, invitados, montaje, agenda, paquetes, leads”.
2. **Prima de calendario vs inventario**  
   - En hotel, la vista principal es ocupación de habitaciones.  
   - En jardín, la vista principal debe ser **agenda de eventos** (por fecha y espacio).
3. **Un día típico de trabajo**  
   - Hotel admin/noche: revisar llegadas/salidas, pagos, limpieza.  
   - Garden manager: ver lista de eventos del fin de semana, verificar espacios asignados, leads calientes, listas de invitados y bloqueos de habitaciones.

En la práctica, esto se traduce en:
- **Landing distinta** tras login:
  - Hotel roles: Dashboard hotel actual.
  - Garden roles: Garden dashboard (lista de eventos próximos, tareas de montaje, leads recientes).
- Terminología distinta en UI (ej. “Eventos de Jardín” en vez de “Reservas”).

---

### C2. ¿Debe el login de garden admin sentirse como contexto separado?

**Sí, pero sin romper la arquitectura actual.**

Propuesta:
- Mantener una única pantalla de login.
- Tras login:
  - Si `role` ∈ familia hotel → redirigir a `/` (dashboard hotel) como hoy.
  - Si `role` ∈ familia jardín (`garden_*`) → redirigir a, por ejemplo, `/garden` o `/event-gardens` con un layout que refleje la marca del jardín.
- `owner` sigue yendo a `/corporate`.

A nivel frontend:
- `Layout` podría:
  - Cambiar branding/logo si usuario está en contexto jardín vs hotel.
  - Mostrar un selector de propiedad donde cuando el usuario es `garden_*` el default sea el jardín.

---

### C3. Identidad visual y contexto de navegación

Objetivo: que un usuario de jardín se sienta en “el sistema del jardín” aunque sea el mismo STAYLO.

Sugerencias:
- En Layout:
  - Para jardín: mostrar nombre del jardín como título principal (e.g. “Jardín de Amargati”) y subtítulo “EVENTS CONSOLE”.
  - Para hotel: mantener branding actual “alma HOTEL BOUTIQUE”.
- Barra superior:
  - Mostrar propiedad seleccionada; si es tipo `event_garden`, usar icono y color distinto (ej. Sparkles, violeta).
- Navegación lateral:
  - Agrupar módulos en secciones “Eventos” (bookings, spaces, guest list) y “Operación” (tasks, inbox, lodging).
- Colores:
  - Mantener paleta base STAYLO pero con ligeras variaciones en acentos para jardín (más verdes/violetas).

Todo esto puede hacerse sólo con config de UI y sin cambiar el modelo de datos.

---

## 5. Future onboarding design for gardens

### D) ONBOARDING / WIZARD FUTURE DESIGN

El wizard de onboarding para un jardín debería ser paralelo al actual de hoteles, pero con pasos orientados a eventos.

Propuesta de pasos:

1. **Identidad del jardín**
   - Nombre del jardín.
   - Dirección / ubicación.
   - Tipo: `event_garden` (con posibles subtipos futuros: hacienda, salón urbano, etc.).
   - Tenant al que pertenece (como hoy).

2. **Espacios de evento**
   - Crear una lista de `event_spaces`:
     - Nombre (e.g. Jardín Principal, Terraza, Capilla).
     - Capacidad.
     - Uso típico (ceremonia, coctel, banquete).
     - Precio base por evento.

3. **Habitaciones del jardín (opcional)**
   - Pregunta: “¿Este jardín tiene habitaciones propias?”
   - Si sí:
     - Cantidad aproximada.
     - Clasificación de cada tipo:
       - `preparation_only` (vestidores, salón de novia).
       - `overnight` (habitaciones para quedarse).
       - `hybrid` (puede usarse para preparación y pernocta).
   - Esto se puede mapear a:
     - `rooms` asociados a una propiedad `type = event_garden`, o
     - Un futuro modelo específico si decides separar inventario.

4. **Lógica de paquetes básicos**
   - Pregunta simple (no implementar lógica compleja todavía):
     - “¿Ofreces paquetes estándar?” (Sí/No).
     - Si Sí:
       - Nombres y descripciones de 2–3 paquetes (Classic, Premium, etc.) con nota libre (para uso en ventas).

5. **Usuarios iniciales**
   - Crear usuarios garden:
     - 1 `garden_admin` (obligatorio).
     - Opcional: `garden_manager`, `garden_sales`.
   - Asignarles email, password inicial y property_id del jardín.

6. **Revisión y confirmación**
   - Resumen con:
     - nombre y tipo de propiedad,
     - espacios configurados,
     - si tiene habitaciones o no,
     - usuarios creados.

En Fase 3 este wizard se implementaría sobre el endpoint existente de `platform/onboard` o un endpoint paralelo especializado para jardines.

---

## 6. Recommended phased roadmap

### E) IMPLEMENTATION STRATEGY

### Phase 1 — Roles + permisos (bajo riesgo)

Objetivo: tener el modelo conceptual listo sin romper flujos actuales.

Incluye:
- Añadir roles `garden_admin`, `garden_manager`, `garden_sales`, `garden_reception`, `garden_staff` a:
  - `UserModel.role` y validaciones.
  - `DEFAULT_ROLE_PERMISSIONS` con módulos garden propuestos (aunque los módulos puedan inicialmente apuntar a vistas existentes o placeholders simples).
- Hacer visibles estos roles en Platform Admin > Permisos:
  - Nueva sección “Roles Jardín” en la UI, pero sin grandes cambios a rutas.
- Sin cambios agresivos en Layout/App.js aún; se puede mapear garden roles a rutas existentes (ej. `event-gardens`, `EventGarden` actual) como transición.

Riesgo: bajo. Impacto inmediato: capacidad de crear usuarios garden con permisos más ajustados, aunque la UI sea parcialmente compartida.

---

### Phase 2 — Garden users + navigation context

Objetivo: separar claramente experiencia jardín vs hotel.

Incluye:
- Ajustar `getDefaultPathForRole`:
  - `garden_admin`, `garden_manager`, `garden_sales`, `garden_reception`, `garden_staff` → nueva ruta base (ej. `/garden` o `/event-gardens`).
- Ajustar `Layout`:
  - Branding condicional según tipo de rol / propiedad actual.
  - Menú lateral filtrado por módulos garden para roles garden.
- Opcionalmente, una vista `GardenDashboard` específica, reutilizando datos actuales de `properties/stats` y `event_bookings`.

Riesgo: medio-bajo. Cambia navegación para nuevos roles, sin tocar flujos existentes de hotel.

---

### Phase 3 — Wizard + módulos avanzados

Objetivo: experiencia completa y diferenciada de operación de jardín.

Incluye:
- Implementar wizard de onboarding de jardines (nuevo o extendiendo `platform/onboard`):
  - pasos de nombre, espacios, habitaciones, paquetes, usuarios.
- Módulos especializados:
  - `garden_sales`: leads, cotizaciones, pipeline.
  - `garden_guest_list`: gestión de invitados y check-in.
  - Extensiones a `garden_lodging_integration` (más allá del MVP actual).
- Reportes garden:
  - panel de eventos, ingresos por evento, performance de paquetes, conversión de leads.

Riesgo: medio, pero contenido en nuevas pantallas y endpoints. El modelo de permisos ya estará listo por Fase 1–2, lo que reduce sorpresas.

---

## 7. Cierre

La arquitectura propuesta mantiene:

- **Compatibilidad con STAYLO actual** (roles + módulos + custom_permissions).
- Separación conceptual clara entre:
  - roles hotel,
  - roles jardín,
  - rol `owner` estratégico,
  - `platform_admin` como superusuario de permisos.

Al avanzar de forma incremental (primero roles y permisos, luego UX/contexto, luego wizard y módulos avanzados), se minimiza el riesgo y se habilita una historia de producto convincente para jardines de eventos sin bloquear la operación hotelera actual.  

---

## 8. Phase 2 – Garden navigation context & UX (detalle de implementación segura)

Esta sección desarrolla con más detalle **Phase 2**: cómo cambiar rutas, landings y Layout para usuarios de jardines sin romper los flujos actuales de hotel.

### 8.1 Estrategia de routing / navegación para roles de jardín

Roles garden:
- `garden_admin`
- `garden_manager`
- `garden_sales`
- `garden_reception`
- `garden_staff`

Objetivo UX:
- Que, tras login, estos roles caigan en una experiencia centrada en **jardines**, no en hotel.
- Sin romper rutas existentes ni la experiencia de hotel.

#### 8.1.1 Estrategia recomendada (mínima y segura)

1. **No crear nuevas rutas base completamente separadas aún**  
   - Aprovechar rutas ya existentes:
     - `/event-gardens` → hoy `EventGardensOverview` (vista de jardines a nivel grupo).
     - `/jardines` → hoy `EventGarden` (gestión operativa del jardín de Amargati).
   - En Phase 2, usarlas como landings “de jardín” mientras se preparan vistas más específicas a futuro.

2. **Usar la lógica ya existente de `getDefaultPathForRole`**  
   - Extenderla para roles garden:
     - `garden_admin`, `garden_manager`, `garden_sales`, `garden_reception`, `garden_staff` → `/event-gardens` o `/jardines`, según tipo de rol (ver 8.2).
   - Esto evita cambios directos en el router y aprovecha la redirección central que ya se usa para `owner` y `platform_admin`.

3. **No cambiar `allowedRoles` en rutas existentes todavía**  
   - En esta fase, garden roles pueden seguir sin acceso a rutas muy hoteleras (rooms, reservations, guests, etc.).
   - Sólo se añadirían a `allowedRoles` de aquellas rutas que se vayan a reutilizar para jardines:
     - `/event-gardens`
     - `/jardines`
     - `/inbox`
     - `/tasks`
     - `/reports` (lectura)

4. **Apoyarse en `modules` para limitar qué módulos garden realmente ven en el sidebar**  
   - Los roles garden sólo verán módulos garden + `inbox`, `tasks`, `reports`, `staff` según su plantilla.
   - Aunque una ruta permita el rol (`allowedRoles`), si el módulo no está en `user.modules`:
     - `canAccessRoute` negará el acceso.

Esto permite introducir experiencia jardín gradual sin duplicar toda la navegación.

---

### 8.2 Default landing paths por rol de jardín

Usando `getDefaultPathForRole(role)` en `frontend/src/utils/permissions.js`, se propone:

- `garden_admin`:
  - **Default**: `/event-gardens`
  - Razonamiento: vista de grupo de jardines, con métricas por propiedad; desde ahí puede entrar a `/jardines` (operación).

- `garden_manager`:
  - **Default**: `/jardines`
  - Razonamiento: foco en operación diaria del jardín específico (events, calendar, hospedaje).

- `garden_sales`:
  - **Default**: `/event-gardens`
  - Razonamiento: vista agregada de performance de jardines, base futura para módulo `garden_sales`. En Phase 2 se usaría principalmente para ver la lista y entrar a eventos.

- `garden_reception`:
  - **Default**: `/jardines`
  - Razonamiento: lista de eventos de jardín y acceso futuro a guest-list; se asemeja a un “panel de check-in”.

- `garden_staff`:
  - **Default**: `/tasks`
  - Razonamiento: igual que staff hotel, su día gira alrededor de tareas. Más adelante se podrían filtrar tareas por jardín.

Estos cambios son locales a una función (`getDefaultPathForRole`) y no afectan a otros roles.

---

### 8.3 Cambios recomendados en Layout para roles garden

Objetivo: que Layout (sidebar + topbar) refleje que estás en “modo Jardín” cuando el rol es `garden_*`.

#### 8.3.1 Branding

- **Hotel (como hoy)**:
  - Logo “alma HOTEL BOUTIQUE”.
  - Paleta cálida (marrones, dorados).
- **Jardín (propuesto Phase 2)**:
  - Mini-logo textual o icono tipo “Sparkles / árbol” + nombre del jardín:
    - Ej: “Jardín de Amargati — EVENTS CONSOLE”.
  - Subtítulo pequeño: “EVENT GARDEN OPERATIONS”.
  - Mantener la paleta general pero con acentos más verdes/violetas (reutilizando clases Tailwind existentes).

Implementación segura:
- En `Layout.js`, detectar `user.role` ∈ familia garden (`garden_*`) y cambiar:
  - Bloque de branding superior (texto y pequeño icono).
  - Subtítulo bajo el nombre.
  - (Opcional) etiqueta en el footer (“STAYLO — Event Gardens”).

No es necesario duplicar Layout; sólo condicionar textos y pequeños estilos.

#### 8.3.2 Contexto de propiedad

Hoy:
- `PropertyContext` lista propiedades y permite seleccionar; admin hotel usa selector en la topbar.

Phase 2 para jardín:
- Si el usuario es `garden_*` y tiene `property_id` asignado a un jardín:
  - Mostrar el **nombre de ese jardín** fijo en la topbar (sin selector de hoteles).
- Si el usuario es garden_admin sin propiedad específica:
  - Mantener comportamiento actual (selector, si aplica), pero resaltando cuando la propiedad seleccionada es de tipo `event_garden`.

Esto se puede hacer sin cambiar APIs:
- La topbar ya recibe `properties` y `selectedProperty`; sólo hay que condicionar el renderizado para roles garden.

#### 8.3.3 Secciones de menú

En Phase 2, cambios mínimos:

- Para roles `garden_*`:
  - Sidebar debería mostrar sólo:
    - `event-gardens` (vista de grupo).
    - `jardines` (gestión operativa).
    - `inbox`
    - `tasks`
    - `reports` (según módulo).
    - `staff` (para `garden_admin` / `garden_manager` si se decide así).
- No es necesario crear nuevos ítems aún para `garden_dashboard` etc.; se pueden mapear módulos garden a rutas existentes (ver 8.4).

Visualmente:
- Se pueden agrupar secciones con subtítulos pequeños:
  - “Eventos” → `/event-gardens`, `/jardines`.
  - “Operación” → `/inbox`, `/tasks`, `/reports`, `/staff`.

Esto se controla desde la config de `navItems` de `Layout.js`, sin tocar el router.

---

### 8.4 Mapeo módulo → ruta para roles garden (Phase 2, seguro)

Objetivo: aunque algunos módulos garden aún no tengan su propia página, hay que mapearlos a rutas útiles desde ya, para:
- No dejar módulos “huérfanos” en Permisos.
- Permitir un comportamiento razonable sin crear páginas nuevas todavía.

Propuesta de mapping Phase 2:

| Módulo garden                 | Ruta temporal recomendada         | Comentario |
|------------------------------|------------------------------------|-----------|
| `garden_dashboard`           | `/event-gardens`                  | Vista agregada de jardines (ya existe). |
| `garden_event_bookings`      | `/jardines`                       | `EventGarden` gestiona reservas de eventos de jardín. |
| `garden_event_spaces`        | `/jardines` (tab “Espacios”)      | Ya hay pestaña de espacios de evento. |
| `garden_lodging_integration` | `/jardines` (detalle evento)      | UI Fase 1 de hospedaje ligada a eventos ya existe. |
| `garden_guest_list`          | `/jardines` (futuro: sección de invitados) | En Phase 2 puede ser sólo concepto; la ruta ya es relevante. |
| `garden_sales`               | `/event-gardens`                  | Hasta que exista módulo específico de ventas, esta vista sirve como base. |

Módulos compartidos:
- `inbox` → `/inbox`
- `tasks` → `/tasks`
- `reports` → `/reports`
- `staff` → `/staff`

Importante:
- **No hace falta** que `ROUTE_MODULE_MAP` conozca todos los módulos garden aún; se puede ir introduciendo gradualmente:
  - Por ejemplo, `garden_event_bookings` y `garden_lodging_integration` pueden mapearse a `/jardines`.
  - `garden_dashboard` y `garden_sales` a `/event-gardens`.
- Mientras no haya mapping explícito, tener el módulo en `modules` no rompe nada; simplemente no afecta `canAccessRoute` para rutas sin ese módulo.

---

### 8.5 Reutilización de páginas existentes

En Phase 2, sin construir páginas nuevas, se propone reutilizar:

1. **`EventGardensOverview`** (`/event-gardens`)
   - Como “landing de grupo” para:
     - `garden_admin`
     - `garden_sales`
   - Muestra métricas por jardín: ingresos, eventos, pendientes, etc.

2. **`EventGarden`** (`/jardines`)
   - Como “panel operativo del jardín” para:
     - `garden_manager`
     - `garden_reception`
     - `garden_admin` (cuando entra al detalle).
   - Ya tiene:
     - tabla de reservas de eventos,
     - pestaña de espacios,
     - calendario,
     - UI de hospedaje Fase 1 en el detalle del evento.

3. **`HotelEvents`**
   - Mantenerlo principalmente para roles hotel (admin/manager hotel).
   - No es necesario exponerlo a roles garden en Phase 2 para no mezclar contextos.

4. **`Inbox`, `Tasks`, `Reports`, `Staff`**
   - Se reutilizan tal cual para roles garden, con:
     - filtros por propiedad (ya soportados en backend via `_allowed_property_ids`),
     - eventual etiquetado en UI cuando la propiedad es de tipo jardín.

De esta forma, Phase 2 no introduce nuevas páginas, sólo reinterpreta la navegación para roles garden.

---

### 8.6 Plan de implementación seguro (Phase 2)

Resumen de pasos, en orden recomendado:

1. **Actualizar `getDefaultPathForRole`** (frontend, `utils/permissions.js`)
   - Añadir casos para:
     - `garden_admin` → `/event-gardens`
     - `garden_manager` → `/jardines`
     - `garden_sales` → `/event-gardens`
     - `garden_reception` → `/jardines`
     - `garden_staff` → `/tasks`
   - Riesgo: muy bajo.

2. **Ajustar Layout para branding y contexto básico de jardín**
   - En `Layout.js`:
     - Detectar `user.role` ∈ familia garden.
     - Cambiar branding (texto/logo) y subtítulos.
     - Ajustar topbar para mostrar nombre del jardín si `selectedProperty` es tipo `event_garden`.
   - Sin tocar navItems ni lógica de módulos.
   - Riesgo: bajo; sólo cambia apariencia.

3. **Opcionalmente, ajustar `navItems` para roles garden**
   - Limitar qué ítems aparecen cuando el rol es garden (ej. no mostrar `/rooms`, `/reservations`).
   - Esto se puede hacer filtrando por `roles` en cada `navItem` (añadiendo `garden_*` en los que apliquen, omitiéndolos en otros).
   - Riesgo: medio-bajo; si se hace incremental, se puede empezar sólo con `/event-gardens`, `/jardines`, `/inbox`, `/tasks`, `/reports`, `/staff`.

4. **Introducir mapping básico módulo→ruta para garden**
   - Ampliar `ROUTE_MODULE_MAP` con:
     - `/event-gardens` → `garden_dashboard` y/o `garden_sales`.
     - `/jardines` → `garden_event_bookings` y `garden_lodging_integration`.
   - Mantener módulos hotel existentes como están.
   - Riesgo: bajo; sólo afecta visibilidad de sidebar y `canAccessRoute`.

5. **Validar end-to-end con un par de usuarios garden de prueba**
   - Crear usuarios:
     - `garden_admin` con propiedad de tipo jardín.
     - `garden_manager` con la misma propiedad.
   - Verificar:
     - redirección tras login,
     - branding de Layout,
     - módulos visibles en sidebar,
     - acceso a `/event-gardens`, `/jardines`, `/inbox`, `/tasks`, `/reports`.

6. **Dejar Phase 3 (wizard + advanced sales) para más adelante**
   - No introducir componentes nuevos ni lógicas complejas en esta fase.

Con este plan, Phase 2 consigue que:
- Un usuario de jardín se sienta en un contexto diferente al hotel,
- Sin reescribir rutas, sin crear nuevas APIs y sin arriesgar los flujos hotel existentes.  



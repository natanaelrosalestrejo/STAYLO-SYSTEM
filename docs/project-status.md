# Estado del proyecto STAYLO

Resumen **derivado solo de la documentación** en `docs/` (no sustituye leer el código). Útil como mapa rápido antes de desarrollar.

---

## Qué está documentado como “en producto”

### Roles y consola

- **Platform admin:** consola global (`/platform-admin/*`), tenants, propiedades, permisos por rol, onboarding, usuarios, facturación (placeholder según auditoría legacy).  
  → [permissions/product-model.md](./permissions/product-model.md)

### Módulos / rutas autenticadas (claves `module_key`)

Pantallas y rutas alineadas a módulos en backend + sidebar:  
`platform_admin`, `dashboard`, `reservations`, `rooms`, `guests`, `jardines`, `hotel-events`, `inbox`, `tasks`, `catalog`, `reports`, `staff`, `room-types`, `properties`, `corporate`, `hotels`, `event-gardens`.

- **Público (sin check de módulo en doc):** `/reservar`, `/mi-reserva`; `/catalogo` con matiz según producto.  
  → [permissions/product-model.md](./permissions/product-model.md)

### Multi-propiedad y datos

- Propiedades **hotel** vs **event_garden**; espacios `event_spaces`, `hotel_spaces`; reservas de evento `event_bookings`; habitaciones y reservas hoteleras habituales.  
- **Jardines / eventos (auditoría archivada):** vistas operativas `/jardines`, `/hotel-events` y de grupo `/event-gardens`, `/corporate` descritas como funcionales; **no** documenta en producto una vinculación operativa automática evento ↔ habitaciones concretas (solo relación analítica vía dashboards/stats).  
  → [archive/system-audit-gardens-and-access.md](./archive/system-audit-gardens-and-access.md)

### Dashboards (documentados)

- **Corporativo / grupo:** `CorporateDashboard`, `/corporate`, `GET /api/corporate/dashboard`; roles **owner** y **admin** (misma ruta). Sesgo a métricas tipo hotel; sin desglose por evento ni hospedaje-evento ni P&L.  
  → [design/owner-corporate-dashboard.md](./design/owner-corporate-dashboard.md)
- **Operativo hotel:** `/`, reportes `/reports` con varios endpoints.  
  → mismo doc (tabla de vistas)

### Permisos efectivos

- `DEFAULT_ROLE_PERMISSIONS`, overrides `role_permissions`, `custom_permissions`; login y `/auth/me` como fuente de lista de módulos. RFC de orden de resolución congelado.  
  → [permissions/product-model.md](./permissions/product-model.md), [permissions/resolution-rfc.md](./permissions/resolution-rfc.md)

### Seeds y demo

- Seeds en arranque con guardas “colección vacía / rol ausente”; **no** seedean `role_permissions`, `hotel_spaces`, `pending_bookings`, `payment_transactions` (lista en doc de seeds).  
  → [operations/seeds.md](./operations/seeds.md)

### Tests

- Backend: `pytest` + `requests` contra API viva; tests unitarios de resolución de permisos sin Mongo.  
- Frontend: **sin** tests unitarios en `src/` documentados (`*.test.*`).  
  → [archive/test-audit-latest.md](./archive/test-audit-latest.md), [test-failure-summary-latest.md](./test-failure-summary-latest.md)

---

## Issues y riesgos conocidos (solo docs)

| Área | Qué dicen los docs |
|------|---------------------|
| **Datos Mongo** | Inconsistencias típicas: `property_id`/`tenant_id` rotos, `role_permissions` que reemplazan defaults y ocultan módulos, etc.  
  → [operations/mongo-data-audit.md](./operations/mongo-data-audit.md) |
| **Reportes vs alcance** | Algunos endpoints (`/reports/occupancy`, `/reports/insights`) pueden agregar **sin** filtrar por alcance del usuario → números pueden discrepar de otros dashboards si el frontend los usa.  
  → [operations/mongo-data-audit.md](./operations/mongo-data-audit.md) (§1 resumen ejecutivo) |
| **Frontend vs módulos** | “Ligeras inconsistencias” entre módulos por rol y `allowedRoles` en rutas.  
  → [archive/system-audit-gardens-and-access.md](./archive/system-audit-gardens-and-access.md) |
| **Permisos en UI** | Tras cambiar rol/`custom_permissions` a un usuario, el backend ya ve el cambio; el sidebar puede requerir **re-login** o refresco de `/auth/me` en contexto.  
  → [architecture-backend-status.md](./architecture-backend-status.md) §2.4 |
| **Suite pytest** | Integración frágil a **URL** (`REACT_APP_BACKEND_URL` inconsistente entre tests), **BD demo** (conteos 40 habitaciones, 3 propiedades), y **fixtures** que generan muchos errors si falla el login.  
  → [test-failure-summary-latest.md](./test-failure-summary-latest.md) |
| **Seeds vs demo canónica** | El doc de reset indica que el seed histórico puede tener **1 jardín** mientras el objetivo documentado es **2 jardines** + ajustes en `seed_properties` / `tenant_id` en usuarios.  
  → [operations/reset-plan.md](./operations/reset-plan.md) §D |
| **Refactor backend** | `architecture-backend-status` lista **Fase 2 (models) hecha** y **Fases 3–10 pendientes** (auth/scope → `auth.py`, seeds → `seeds/run.py`, extracción de routers). El repositorio puede ir por delante del texto; usar el doc como **plan declarado**, no como diff exacto del repo.  
  → [architecture-backend-status.md](./architecture-backend-status.md) |

---

## Dónde profundizar

| Necesidad | Doc |
|-----------|-----|
| Reset DB demo | [operations/reset-plan.md](./operations/reset-plan.md), [operations/reset-runbook.md](./operations/reset-runbook.md) |
| Auditoría de datos | [operations/mongo-data-audit.md](./operations/mongo-data-audit.md) |
| Diseño futuro jardines / lodging | [design/garden-roles.md](./design/garden-roles.md), [design/event-lodging.md](./design/event-lodging.md) |
| Índice general | [README.md](./README.md) |
| Backlog priorizado | [backlog.md](./backlog.md) |

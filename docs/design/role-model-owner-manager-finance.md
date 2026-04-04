# Modelo de roles: Owner, Manager, Finance

Documento de producto y arquitectura de permisos (alineado con RFC v1 de `permission_resolution`). La implementación mínima en código añade el módulo `manager_financial_view`, el rol `finance` y el alias de guardas `reports` ← `manager_financial_view` en `auth.py`.

## Diagnóstico (estado previo)

- **Owner**: módulos corporativos (`corporate`, `hotels`, `event-gardens`) + operación hotelera y `reports`; visión estratégica de grupo.
- **Manager**: operación amplia; **antes** incluía `reports` por defecto (finanzas operativas sin granularidad).
- **No existía** rol dedicado a contabilidad/finanzas del tenant.
- **Resolución RFC**: `custom_permissions` intersectaba solo con la lista efectiva; un módulo solo “extra” para un gerente concreto no podía añadirse sin cambiar la lista por defecto del rol.

## Rol recomendado: `finance` (no `accounting`)

- Convención del código y del dominio ya usan *financial* / `reports` / dashboard financiero.
- `finance` es corto, estable para APIs y JWT; la UI puede mostrar “Finanzas / Contabilidad”.

## Matriz de roles (objetivo)

| Rol | Alcance propiedades | Vista grupo / corporativa | Finanzas globales grupo | Finanzas propiedades asignadas | Operación (reservas, housekeeping, etc.) |
|-----|--------------------|----------------------------|---------------------------|--------------------------------|---------------------------------------------|
| **owner** | Todo el tenant / grupo según producto | Sí | Sí (vía `reports` + rutas corporativas) | Sí | Sí (panel operativo) |
| **manager** | Solo asignadas (`property_id` / reglas de scope) | No | No por defecto | Solo si tiene `manager_financial_view` | Sí (módulos operativos por defecto) |
| **manager** + `manager_financial_view` | Igual que manager | No | No | Sí (misma UI `/reports` y APIs `reports`; datos acotados por scope backend) | Igual que manager |
| **finance** | Según `property_id` / tenant (igual que otros staff) | No | No | Sí (`reports` + `dashboard` por defecto) | No salvo módulos extra explícitos |

**admin** y **platform_admin** no sustituyen a `finance` para operaciones contables del hotel.

## Matriz de módulos (resumen)

| Módulo | Owner | Manager | Manager + `manager_financial_view` | Finance |
|--------|-------|---------|-----------------------------------|---------|
| corporate, hotels, event-gardens | ✓ | ✗ | ✗ | ✗ |
| dashboard | ✓ | ✓ | ✓ | ✓ |
| reports | ✓ | ✗ (usar MFV) | ✓ (vía MFV o alias a `reports`) | ✓ |
| manager_financial_view | ✗ | opcional | ✓ | ✗ |
| reservations, rooms, guests, … | ✓ | ✓ | ✓ | ✗ (defecto) |

## Rutas (visibilidad orientativa; guards progresivos)

| Ruta / área | Owner | Manager | Manager + MFV | Finance |
|-------------|-------|---------|---------------|---------|
| `/corporate`, `/hotels`, `/event-gardens` | ✓ | ✗ | ✗ | ✗ |
| `/`, operación hotel | ✓ | ✓ | ✓ | ✓ (solo dashboard ligero) |
| `/reports` | ✓ | ✗ | ✓ | ✓ |
| `/staff`, `/reservations`, … | según módulos | ✓ | ✓ | ✗ por defecto |

La app frontend trata `/reports` como accesible si el usuario tiene `reports` **o** `manager_financial_view` (`routeSatisfiedByModules`). El backend admite `require_module("reports")` si el efective set incluye `manager_financial_view`.

## Dashboards (responsabilidades)

1. **Owner dashboard** (actual + evolución): KPIs de grupo, comparativos hotel/jardín, proyecciones; enlaces a `/corporate`, carteras, `/owner/hotel/:id`, `/owner/garden/:id`.
2. **Manager dashboard**: alertas operativas, cobranzas pendientes próximas a depender de APIs ya existentes, tareas, inbox; **sin** bloques de grupos financieros globales por defecto.
3. **Finance dashboard**: aterrizaje en `/reports` (y `/` mínimo); exportaciones CSV/Excel cuando existan en API; sin navegación operativa completa hasta que se otorguen módulos extra.

## Asignación multi-propiedad (`property_ids`)

- Los usuarios pueden llevar **`property_ids: string[]`** además del **`property_id`** legacy.
- Resolución (backend): si `property_ids` existe y, tras `strip` y deduplicar, queda **no vacío**, ese es el conjunto asignado; si no, se usa **`[property_id]`** si está definido; si no hay ninguno, lista vacía.
- **`manager` / `finance`:** el alcance operativo y de reportes es **solo** ese conjunto; **nunca** se amplía a todo el tenant por tener `tenant_id`.
- **`owner` / `admin` / demás:** si hay asignación explícita se usa; si no, se mantiene el comportamiento anterior (p. ej. todas las propiedades del tenant cuando hay `tenant_id`).
- Demo reset: usuario `manager_multi@hotel.com` con hotel + jardín Margati; seeds idempotentes análogos.

## Reportes: alcance por propiedad (`allowed_property_ids_for_reports`)

- **platform_admin**: `None` → consultas sin filtro `property_id` (herramientas de plataforma).
- **owner / admin**: igual que `_allowed_property_ids`: una propiedad si hay `property_id`; si no, **todas las propiedades del tenant**.
- **manager / finance**: solo `property_id` asignado; si falta → lista vacía → payloads vacíos en `/api/reports/*` (sin agregados globales).

Los helpers viven en `auth.allowed_property_ids_for_reports` y `services/reports_scope.py`.

## Permisos RFC: `manager_financial_view` y whitelist del tenant

El paso opcional de unión en `_finalize_with_custom` solo añade `manager_financial_view` si el módulo aparece también en el conjunto `tenant_allow` (whitelist de `module_config.enabled_modules`). Así el grant opcional **no elude** el corte por tenant.

## Implementación mínima realizada (backend + coherencia FE)

- `DEFAULT_ROLE_PERMISSIONS`: `manager` sin `reports`; nuevo rol `finance` con `reports`, `dashboard`.
- Catálogo: `ADDITIONAL_KNOWN_MODULE_KEYS` + `OPTIONAL_USER_GRANT_MODULES_BY_ROLE` para unión de `manager_financial_view` vía `custom_permissions`.
- `auth`: alias de guarda `reports` ← `manager_financial_view`.
- `users`: sanitización de `custom_permissions` para `finance`; managers pueden llevar `manager_financial_view`; admin puede borrar usuarios `finance`.
- Seeds: `finance` en listas de backfill de `tenant_id` / ámbito demo.
- Frontend: `finance` en rutas `/`, `/reports`; `routeSatisfiedByModules`; `PlatformAdmin` y `Staff` reconocen módulo y rol.

## Orden sugerido para el siguiente trabajo de frontend

1. Pantalla de reportes: copy y widgets que dejen claro “alcance propiedad” vs “grupo” según rol.
2. Dashboard manager: priorizar widgets operativos; ocultar agregados de grupo para no-owner.
3. Dashboard finance: layout dedicado o `/reports` como home con tabs de exportación.
4. Revisar cada `ProtectedRoute` y sidebar para no mostrar enlaces operativos a `finance` hasta que se pidan módulos extra.

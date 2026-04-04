> **Canonical (normativo):** algoritmo de módulos efectivos. Complementa el modelo de producto en [product-model.md](./product-model.md). Índice: [docs/README.md](../README.md).

---

# RFC: Resolución de permisos efectivos (STAYLO)

**Estado:** Congelado para implementación  
**Versión:** 1.0  
**Ámbito:** Módulos de producto (`module_key`); granularidad por acción queda fuera de este RFC.

---

## 1. Objetivo

Definir de forma única y auditable cómo se calcula `effective_modules` para cada usuario autenticado, de modo que tenant, rol y usuario puedan configurarse sin ambigüedad y sin fugas de módulos deshabilitados.

---

## 2. Algoritmo oficial de resolución (orden estricto)

Se calcula en el **backend**. El resultado se expone en respuestas de autenticación (p. ej. `/auth/login`, `/auth/me`) como lista ordenada **sin duplicados** de claves de módulo.

### Paso 1 — Plantilla global del rol

- **Entreada:** `role` del usuario.
- **Regla:**  
  `global_role_modules = DEFAULT_ROLE_PERMISSIONS[role]` **salvo** que exista un documento en la colección **`role_permissions`** con ese `role`.
- **Decisión congelada — `role_permissions` (global):** **REEMPLAZO TOTAL** de la lista de módulos del rol. Si hay documento `{ role, modules }`, entonces `global_role_modules := modules` (el array del documento sustituye por completo al default del código para ese `role`).  
  Si **no** hay documento, `global_role_modules := DEFAULT_ROLE_PERMISSIONS[role]` (o lista vacía si el rol no tiene entrada en default; comportamiento explícito en implementación).

*Motivo:* un solo array por rol en plataforma es fácil de auditar en soporte y evita ambigüedad de “union vs intersección” entre código y BD.

### Paso 2 — Override por tenant y rol

- **Entrada:** `tenant_id` efectivo del usuario (según modelo actual de usuario; si falta, tratar como error de configuración o rama documentada para `platform_admin`).
- **Regla:**  
  Si existe **`tenant_role_modules`** para el par `(tenant_id, role)` con un array `modules`:
  - **Decisión congelada — `tenant_role_modules`:** **REEMPLAZO TOTAL** de `global_role_modules` por ese array **solo** para ese tenant y ese rol.  
  Si **no** existe fila/documento para ese par:  
  `role_after_tenant_scope := global_role_modules`.

### Paso 3 — Límite duro del tenant (`tenant.module_config`)

- **Entrada:** `tenant.module_config` (ver §4).
- **Conjunto permitido:** `tenant_enabled_modules := Set(tenant.module_config.enabled_modules)` cuando `mode === "whitelist"`.
- **Regla:**  
  `after_tenant := role_after_tenant_scope ∩ tenant_enabled_modules`  
  (intersección en conjunto; resultado ordenado según convención estable en código, p. ej. orden canónico de catálogo).

*Nota:* ningún paso posterior puede introducir claves fuera de `tenant_enabled_modules`.

### Paso 4 — Ajuste por usuario (`custom_permissions`)

- **Entrada:** `user.custom_permissions` (opcional).
- **Decisión congelada — semántica de `custom_permissions`:** **INTERSECCIÓN (restrictiva)** con el resultado del paso 3.

Reglas exactas:

| Estado de `custom_permissions` | Resultado |
|------------------------------|-----------|
| `null`, omitido, o no aplicable al usuario | `effective_modules := after_tenant` |
| Lista presente (incluida lista vacía `[]`) | `effective_modules := after_tenant ∩ Set(custom_permissions)` |

*Motivo (opción más segura para STAYLO):* el usuario **nunca** gana módulos respecto al resultado rol+tenant; no puede reactivar algo que el tenant deshabilitó; no puede “sustituir” el rol por una lista arbitraria que evada el techo del tenant. Una lista vacía explícita implica **ningún** módulo de producto (útil para cuentas bloqueadas o configuraciones extremas).

### Paso 5 — Normalización

- Eliminar duplicados, ordenar, validar que todas las claves existen en el **catálogo de módulos** versionado (implementación puede warns/log en desarrollo si aparece clave desconocida).
- **Excepción explícita:** usuarios `platform_admin` quedan definidos en implementación (p. ej. módulo `platform_admin` only o bypass documentado); este RFC aplica a **roles de tenant** salvo que un anexo futuro fije el árbol para plataforma.

---

## 3. Resumen de decisiones (tabla)

| Capa | Mecanismo | Decisión |
|------|-----------|----------|
| `DEFAULT_ROLE_PERMISSIONS` | Base en código | Lista por defecto si no hay override global en BD |
| `*_role_permissions` (global) | Por `role` | **REEMPLAZO** del default |
| `tenant_role_modules` | Por `(tenant_id, role)` | **REEMPLAZO** del resultado global del paso 1 |
| `tenant.module_config` | Por tenant | **INTERSECCIÓN** (corte duro) |
| `user.custom_permissions` | Por usuario | **INTERSECCIÓN** con el resultado del corte por tenant |

**No se usa** en v1: fusión aditiva ni sustitución libre de `custom_permissions` sin intersección con `after_tenant`.

---

## 4. Esquema congelado: `tenant.module_config`

Ubicación: documento **`tenants`** (o equivalente), campo **`module_config`**.

Schema lógico (v1):

| Campo | Tipo | Obligatorio | Descripción |
|-------|------|-------------|-------------|
| `schema_version` | `integer` | Sí | Versión del formato; **1** para este RFC |
| `mode` | `string` | Sí | Solo valor permitido en v1: **`"whitelist"`** |
| `enabled_modules` | `string[]` | Sí | Lista de `module_key` habilitados para **todo** el tenant; claves únicas; orden recomendado: orden canónico del catálogo |
| `updated_at` | `string` (ISO-8601) | Sí | Última modificación |
| `updated_by_user_id` | `string \| null` | Sí | Usuario que aplicó el cambio (`null` si migración automática) |
| `metadata` | `object` | No | Campo libre acotado; ver abajo |

**`metadata` (opcional, v1):**

| Subcampo | Tipo | Descripción |
|----------|------|-------------|
| `notes` | `string` | Motivo del cambio, ticket interno, etc. |
| `source` | `string` | p. ej. `platform_admin_ui`, `migration_v1`, `script` |

**Reglas de interpretación v1:**

- Con `mode === "whitelist"`, un `module_key` **no** incluido en `enabled_modules` está **desactivado para todo el tenant** (salvo reglas especiales documentadas para `platform_admin` fuera del tenant).
- No hay en v1 `mode: "blacklist"`; una ampliación futura requeriría `schema_version >= 2` y nuevo RFC.

**Claridad a largo plazo:** la whitelist es el contrato explícito “estos módulos existen en este tenant”; simplifica soporte y evolución del catálogo (módulos nuevos en código **no** entran en el tenant hasta que alguien los añada a `enabled_modules` o corra una migración que amplíe listas).

---

## 5. Invariantes obligatorios

1. **`effective_modules ⊆ tenant_enabled_modules`** siempre que el usuario pertenezca a un tenant con `module_config` válido.
2. **Un módulo deshabilitado a nivel tenant no puede volver a habilitarse** ni por `tenant_role_modules`, ni por `custom_permissions`, ni por `role_permissions` global.
3. **`custom_permissions` solo puede reducir** el conjunto tras el paso tenant (intersección); **nunca** añadir claves que no estén en `after_tenant`.
4. **El backend es la fuente de verdad:** toda decisión de autorización para datos o acciones sensibles debe apoyarse en el mismo resolvedor (o en checks equivalentes), no solo en el JWT sin reclacular.
5. **El frontend no debe renderizar ni solicitar datos** para módulos que no estén en `effective_modules` entregados por el backend (sidebar, dashboards, KPIs, alertas, hooks de datos).
6. **Rutas y widgets** deben declarar su `module_key` (o dependencias múltiples); si falta la intersección requerida, no se monta la vista ni el widget.
7. **Catálogo de `module_key`:** claves desconocidas en `enabled_modules` o en listas de rol deben tratarse en implementación de forma definida (filtrado + log/métrica) para no romper el resolvedor.
8. **Consistencia en auth:** tras cambiar permisos en BD, el siguiente request que cargue el usuario debe reflejar los nuevos `effective_modules` (sin depender de re-login obligatorio para **seguridad**; re-login o refresh puede seguir siendo política de UX).

---

## 6. Estrategia de migración (orden recomendado)

1. **Migración de datos**  
   - Añadir campo `module_config` a cada tenant existente con `schema_version: 1`, `mode: "whitelist"`, `enabled_modules` = **lista completa del catálogo de módulos** en uso al cierre del RFC (paridad “todo lo que hoy es posible usar” para no cortar funcionalidad).  
   - Crear índices necesarios para `tenant_role_modules` si es colección aparte: único `(tenant_id, role)`.  
   - Documentar tratamiento de usuarios sin `tenant_id`.

2. **Backend — resolvedor**  
   - Implementar función única `resolve_effective_modules(user, tenant, ...)` según §2.  
   - Centralizar lectura de `role_permissions` y `tenant_role_modules`.

3. **Endpoints de auth**  
   - Incluir `effective_modules` (o reutilizar campo `modules` existente con la nueva semántica) en login y `/auth/me`.  
   - Documentar breaking change si el significado de `modules` cambia respecto al comportamiento previo de `custom_permissions`.

4. **Tests**  
   - Tablas de casos: sin override global / con override global / con tenant_role_modules / tenant recorta / custom intersección / custom vacío / módulo desconocido filtrado.  
   - Tests de regresión para roles existentes y para `platform_admin` según decisión de implementación.

5. **Consumo en UI**  
   - Sidebar, `ProtectedRoute` / `canAccessRoute`, dashboards y alertas: filtrar por lista efectiva.  
   - Evitar llamadas API condicionadas al módulo.

6. **Platform Admin UI**  
   - Editor de `tenant.module_config.enabled_modules`.  
   - Opcional: matriz `tenant_role_modules` tras estabilizar el resolvedor.

---

## 7. Fuera de alcance (v1)

- Permisos por acción dentro del mismo `module_key` (CRUD fino).
- Modos `blacklist` o licencias por “paquetes” comerciales mapeados a módulos (puede modelarse como rellenado de `enabled_modules`).
- Delegación a `owner`/`manager` para editar `module_config` sin ser `platform_admin`.

---

## 8. Aceptación

Este RFC queda **congelado** cuando producto y backend aprueban §2–§5. Cualquier cambio en semántica de `custom_permissions` o en REEMPLAZO vs MERGE requerirá **RFC v2** y bump de `schema_version` si afecta al almacenamiento.

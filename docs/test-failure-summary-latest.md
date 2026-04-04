# Resumen de diagnóstico — suite `pytest` backend (STAYLO)

Fecha de referencia: 2026-03-28.  
Este documento mezcla: (1) una ejecución de control en este entorno y (2) clasificación por causas probables en tu máquina cuando **sí** hay API + Mongo.

## A. Ejecución de control (sin API real)

- **Comando de referencia**: `pytest tests/` con `REACT_APP_BACKEND_URL=http://127.0.0.1:9` (puerto cerrado, fallo rápido por conexión).
- **Totales**: 161 tests recolectados; **31 passed**, **31 failed**, **99 errors**, **0 skipped**, **1 warning** (`PendingDeprecationWarning` en `starlette` / `multipart`).
- **Los 31 passed** coinciden con tests puramente locales: `test_permission_resolution.py` + la parte unitaria de `test_module_enforcement.py` (sin smoke HTTP).
- **Interpretación**: la mayoría de **errors** vienen de **fixtures de módulo** que hacen `assert status_code == 200` en el login; pytest marca **error en setup**, no “failure” del test. Los **failures** suelen ser tests que llaman a `requests` en el cuerpo del test y reciben `ConnectionError`.

> En tu entorno con backend levantado y BD coherente, espera otros números; la **jerarquía de causas** suele ser la misma: primero conectividad/config, luego datos demo, luego permisos/módulos y aserciones frágiles.

## B. Resumen ejecutivo (plantilla para tu corrida real)

Cuando vuelvas a correr en local, anota de la salida final:

| Métrica | Ejemplo control (sin API) | Qué revisar si es distinto en tu PC |
|--------|---------------------------|-------------------------------------|
| passed | 31 | sube cuando API + seeds están bien |
| failed | 31 | a menudo aserciones HTTP o datos |
| errors | 99 | a menudo setup de tokens / login |
| skipped | 0 | con `REACT_APP_BACKEND_URL` vacío, `test_reports_dashboard_scope` se salta entero |
| warnings | 1 | típico `multipart`; no bloquea |

**Causa dominante más probable en proyectos como este** (por diseño de los tests):

1. **API no alcanzable / URL mal configurada** — un solo fallo de red se propaga a muchísimos tests.
2. **Mongo demo incompleto o desincronizado** (no se ejecutó reset, o `seed_data` no corre porque ya hay usuarios parciales) — fallan aserciones de conteos (`40` habitaciones, `3` propiedades, huéspedes/reservas mínimos).
3. **Auth / módulos** — `403` donde el test espera `200`, o login demo rechazado.
4. **Tests de implementación** (léase código fuente): un test comprueba subcadenas en `routers/auth.py`; un refactor rompe eso sin romper el producto.

**Menos probable como causa “masiva”**: mismatch frontend/backend (estos tests son HTTP al backend directo).

## C. Agrupación por causa raíz (buckets)

### C1. Conectividad y variables de entorno — **crítico**

- **Afectados**: casi todos los que usan `requests` (orden de ~100+ ítems si la API no responde).
- **Ejemplos**: `test_hotel_api.py::TestAuth::*`, `test_platform_admin.py::*`, `test_multiproperty.py::*`, `test_public_booking.py::*` (si apunta a host incorrecto).
- **Causa**: `REACT_APP_BACKEND_URL` ausente o erróneo; backend caído; firewall/puerto.
- **Nota de diseño**: muchos ficheros usan `os.environ.get('REACT_APP_BACKEND_URL', '')` → URL vacía y fallos opacos; otros (`test_iteration5`, `test_public_booking`) tienen fallback `http://localhost:8000`.

### C2. Demo Mongo / seeds vs tests canónicos — **crítico**

- **Afectados**: tests que asumen forma fija del demo (comentarios citan `reset_staylo_demo.py` / `seeds/run.py`).
- **Ejemplos**: `test_multiproperty.py::test_get_properties_returns_canonical_demo_count` (`len == 3`), `test_reports_dashboard_scope.py::test_receptionist_scoped_rooms_canonical_demo_count` (`40` habitaciones), `test_public_booking.py::test_total_40_rooms`, `test_hotel_api.py::TestRooms::test_get_rooms` (`>= 15` habitaciones), mínimos de huéspedes/reservas.
- **Causa**: BD sin reset; `seed_data()` sale antes si `users.count > 0` pero faltan propiedades/habitaciones; drift de `custom_permissions` / módulos (mitigado en seeds con lista de emails demo).

### C3. Login demo / usuarios de plataforma ausentes — **crítico**

- **Afectados**: cualquier test que loguee `admin@hotel.com`, `platform@almasystem.com.mar`, `owner@hotel.com`, etc.
- **Ejemplos**: `test_staylo_refactor.py` (fixtures de módulo), `test_iteration10.py` (fixture `platform_token` con assert duro).
- **Causa**: usuarios no creados o contraseñas distintas al demo documental.

### C4. Permisos y guards de módulo (`403`) — **medio**

- **Afectados**: rutas con `ensure_user_has_module` / `require_module`; tests que esperan `200` para un rol concreto.
- **Ejemplos**: `test_reports_dashboard_scope.py` (recepción sin módulo `reports` debe recibir `403`; admin debe ver dashboard), `test_hotel_api.py::test_checkin_requires_admin_or_receptionist` (matiz: housekeeping esperado `403` en check-in).
- **Causa**: cambio en `DEFAULT_ROLE_PERMISSIONS`, resolución de módulos, o tenant allowlist.

### C5. Tests “sobre el código fuente” (frágiles al refactor) — **bajo/medio**

- **Afectados**: pocos.
- **Ejemplo**: `test_module_enforcement.py::test_auth_router_login_and_me_use_same_resolver` (busca strings en `routers/auth.py`).
- **Causa**: refactor legítimo del router sin actualizar el test.

### C6. Dependencia entre tests / datos mutados — **medio**

- **Afectados**: creación/borrado de habitaciones, properties `TEST_*`, bookings públicos en mismas fechas.
- **Ejemplos**: `test_public_booking.py` menciona limpiar `TEST999` dejado por `test_iteration8`; `test_iteration10` borra propiedades de prueba.
- **Causa**: orden de ejecución o restos de ejecuciones previas.

## D. Camino crítico — prioridad 1–2–3

1. **Verificar que la API es alcanzable en la misma URL que usan los tests** (`REACT_APP_BACKEND_URL`, o fallback `localhost:8000` donde aplique). Sin esto, la mayoría de fallos son **cascada**.
2. **Poner Mongo en el estado demo canónico** (`scripts/reset_staylo_demo.py` con confirmación, según documentación del repo). Sin esto, fallan **conteos y logins** de forma dispersa.
3. **Re-ejecutar solo tests de integración** con salida corta:  
   `pytest tests/ -q --tb=line -x` (parar en el primer fallo real) o filtrar por fichero tras login OK.

**Cascadas que suelen desaparecer** tras (1)+(2): la mayoría de `ERROR` en fixtures de token, y `FAILED` por `ConnectionError`, 401, listas vacías o `len != 40`.

**Probablemente “test obsoleto” vs bug real**:

- Obsoleto / test de implementación: `test_auth_router_login_and_me_use_same_resolver` (si cambia el nombre de la función o el estilo del payload).
- Posiblemente desalineado con producto: docstrings vs nombres (`test_rooms_have_dollar_currency` valida precios MXN ≥ 1000 — el nombre es engañoso, no necesariamente bug).
- `test_staylo_refactor.py::test_receptionist_login` permite `role in ["receptionist","admin","manager"]` — muy permisivo; más “test débil” que obsoleto.

## E. Archivos probables por bucket

| Bucket | Archivos |
|--------|----------|
| Config / URL | Todos los `tests/test_*.py` con `BASE_URL`, `config.py`, `.env` |
| Seeds / reset | `backend/seeds/run.py`, `backend/scripts/reset_staylo_demo.py`, `backend/db.py` |
| Auth / JWT | `backend/routers/auth.py`, `backend/auth.py` |
| Módulos | `backend/services/permission_resolution.py`, `backend/models/__init__.py` (`DEFAULT_ROLE_PERMISSIONS`) |
| Rutas CRUD | `backend/server.py`, `backend/routers/*.py` |

## F. Orden seguro de remediación

1. Fijar **URL única** documentada para tests y alinear todos los ficheros (o documentar que unos usan fallback y otros no).
2. Arrancar API + **reset demo** verificado.
3. Correr `pytest tests/test_hotel_api.py::TestAuth -q --tb=short` como smoke.
4. Correr `tests/test_multiproperty.py` y `tests/test_public_booking.py` (sensibles a conteos).
5. Abordar **403** restantes con trazas puntuales (rol vs módulos efectivos).
6. Revisar último el test **estático** de `auth.py` si hubo refactor de login/me.

## G. Comando útil para salida pequeña

```powershell
cd backend
$env:REACT_APP_BACKEND_URL="http://localhost:8000"
py -3.11 -m pytest tests/ -q --tb=no --no-header
```

Para diagnóstico: `--maxfail=1 -vv` en el primer fallo.

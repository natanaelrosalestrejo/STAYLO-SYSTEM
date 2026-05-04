# AUDITORIA.md — STAYLO SaaS
**Fecha:** Mayo 2026 | **Auditor:** Claude Code (Opus)  
**Proyecto:** STAYLO — Hotel & Event Space SaaS (Grupo Paraíso, Cuernavaca)

---

## 1. ESTRUCTURA ACTUAL

### 1.1 Mapa de Carpetas

```
staylo/
├── backend/                   # FastAPI (Python 3.12)
│   ├── server.py              # ⚠️ Monolítico — 1,772 líneas, 66 endpoints
│   ├── auth.py                # JWT, hashing, helpers de scope — 215 líneas
│   ├── config.py              # Variables de entorno + validación producción
│   ├── db.py                  # Cliente Motor async MongoDB
│   ├── models/
│   │   ├── schemas.py         # Todos los modelos Pydantic — ~40 modelos
│   │   └── __init__.py        # Re-exports
│   ├── routers/               # ✅ Módulos extraídos (7/22 grupos de endpoints)
│   │   ├── auth.py            # 2 endpoints — 32 líneas
│   │   ├── users.py           # 4 endpoints — 196 líneas
│   │   ├── messages.py        # 4 endpoints — 65 líneas
│   │   ├── rooms.py           # 5 endpoints — 88 líneas
│   │   ├── guests.py          # 7 endpoints — 84 líneas
│   │   ├── tasks.py           # 4 endpoints — 81 líneas
│   │   └── event_lodging.py   # 2 endpoints + helpers — 273 líneas
│   ├── services/
│   │   ├── permission_resolution.py  # Resolución RFC v1 de permisos
│   │   ├── scoring.py                # Score de ocupación hotel/jardín
│   │   └── reports_scope.py          # Filtros de alcance para reportes
│   ├── seeds/
│   │   └── (run.py pendiente)        # ⚠️ Lógica de seeds aún en server.py
│   ├── tests/                 # 17 archivos, ~2,400 líneas
│   └── requirements.txt
├── frontend/                  # React 19 + Tailwind + Radix UI
│   └── src/
│       ├── App.js             # Router + ProtectedRoute
│       ├── pages/             # 22 páginas — ~10,584 líneas total
│       ├── components/
│       │   ├── Layout.js      # Sidebar dinámico — 606 líneas
│       │   └── ui/            # 17 componentes Radix UI
│       ├── contexts/
│       │   ├── AuthContext.js    # Token + user en localStorage
│       │   └── PropertyContext.js
│       └── utils/
│           ├── api.js         # Axios + auth header
│           └── permissions.js # canAccessRoute(), filtros de módulos
├── docs/                      # Documentación técnica en español
├── design_guidelines.json     # Sistema de diseño (colores, tipografía)
├── docker-compose.yml
└── .env.example
```

### 1.2 Archivos por Tamaño (Top 15 — Python)

| Archivo | Líneas | Estado |
|---------|--------|--------|
| `backend/server.py` | 1,772 | ⚠️ Monolítico |
| `backend/tests/test_reports_dashboard_scope.py` | 1,831 | Tests exhaustivos |
| `backend/tests/test_reports_endpoints_scope.py` | 1,442 | Tests exhaustivos |
| `backend/tests/test_properties_list_scope.py` | 1,101 | Tests exhaustivos |
| `backend/routers/event_lodging.py` | 273 | Módulo complejo |
| `backend/tests/test_permission_resolution.py` | 264 | Tests unitarios |
| `backend/tests/test_module_enforcement.py` | 251 | Tests de enforcement |
| `backend/routers/users.py` | 196 | Módulo completo |
| `backend/tests/test_hotel_api.py` | 238 | Tests integración |
| `backend/auth.py` | 215 | Core auth |
| `backend/tests/test_platform_admin.py` | 194 | Tests admin |
| `backend/tests/test_iteration8.py` | 196 | Tests iteración |
| `backend/tests/test_staylo_refactor.py` | 192 | Tests refactor |
| `backend/tests/test_roles_refactor.py` | 149 | Tests roles |
| `backend/tests/test_iteration5.py` | 149 | Tests iteración |

### 1.3 Archivos por Tamaño (Top 10 — JavaScript)

| Archivo | Líneas |
|---------|--------|
| `frontend/src/pages/PlatformAdmin.js` | 1,878 |
| `frontend/src/pages/EventGarden.js` | 763 |
| `frontend/src/pages/BookingWizard.js` | 641 |
| `frontend/src/components/Layout.js` | 606 |
| `frontend/src/pages/CorporateDashboard.js` | 531 |
| `frontend/src/pages/Staff.js` | 470 |
| `frontend/src/pages/Reservations.js` | 449 |
| `frontend/src/pages/HotelEvents.js` | 433 |
| `frontend/src/pages/Rooms.js` | 384 |
| `frontend/src/pages/Inbox.js` | 354 |

---

## 2. QUÉ FUNCIONA BIEN

### 2.1 Sistema de Autenticación y Permisos ✅
- **JWT funcional** con expiración 24h — `auth.py`
- **Tres capas de permisos**: `DEFAULT_ROLE_PERMISSIONS` (código) → `role_permissions` (DB) → `custom_permissions` (usuario)
- **12 roles definidos**: `platform_admin`, `owner`, `manager`, `finance`, `receptionist`, `sales`, `housekeeping`, `maintenance`, `security`, `restaurant`, `garden_staff`, `garden_reception`
- **20+ módulos con guard**: `require_module("key")` como dependencia FastAPI en cada ruta
- **Frontend sincronizado**: `canAccessRoute()` + sidebar filtrado por `user.modules`
- Cubierto por tests: `test_permission_resolution.py` (264 líneas) + `test_module_enforcement.py` (251 líneas)

### 2.2 Multi-tenant y Multi-propiedad ✅
- Aislamiento por `tenant_id` en todas las colecciones
- Scope enforcement con `_allowed_property_ids(user)`, `_ensure_room_in_scope()`, `_ensure_reservation_in_scope()`
- Soporte para `property_id` (una propiedad) y `property_ids` (múltiples) en usuarios
- `platform_admin` bypasses scope correctamente
- Cubierto por tests: `test_multiproperty.py` + `test_properties_list_scope.py`

### 2.3 Módulos Completamente Operativos ✅
| Módulo | Backend | Frontend | Tests |
|--------|---------|----------|-------|
| Auth + Permisos | ✅ `routers/auth.py` | ✅ `AuthContext.js` | ✅ 2 archivos |
| Usuarios / Staff | ✅ `routers/users.py` | ✅ `Staff.js` | ✅ |
| Habitaciones | ✅ `routers/rooms.py` | ✅ `Rooms.js` | ✅ |
| Huéspedes | ✅ `routers/guests.py` | ✅ `Guests.js` | ✅ |
| Mensajería | ✅ `routers/messages.py` | ✅ `Inbox.js` | ⚠️ Limitado |
| Tareas | ✅ `routers/tasks.py` | ✅ `Tasks.js` | ⚠️ Limitado |
| Platform Admin | ✅ server.py | ✅ `PlatformAdmin.js` (1,878L) | ✅ 8 tests |
| Booking Público | ✅ server.py | ✅ `BookingWizard.js` | ✅ 6 tests |
| Corporate Dashboard | ✅ server.py (364L) | ✅ `CorporateDashboard.js` | ❌ Sin tests |
| Tipos de Habitación | ✅ server.py | ✅ `RoomTypes.js` | ⚠️ |
| Reportes | ✅ 5 endpoints | ✅ `Reports.js` | ✅ 4 archivos |

### 2.4 Arquitectura Frontend ✅
- **React Context** bien estructurado (`AuthContext`, `PropertyContext`)
- **Axios interceptor** central en `utils/api.js` — token inyectado automáticamente
- **Routing protegido** con `<ProtectedRoute>` en `App.js`
- **Sistema de diseño** coherente: Radix UI + Tailwind + `design_guidelines.json`
- **Lucide React** con 1.5pt stroke width — consistencia visual

### 2.5 Infraestructura DevOps ✅
- `docker-compose.yml` con backend + frontend listos
- `config.py` con validación estricta en modo producción
- `.env.example` actualizado
- Linters configurados: `black`, `isort`, `flake8`, `mypy`

---

## 3. QUÉ ESTÁ MAL O INCOMPLETO

### 3.1 Problemas de Seguridad

#### 🔴 CRÍTICO

**[SEC-01] Contraseñas hardcodeadas en Onboarding**
- **Archivo:** `backend/server.py`, líneas ~1707–1720
- **Código problemático:**
  ```python
  password_hash=hash_password("owner123"), role="owner"
  created_users.append({"role": "owner", "temp_password": "owner123"})
  ```
- **Riesgo:** Todo propietario nuevo recibe `owner123` como contraseña; si el email de onboarding no llega o el cliente no cambia la contraseña, la cuenta queda expuesta.
- **Fix:** Generar contraseña aleatoria de 16 chars (`secrets.token_urlsafe(12)`), enviarla por Resend, y marcar `force_password_change=True` en el usuario.

**[SEC-02] Excepción silenciosa en endpoint AI**
- **Archivo:** `backend/server.py`, línea ~533
- **Código problemático:**
  ```python
  except:
      pass
  ```
  En el endpoint `POST /api/ai/task-suggestion` — cualquier error de parsing o llamada a LLM falla silenciosamente, sin log.
- **Fix:** Reemplazar con `except Exception as e: logger.error(f"AI task-suggestion failed: {e}"); raise HTTPException(500, "AI service unavailable")`

#### 🟠 ALTO

**[SEC-03] Sin rate limiting en endpoints públicos**
- **Archivo:** `backend/server.py`, líneas ~1267–1488
- **Endpoints vulnerables:**
  - `GET /api/public/booking/lookup` — enumerable por `guest_name`
  - `GET /api/public/availability` — sin límite de consultas
  - `POST /api/public/booking/create` — sin límite de creación
  - `POST /api/public/checkout/session` — sin límite de sesiones Stripe
- **Riesgo:** Scraping de reservas, DDoS, abuso de créditos Stripe
- **Fix:** Implementar `slowapi` con límite por IP (ej. `10/minute` para lookup, `5/minute` para create)

**[SEC-04] Búsqueda de reservas O(n) sin índice**
- **Archivo:** `backend/server.py`, función `lookup_booking()`, líneas ~1267–1283
- **Código problemático:**
  ```python
  reservations = await db.reservations.find(
      {"guest_name": {"$exists": True}}, {"_id": 0}
  ).to_list(10000)
  # luego filtro en Python por guest_name o email
  ```
- **Riesgo:** Con 10k+ reservas, cada búsqueda carga todo en memoria; además es vulnerable a timing attacks.
- **Fix:** Crear índice `{guest_email: 1}` en MongoDB + query directa `{"guest_email": email_param}`

**[SEC-05] JWT Secret con valor por defecto débil**
- **Archivo:** `backend/auth.py`, línea ~21
- **Código:**
  ```python
  _jwt_secret = os.environ.get("JWT_SECRET_KEY", "hotel-secret-2024")
  ```
- **Mitigación actual:** `config.py` rechaza `"hotel-secret-2024"` en producción (líneas ~23–27)
- **Riesgo residual:** En entornos staging/dev mal configurados puede usarse el default
- **Fix:** Eliminar el default; si no está seteado, fallar en startup en cualquier modo

#### 🟡 MEDIO

**[SEC-06] XSS en templates HTML de email**
- **Archivo:** `backend/server.py`, líneas ~1231–1256
- **Código:**
  ```python
  html_body = f"""<div>...{booking_data['first_name']}..."""
  ```
- **Riesgo:** Si `first_name` contiene `<script>`, el email inyecta HTML/JS en el cliente de correo del receptor.
- **Fix:** Usar `html.escape(booking_data['first_name'])` o cambiar a Jinja2 con auto-escaping.

**[SEC-07] No se usan transacciones MongoDB en creación de reservas**
- **Archivo:** `backend/server.py`, función `create_reservation()`, líneas ~108–160
- **Riesgo:** Si la reserva se crea pero falla la actualización de `room.is_available`, la habitación queda disponible cuando no debería. Race condition bajo carga.
- **Fix:** Usar `async with await db.client.start_session() as session:` con `session.start_transaction()`

**[SEC-08] Excepción silenciosa en AuthContext del frontend**
- **Archivo:** `frontend/src/contexts/AuthContext.js`, línea ~23
- **Código:**
  ```javascript
  api.get('/auth/me').then((r) => { ... }).catch(() => {});
  ```
- **Riesgo:** Si `/auth/me` falla (red, token expirado), el usuario sigue navegando con módulos desactualizados hasta recarga manual.
- **Fix:** En el catch, si error es 401, forzar logout; si es error de red, mostrar banner de "conexión perdida"

### 3.2 Tests Faltantes

| Módulo | Estado | Impacto |
|--------|--------|---------|
| Corporate Dashboard (`/api/corporate/dashboard`) | ❌ Sin tests | Alto — función más larga del proyecto (364L) |
| Stripe webhook (`/api/webhook/stripe`) | ❌ Sin tests | Alto — transacciones de dinero |
| Email de confirmación (`send_booking_confirmation`) | ❌ Sin tests | Medio |
| AI endpoints (`/api/ai/*`) | ❌ Sin tests | Bajo |
| Frontend (React) | ❌ Sin tests | Medio — ningún archivo `.test.js` existe |
| `event_lodging.py` | ⚠️ 1 archivo, 71 líneas | Bajo — feature incompleta |
| Inbox / Mensajes | ⚠️ Muy limitado | Medio |

**Cobertura estimada:** ~65% del backend (endpoints), 0% del frontend

### 3.3 Deuda Técnica

**[DEBT-01] `server.py` es monolítico con 66 endpoints activos**
- 1,772 líneas que mezclan lógica de negocio, validaciones, queries MongoDB, construcción de respuestas
- Dificulta revisiones de código, testing unitario, y mantenimiento
- Módulos pendientes de extraer: `reservations`, `reports`, `ai`, `properties`, `event_spaces`, `hotel_spaces`, `event_bookings`, `corporate`, `public_booking`, `tenants`, `room_types`, `amenities`, `role_permissions`, `onboarding`, `features`

**[DEBT-02] Lógica de seeds mezclada en `server.py`**
- Funciones `seed_*` están embebidas en `server.py` en lugar de `backend/seeds/run.py`
- `backend/seeds/__init__.py` existe pero `run.py` no está completo

**[DEBT-03] `PlatformAdmin.js` tiene 1,878 líneas**
- Un solo componente React maneja: tenants, usuarios, propiedades, permisos de rol, onboarding
- Sin tests. Sin sub-componentes modulares.

**[DEBT-04] Falta de índices MongoDB documentados**
- No hay archivo de migraciones ni script de creación de índices
- Colecciones críticas (`reservations`, `guests`, `rooms`) sin índices definidos formalmente

---

## 4. QUÉ FALTA POR HACER

### 4.1 Funcionalidades Pendientes / Incompletas

| Feature | Estado | Detalle |
|---------|--------|---------|
| **Hospedaje de eventos** | Backend parcial, sin UI | `routers/event_lodging.py` existe pero no hay página frontend para asignar habitaciones a eventos. Diseño en `docs/design/event-lodging.md` |
| **Stripe UI de confirmación** | Backend con webhook, sin UI | El webhook procesa pagos pero no hay pantalla de estado de pago en el dashboard |
| **Confirmación por email** | Backend implementado, sin fallback | Si Resend falla, la reserva se crea sin notificación. No hay reintento ni log de fallo |
| **AI suggestions en UI** | 3 endpoints listos, sin UI | `POST /api/ai/suggest-reply`, `summarize`, `task-suggestion` no tienen panel en frontend |
| **Feature toggles por propiedad** | Endpoints stub | `GET/PATCH /api/properties/{id}/features` devuelve defaults quemados; sin UI ni persistencia real |
| **Seeds de jardines** | Documentado como bug | Demo DB puede tener 1 jardín en lugar de 2 esperados (ver `docs/operations/reset-plan.md`) |
| **Reset de contraseña** | No existe | No hay flujo `forgot password` / `reset password` en ninguna capa |
| **2FA / MFA** | No existe | Sin segundo factor de autenticación |
| **Audit log** | No existe | Sin registro de quién hizo qué (check-in, cambios de reserva, modificación de usuario) |
| **Notificaciones push / tiempo real** | No existe | Sin WebSocket ni polling para notificaciones en vivo |
| **Multi-idioma (i18n)** | Hardcodeado en español/inglés mezclado | Sin framework de traducción; strings mezclados en ambos idiomas |

### 4.2 Módulos de Backend Pendientes de Extraer (server.py)

| Router a crear | Endpoints | Líneas aprox. en server.py |
|----------------|-----------|---------------------------|
| `routers/reservations.py` | 6 | ~88 líneas |
| `routers/reports.py` | 5 | ~267 líneas |
| `routers/properties.py` | 4 | ~42 líneas |
| `routers/event_spaces.py` | 4 | ~38 líneas |
| `routers/hotel_spaces.py` | 4 | ~38 líneas |
| `routers/event_bookings.py` | 4 | ~40 líneas |
| `routers/corporate.py` | 2 | ~369 líneas |
| `routers/public_booking.py` | 7 | ~221 líneas |
| `routers/tenants.py` | 5 | ~29 líneas |
| `routers/room_types.py` | 4 | ~33 líneas |
| `routers/amenities.py` | 3 | ~36 líneas |
| `routers/role_permissions.py` | 2 | ~26 líneas |
| `routers/onboarding.py` | 1 | ~72 líneas |
| `routers/features.py` | 2 | ~20 líneas |
| `routers/ai.py` | 3 | ~33 líneas |

---

## 5. PLAN RECOMENDADO

### PRIORIDAD 1 — URGENTE (Esta semana)

**P1-A: Corregir contraseñas hardcodeadas en onboarding [SEC-01]**
- Archivo: `backend/server.py`, función `initialize_tenant_properties()`
- Cambiar `"owner123"` por `secrets.token_urlsafe(12)`
- Agregar campo `force_password_change: bool = True` al modelo `UserModel`
- Enviar contraseña temporal por email (Resend ya está integrado)
- Estimado: 2-3 horas

**P1-B: Agregar rate limiting a endpoints públicos [SEC-03]**
- Instalar `slowapi` (`pip install slowapi`)
- Aplicar `@limiter.limit("10/minute")` en: `lookup_booking`, `check_availability`, `create_public_booking`, `create_public_checkout`
- Estimado: 2 horas

**P1-C: Corregir excepción silenciosa en AI [SEC-02]**
- Archivo: `backend/server.py`, línea ~533
- Reemplazar `except: pass` con manejo explícito
- Estimado: 30 minutos

**P1-D: Crear índices MongoDB**
- Crear script `backend/scripts/create_indexes.py` con índices para:
  - `reservations`: `{guest_email: 1}`, `{property_id: 1, check_in: 1}`, `{status: 1}`
  - `guests`: `{email: 1}`, `{tenant_id: 1}`
  - `rooms`: `{property_id: 1}`, `{is_available: 1}`
  - `users`: `{email: 1}` (unique), `{tenant_id: 1}`
- Corregir `lookup_booking()` para usar query directa con índice [SEC-04]
- Estimado: 3 horas

### PRIORIDAD 2 — IMPORTANTE (Próximas 2 semanas)

**P2-A: Tests para Corporate Dashboard y Stripe**
- `backend/tests/test_corporate_dashboard.py` — cubrir scope, filtros por tenant, aggregation correcta
- `backend/tests/test_stripe_webhook.py` — simular eventos `checkout.session.completed`, `payment_failed`
- Estimado: 1 día

**P2-B: Escaping HTML en emails [SEC-06]**
- Archivo: `backend/server.py`, función `send_booking_confirmation()`
- Reemplazar f-strings en HTML con `html.escape()` o migrar a Jinja2
- Estimado: 2 horas

**P2-C: Flujo Reset de Contraseña**
- Backend: `POST /api/auth/forgot-password` → token temporal en DB; `POST /api/auth/reset-password` → valida token + actualiza hash
- Frontend: Pantalla `ForgotPassword.js` + `ResetPassword.js`
- Estimado: 1.5 días

**P2-D: Corregir AuthContext catch silencioso [SEC-08]**
- Archivo: `frontend/src/contexts/AuthContext.js`
- En el `.catch()`: si 401 → `logout()`; si error de red → mostrar banner
- Estimado: 1 hora

**P2-E: Modularizar `routers/reservations.py`**
- Extraer los 6 endpoints de reservaciones de `server.py` al nuevo módulo
- Es el módulo más usado y el que más beneficia de aislamiento
- Estimado: 3 horas

**P2-F: Modularizar `routers/reports.py`**
- Extraer los 5 endpoints de reportes — auditar scope en cada uno con `allowed_property_ids_for_reports()`
- Estimado: 4 horas

**P2-G: UI de estado de pago Stripe**
- Crear pantalla en frontend que muestre resultado de `GET /api/public/checkout/status/{session_id}`
- Actualmente el usuario no sabe si su pago fue procesado
- Estimado: 1 día

### PRIORIDAD 3 — DESPUÉS (Siguiente sprint)

**P3-A: Completar modularización de server.py (Phases 5–10)**
- Extraer los 15 routers restantes en el orden: `properties`, `tenants`, `public_booking`, `event_spaces/hotel_spaces`, `amenities/room_types`, `role_permissions`, `onboarding`, `corporate`, `ai`, `features`
- Eliminar lógica de seeds de server.py → `seeds/run.py`
- Estimado: 3–4 días

**P3-B: Refactor PlatformAdmin.js**
- Dividir en sub-componentes: `TenantManager`, `UserManager`, `PropertyManager`, `RolePermissionsEditor`
- Agregar tests básicos con React Testing Library
- Estimado: 2 días

**P3-C: Transacciones MongoDB en reservaciones [SEC-07]**
- Envolver `create_reservation` + `update room.is_available` en sesión transaccional Motor
- Estimado: 4 horas

**P3-D: Audit Log**
- Agregar colección `audit_log` con: `{user_id, action, entity, entity_id, timestamp, diff}`
- Registrar: login, check-in/check-out, cambio de reserva, modificación de usuario, cambio de permisos
- Estimado: 2 días

**P3-E: UI para hospedaje de eventos**
- La feature de `event_lodging.py` ya tiene backend — falta la pantalla en `EventGarden.js` para asignar y ver habitaciones de un evento
- Estimado: 1.5 días

**P3-F: Eliminar JWT_SECRET_KEY default [SEC-05]**
- Remover el fallback `"hotel-secret-2024"` de `auth.py`
- Validar presencia de la variable en startup sin importar el entorno
- Estimado: 30 minutos

**P3-G: i18n / internacionalización**
- Evaluar `react-i18next` para estandarizar el idioma de la UI (actualmente mezcla español/inglés)
- Estimado: 3–5 días para cobertura básica

---

## RESUMEN EJECUTIVO

| Categoría | Estado |
|-----------|--------|
| **Funcionalidad core** | ✅ Operativa (auth, reservas, huéspedes, habitaciones, reportes, jardines) |
| **Seguridad** | ⚠️ 2 problemas críticos, 3 altos — requieren acción antes de producción |
| **Cobertura de tests** | ⚠️ ~65% backend, 0% frontend |
| **Arquitectura backend** | ⚠️ Modularización al 30% — server.py monolítico pendiente |
| **Features faltantes** | ❌ Reset password, 2FA, audit log, UI de hospedaje eventos |
| **Deuda técnica** | Manejable si se ejecutan P1 y P2 este mes |

**Recomendación:** El sistema es funcional y puede operar en producción con las correcciones de P1 aplicadas. Sin resolver [SEC-01] (contraseñas onboarding) y [SEC-03] (rate limiting), **no debería exponerse a internet**.

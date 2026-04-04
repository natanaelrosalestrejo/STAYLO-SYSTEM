> **Archived document.** Snapshot de arquitectura (marzo 2026); la estructura del repo ha evolucionado (routers modularizados, `auth.py`, `seeds/run.py`, etc.).  
> **Superseded by (estado vivo):** [architecture-backend-status.md](../architecture-backend-status.md) e índice en [docs/README.md](../README.md).

---

# STAYLO-SYSTEM — Informe de auditoría técnica

**Fecha:** 14 de marzo de 2026  
**Alcance:** Análisis completo del repositorio. Sin modificaciones de código, esquema ni comportamiento.

---

## 1. Arquitectura general del proyecto

- **Tipo:** Aplicación full-stack monolítica, SaaS multi-tenant para operaciones hoteleras.
- **Separación:** Backend (FastAPI) y frontend (React) en carpetas distintas; no hay monorepo con workspace único.
- **Backend:** Un solo módulo `backend/server.py` (~2000 líneas) que concentra modelos Pydantic, auth, seeds, rutas API y lógica de negocio.
- **Frontend:** SPA React con React Router, contextos (Auth, Property), páginas por módulo y componentes UI (shadcn-style).
- **Base de datos:** MongoDB como única persistencia; sin ORM, acceso vía Motor (async).
- **Despliegue:** Referencias a Vercel (`.gitignore`) y a imagen Emergent (`.emergent/emergent.yml`); no hay Dockerfile ni docker-compose en el repo.

```
┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND (React SPA)                      │
│  App.js → AuthProvider / PropertyProvider → Layout → Pages       │
│  api.js (axios) → REACT_APP_BACKEND_URL/api                      │
└───────────────────────────────┬─────────────────────────────────┘
                                │ HTTP/REST + JWT
┌───────────────────────────────▼─────────────────────────────────┐
│                    BACKEND (FastAPI - server.py)                  │
│  api_router (/api) → auth, users, rooms, guests, reservations,   │
│  messages, tasks, reports, properties, event-spaces, hotel-spaces, │
│  tenants, room-types, amenities, platform, public, webhook        │
└───────────────────────────────┬─────────────────────────────────┘
                                │ Motor (async)
┌───────────────────────────────▼─────────────────────────────────┐
│                         MONGODB                                   │
│  users, rooms, guests, reservations, messages, tasks,             │
│  properties, event_spaces, hotel_spaces, event_bookings,          │
│  tenants, room_types, amenities, role_permissions,                │
│  pending_bookings, payment_transactions                           │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Estructura del backend

- **Raíz:** `backend/` con `server.py`, `requirements.txt` y carpeta `tests/`.
- **server.py:** Incluye en un solo archivo:
  - Carga de env (`load_dotenv(ROOT_DIR / '.env')`), conexión MongoDB, configuración CORS.
  - Modelos Pydantic (User, Room, Guest, Reservation, Message, Task, Property, EventSpace, HotelSpace, Tenant, RoomType, Amenity, etc.).
  - Auth: `CryptContext` (bcrypt vía passlib), JWT (python-jose), `get_current_user`, `require_role(*)`.
  - Seeds: `seed_data`, `seed_properties`, `seed_owner`, `seed_platform_admin`, `seed_tenants`, `seed_room_types`, `seed_amenities` (ejecutados en startup).
  - Rutas bajo `APIRouter` con prefijo `/api`: auth, users, rooms, guests, reservations, messages, tasks, reports, AI, properties, event-spaces, hotel-spaces, event-bookings, corporate, platform, public (booking, checkout), webhook Stripe, tenants, room-types, amenities, role-permissions.
- **Tests:** 10 módulos en `backend/tests/` (pytest + requests contra API viva). No hay estructura de routers separados; todo está en `server.py`.

---

## 3. Estructura del frontend

- **Raíz:** `frontend/` con `package.json`, `craco.config.js`, `jsconfig.json`, `components.json`, `tailwind.config.js`, `public/index.html`, `src/`.
- **Entrada:** `src/index.js` → `App.js` (AuthProvider, PropertyProvider, BrowserRouter, rutas).
- **Rutas:** Protegidas por `ProtectedRoute` (por rol); rutas públicas: `/catalogo`, `/reservar`, `/mi-reserva`, `/login`.
- **Contextos:** `AuthContext.js` (user, login, logout, token en localStorage), `PropertyContext.js` (properties, selectedPropertyId en localStorage).
- **Utilidades:** `api.js` (axios con baseURL desde `REACT_APP_BACKEND_URL`), `lib/utils.js`, `hooks/use-toast.js`.
- **Páginas:** Login, Dashboard, CorporateDashboard, Reservations, Rooms, RoomTypes, Guests, Staff, Inbox, Tasks, Reports, BookingWizard, BookingLookup, RoomsCatalog, PropertyManagement, PlatformAdmin, HotelsOverview, EventGardensOverview, EventGarden, HotelEvents.
- **Componentes:** `Layout.js` (sidebar según rol) y ~46 componentes en `components/ui/` (shadcn/Radix: button, card, dialog, input, table, etc.). Las páginas no importan de forma masiva desde `@/components/ui`; usan componentes locales (p. ej. StatCard, KpiCard, StatusBadge) y HTML/Tailwind.

---

## 4. Frameworks y librerías

| Capa | Tecnología |
|------|------------|
| Backend | FastAPI 0.110, Uvicorn, Pydantic 2.x, Motor 3.3, PyMongo 4.5, python-jose, passlib (bcrypt), python-dotenv |
| Backend (opc/integraciones) | emergentintegrations 0.1.0 (LLM + Stripe checkout), resend (no listado en requirements.txt) |
| Backend (dev/test) | pytest, black, isort, flake8, mypy |
| Frontend | React 19, react-router-dom 7, axios, Radix UI (múltiples paquetes), Tailwind, shadcn (components.json), date-fns, recharts, react-hook-form, zod, lucide-react, sonner |
| Frontend (build) | react-scripts 5, CRACO 7, dotenv |
| Frontend (dev) | ESLint, @emergentbase/visual-edits (opcional, desde assets.emergent.sh), plugin health-check (ENABLE_HEALTH_CHECK) |

---

## 5. Uso de base de datos

- **Motor:** AsyncIOMotorClient; `db = client[DB_NAME]` con `DB_NAME` desde env.
- **Colecciones usadas:** users, rooms, guests, reservations, messages, tasks, properties, event_spaces, hotel_spaces, event_bookings, tenants, room_types, amenities, role_permissions, pending_bookings, payment_transactions.
- **Sin migraciones:** Todo acceso directo con Motor; documentos con campo `id` (UUID string); sin índices definidos en código.
- **Multi-tenant:** Modelos con `property_id` y `tenant_id`; varios endpoints (p. ej. `/rooms`, `/reservations`, `/guests`) **no filtran por property_id/tenant_id**, por lo que devuelven datos de toda la base (riesgo de aislamiento; ver sección 11).

---

## 6. Variables de entorno necesarias

**Backend (obligatorias para arranque):**

- `MONGO_URL` — Cadena de conexión MongoDB (sin valor → fallo al iniciar).
- `DB_NAME` — Nombre de la base de datos.

**Backend (recomendadas / opcionales):**

- `JWT_SECRET_KEY` — Por defecto `'hotel-secret-2024'` (inseguro en producción).
- `CORS_ORIGINS` — Lista separada por comas; por defecto `'*'`.
- `STRIPE_API_KEY` — Pagos con Stripe (checkout público y webhook).
- `RESEND_API_KEY` — Envío de correos (confirmación de reserva).
- `SENDER_EMAIL` — Remitente (default `onboarding@resend.dev`).
- `HOTEL_NOTIFICATION_EMAIL` — Copia de notificaciones al hotel.
- `EMERGENT_LLM_KEY` — Endpoints `/ai/suggest-reply`, `/ai/summarize`, `/ai/task-suggestion` (si no está, devuelven 503).

**Frontend:**

- `REACT_APP_BACKEND_URL` — URL base del API (usada en `api.js`, BookingWizard, BookingLookup, Reports).
- `ENABLE_HEALTH_CHECK` — `"true"` para activar plugin y endpoints de health en dev (craco).
- `NODE_ENV` — Definido por el entorno de build (development/production).

No existe `.env.example` en el repositorio; `.env*` está en `.gitignore`.

---

## 7. Servicios externos e integraciones

| Servicio | Uso | Configuración |
|----------|-----|----------------|
| MongoDB | Persistencia principal | MONGO_URL, DB_NAME |
| Stripe | Checkout para reservas públicas, webhook | STRIPE_API_KEY; webhook en `/api/webhook/stripe` |
| Resend | Email de confirmación de reserva | RESEND_API_KEY, SENDER_EMAIL, HOTEL_NOTIFICATION_EMAIL |
| Emergent (LLM) | Sugerencias de respuesta, resúmenes, sugerencias de tareas | EMERGENT_LLM_KEY; paquete emergentintegrations |
| Emergent (frontend) | Visual edits en dev (opcional) | @emergentbase/visual-edits vía craco |

---

## 8. Flujo de autenticación

1. **Login:** `POST /api/auth/login` con `email` y `password`. Se busca usuario por email, se verifica contraseña con `pwd_context.verify`, se comprueba `is_active` y tenant no suspendido (para no platform_admin con `tenant_id`). Se devuelve JWT (`create_token`) y `UserResponse`.
2. **Token:** JWT con `sub` (user id), `role`, `exp` (TOKEN_EXPIRE_MINUTES = 24h). Algoritmo HS256, clave `SECRET_KEY`.
3. **Rutas protegidas:** `get_current_user` (Depends OAuth2PasswordBearer) decodifica el token, carga usuario desde `db.users`, aplica comprobación de tenant suspendido y devuelve `UserModel`. `require_role(*roles)` restringe por rol.
4. **Frontend:** Login guarda token y usuario en `localStorage` (`hotel_token`, `hotel_user`) y pone `Authorization: Bearer` en axios. El interceptor de respuesta ante 401 limpia token y redirige a `/login`. Tras login, redirección por rol: platform_admin → `/platform-admin`, owner → `/corporate`, resto → `/` o `/tasks`.

---

## 9. Flujo de integración de pagos (Stripe)

1. **Reserva pública:** Cliente crea reserva pendiente con `POST /api/public/booking/create` o flujo que termina en `POST /api/public/booking/pending`; se guarda en `pending_bookings`.
2. **Checkout:** Frontend llama `POST /api/public/checkout/session` con `pending_id` y opcionalmente `origin_url`. Backend crea sesión Stripe (StripeCheckout de emergentintegrations), guarda `payment_transactions` con `session_id` y `payment_status: initiated`, devuelve `url` y `session_id`.
3. **Redirección:** Usuario paga en Stripe y vuelve a la app (success_url con `session_id`).
4. **Estado:** Frontend llama `GET /api/public/checkout/status/{session_id}`. Si Stripe devuelve `paid`, el backend puede crear la reserva en `reservations`, actualizar habitación, actualizar `payment_transactions`, enviar email de confirmación (Resend) y devolver `status: "paid"` y `reservation_id`.
5. **Webhook:** `POST /api/webhook/stripe` recibe el evento de Stripe; se usa `stripe.handle_webhook(body, Stripe-Signature)`. Si `payment_status == "paid"` se actualiza `payment_transactions`. No se observa en código uso explícito de `STRIPE_WEBHOOK_SECRET` en el servidor (la verificación puede estar dentro de `emergentintegrations`).

---

## 10. Preparación para despliegue

- **Faltan:** Dockerfile, docker-compose, vercel.json (o equivalente), scripts de deploy, documentación de despliegue.
- **Presente:** `.gitignore` que excluye `.vercel`, builds, `.env*`; `.emergent/emergent.yml` con imagen base (FastAPI/React/Mongo/shadcn).
- **Riesgos:** Sin `.env.example` es fácil olvidar variables; CORS por defecto `*` y JWT por defecto con secreto débil; backend no filtra por tenant/property en varios endpoints (ver sección 11).

---

## 11. Posibles problemas de seguridad

1. **JWT_SECRET_KEY por defecto:** Valor `'hotel-secret-2024'` si no se define env; en producción permite falsificación de tokens.
2. **CORS `*` por defecto:** Con `allow_origins=os.environ.get('CORS_ORIGINS','*').split(',')` cualquier origen puede llamar al API si no se configura CORS_ORIGINS.
3. **Uso de `bcrypt` sin importar:** En `update_user` se usa `bcrypt.hash(dump['password'])` pero no hay `import bcrypt` en `server.py`. Provocará `NameError` al actualizar contraseña de usuario (bug funcional y posible impacto en seguridad si se parchea mal).
4. **Aislamiento multi-tenant:** Endpoints como `GET /api/rooms`, `GET /api/reservations`, `GET /api/guests` devuelven todos los documentos sin filtrar por `property_id` ni `tenant_id`. Un usuario de un hotel podría ver datos de otros.
5. **Lookup público de reservas:** `GET /api/public/booking/lookup?booking_ref=...&email=...` devuelve datos de la reserva si el email coincide. Un `booking_ref` predecible (p. ej. 8 caracteres del UUID) podría permitir enumeración; conviene limitar tasa o robustecer el identificador.
6. **Webhook Stripe:** La verificación de firma depende de la librería `emergentintegrations`; confirmar que se usa webhook secret y que no se confía en el body sin verificar.
7. **Credenciales de demo en Login.js:** Lista `DEMO_ACCOUNTS` con emails y contraseñas en claro; aceptable para dev, no para producción.
8. **Resend:** Paquete `resend` usado pero no listado en `requirements.txt`; el despliegue puede fallar al importar.

---

## 12. Archivos/carpetas que parecen no usados, duplicados, solo tests, relacionados con Emergent o eliminables después

| Tipo | Ruta / descripción |
|------|---------------------|
| Tests / reportes | `test_reports/` (iterations 1–14 JSON, pytest XML): salidas de tests; se pueden regenerar; candidatos a no versionar o a limpiar periódicamente. |
| Tests backend | `backend/tests/*.py`: tests por iteración (test_iteration5.py … test_iteration10.py) y por dominio (test_hotel_api, test_public_booking, test_multiproperty, test_platform_admin, test_roles_refactor, test_staylo_refactor). Útiles para CI; los de “iteración” podrían consolidarse o renombrar. |
| Emergent | `.emergent/emergent.yml`: configuración de entorno Emergent. `frontend/package.json` devDependency `@emergentbase/visual-edits` (opcional). `craco.config.js` integra visual-edits en dev. Mantener si se usa la plataforma; si no, eliminables. |
| Protocolo de tests | `test_result.md`: instrucciones YAML para agente de testing; es documentación de proceso, no código. |
| Diseño | `design_guidelines.json`: guía de diseño (tipografía, colores, componentes). No referenciado por código; documentación. |
| Memoria / producto | `memory/PRD.md`: PRD y changelog; documentación. |
| Frontend – health-check | `frontend/plugins/health-check/`: solo se carga si `ENABLE_HEALTH_CHECK === "true"`. Opcional; eliminable si no se usa. |
| UI no referenciados desde páginas | Muchos componentes en `frontend/src/components/ui/` (accordion, carousel, calendar, command, drawer, hover-card, menubar, navigation-menu, resizable, slider, etc.) no aparecen importados en las páginas actuales; son librería shadcn; se pueden mantener por si se usan en el futuro o eliminar los que se confirme que no se usan. |
| Posible duplicado | `RoomModel` y lógica de “rooms” legacy vs `room_types` + propiedades: dos modelos de habitaciones (rooms con type/price_per_night vs room_types); no es archivo duplicado pero sí deuda de modelo. |

---

## 13. Zonas de riesgo en el código

- **server.py (monolito):** Cualquier cambio puede afectar auth, pagos o multi-tenant; refactors sin tests son arriesgados.
- **Auth y contraseñas:** `update_user` usa `bcrypt.hash` sin import; flujo de login y seeds usan `hash_password` (passlib). Unificar y corregir import o reemplazar por `hash_password`.
- **Endpoints sin filtro tenant/property:** `/api/rooms`, `/api/reservations`, `/api/guests`, y otros que no filtran por `current_user.property_id` o `tenant_id`; cambios aquí afectan privacidad entre tenants.
- **Stripe y webhook:** Lógica de checkout y creación de reserva tras pago; cambios pueden provocar doble cobro, reservas sin pago o fallos de webhook.
- **Seeds en startup:** `startup()` ejecuta todos los seeds; en producción puede no ser deseable; tocar puede afectar entornos de staging/dev.
- **Login.js con DEMO_ACCOUNTS:** Cualquier cambio que exponga más o que se lleve a producción sin sustituir por configuración segura.

---

## 14. Zonas de bajo riesgo para limpieza

- Añadir `import bcrypt` o sustituir `bcrypt.hash` por `hash_password` en `update_user` (sin cambiar contrato del endpoint).
- Crear `.env.example` con todas las variables documentadas (solo añadir archivo).
- Limpieza de `test_reports/` (o mover a .gitignore) y de reportes XML viejos.
- Consolidar o renombrar tests de “iteración” en `backend/tests/` sin cambiar comportamiento.
- Documentar o eliminar `design_guidelines.json` / `test_result.md` si no se usan.
- Revisar dependencias: añadir `resend` a `requirements.txt` si se usa en producción.
- Ajustar `.gitignore`: entradas duplicadas y líneas raras (android-sdk, `-e`, etc.) sin tocar código de aplicación.

---

## 15. Fases de refactor recomendadas (orden seguro)

1. **Fase 1 – Sin impacto en comportamiento**  
   - Añadir `.env.example`.  
   - Añadir `resend` a requirements.txt.  
   - Corregir uso de bcrypt en `update_user` (import o `hash_password`).  
   - Limpiar `.gitignore` y opcionalmente excluir o borrar `test_reports/` del repo.

2. **Fase 2 – Mejoras de seguridad configuración**  
   - Exigir `JWT_SECRET_KEY` en producción (fallar si es el default).  
   - Documentar y, en deploy, configurar `CORS_ORIGINS` restrictivo.  
   - Revisar verificación del webhook de Stripe (y uso de webhook secret).

3. **Fase 3 – Aislamiento multi-tenant**  
   - Introducir filtros por `property_id`/`tenant_id` en `/rooms`, `/reservations`, `/guests` según `current_user`, con tests que validen aislamiento.  
   - Ajustar otros endpoints que deban ser por propiedad/tenant.

4. **Fase 4 – Estructura del backend**  
   - Partir `server.py` en routers (auth, users, rooms, …) y modelos en módulos separados, manteniendo la misma API y tests.  
   - Mover seeds a módulo propio y opcionalmente hacer que no se ejecuten en producción.

5. **Fase 5 – Frontend y dependencias**  
   - Eliminar o condicionar `DEMO_ACCOUNTS` en producción.  
   - Revisar componentes UI no usados y dependencias Emergent/health-check; eliminar o documentar.

---

# Salidas solicitadas

## A. Mapa de arquitectura del proyecto

```
STAYLO-SYSTEM-main/
├── backend/
│   ├── server.py          # Monolito API (FastAPI + Motor + auth + rutas + seeds)
│   ├── requirements.txt   # Python deps (FastAPI, motor, pymongo, jose, passlib, emergentintegrations, …)
│   └── tests/             # Pytest (10 archivos)
├── frontend/
│   ├── package.json       # React 19, react-router, axios, Radix, Tailwind, shadcn, recharts, …
│   ├── craco.config.js    # Alias @, health-check opcional, visual-edits (Emergent)
│   ├── public/index.html
│   ├── plugins/health-check/  # Opcional (ENABLE_HEALTH_CHECK)
│   └── src/
│       ├── index.js, App.js
│       ├── contexts/      # AuthContext, PropertyContext
│       ├── utils/api.js   # Axios → REACT_APP_BACKEND_URL/api
│       ├── components/    # Layout.js, ui/* (shadcn)
│       └── pages/         # Login, Dashboard, Reservations, … PlatformAdmin, …
├── memory/PRD.md
├── design_guidelines.json
├── test_result.md
├── test_reports/          # JSON + pytest XML
└── .emergent/emergent.yml
```

Flujo: Browser → React SPA (Vite/CRA vía CRACO) → HTTP + JWT → FastAPI (server.py) → Motor → MongoDB. Servicios externos: Stripe, Resend, Emergent LLM.

---

## B. Mapa de dependencias

**Backend (requirements.txt):**  
fastapi, uvicorn, boto3, requests-oauthlib, cryptography, python-dotenv, pymongo, pydantic, email-validator, pyjwt, bcrypt, passlib, tzdata, motor, pytest, black, isort, flake8, mypy, python-jose, requests, pandas, numpy, python-multipart, jq, typer, emergentintegrations.  
**No en requirements:** resend (usado en código).

**Frontend (dependencies):**  
react, react-dom, react-router-dom, axios, @radix-ui/* (varios), class-variance-authority, clsx, cmdk, date-fns, embla-carousel-react, input-otp, lucide-react, next-themes, react-day-picker, react-hook-form, react-resizable-panels, recharts, sonner, tailwind-merge, tailwindcss-animate, vaul, zod, @hookform/resolvers.  
**DevDependencies:** @craco/craco, @emergentbase/visual-edits (tgz), eslint*, tailwindcss, postcss, autoprefixer.

**Integraciones:**  
Stripe (emergentintegrations.payments.stripe.checkout), Resend (resend), LLM (emergentintegrations.llm.chat).

---

## C. Informe de archivos no usados / eliminables

| Categoría | Archivos / Carpetas | Notas |
|-----------|----------------------|--------|
| Reportes de test | `test_reports/*.json`, `test_reports/pytest/*.xml` | Generados; se pueden ignorar en git o borrar. |
| Config Emergent | `.emergent/emergent.yml` | Eliminable si no se usa Emergent. |
| Dev optional | `frontend/plugins/health-check/*` | Solo con ENABLE_HEALTH_CHECK; eliminable si no se usa. |
| Documentación | `test_result.md`, `design_guidelines.json` | No usados por código; mantener o archivar. |
| Componentes UI posiblemente no usados | (ej.) accordion, carousel, calendar, command, drawer, hover-card, menubar, navigation-menu, resizable, slider, breadcrumb, aspect-ratio, input-otp, etc. | Revisar con búsqueda de imports desde `pages/` y `Layout.js`; los no referenciados son candidatos a eliminar o dejar como librería. |

No se han eliminado archivos; solo se listan como candidatos.

---

## D. Preocupaciones de seguridad y despliegue

**Seguridad:**  
- JWT con secreto por defecto; CORS `*`; `bcrypt` sin import en update_user; aislamiento multi-tenant insuficiente en varios endpoints; lookup público de reservas; credenciales de demo en frontend; dependencia `resend` no declarada.

**Despliegue:**  
- Sin Dockerfile/docker-compose; sin `.env.example`; seeds ejecutados en startup; sin documentación de despliegue en el repo.

---

## E. Hoja de ruta de refactor seguro (de menor a mayor riesgo)

| Orden | Fase | Riesgo | Acciones |
|-------|------|--------|----------|
| 1 | Env y deps | Bajo | .env.example, resend en requirements, arreglo bcrypt en update_user, limpieza .gitignore/test_reports. |
| 2 | Config seguridad | Bajo | JWT y CORS obligatorios en prod; revisar webhook Stripe. |
| 3 | Multi-tenant | Medio | Filtros por property/tenant en rooms, reservations, guests + tests. |
| 4 | Refactor server.py | Medio-alto | Dividir en routers/modelos sin cambiar API; tests de regresión. |
| 5 | Frontend y opcionales | Bajo-medio | DEMO_ACCOUNTS, componentes UI no usados, Emergent/health-check. |

---

*Fin del informe. No se ha modificado código, esquema de base de datos ni comportamiento de API o frontend.*

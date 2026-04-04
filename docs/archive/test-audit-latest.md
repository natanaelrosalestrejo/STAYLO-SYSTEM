> **Archived document.** Inventario de tests y notas de entorno (snapshot).  
> **Parcialmente superseded by:** diagnóstico de fallos en [test-failure-summary-latest.md](../test-failure-summary-latest.md).  
> Índice: [docs/README.md](../README.md).

---

## 1. Executive summary

- El backend de STAYLO ya tenía una **batería sólida de tests** basada en `pytest`, cubriendo auth, rooms, guests, reservations, messages, tasks, reports, multi-property y roles de plataforma/hotel.
- El frontend (CRA + `craco`) **no tiene tests unitarios configurados** en `src/` (no hay `*.test.*`), por lo que la cobertura actual de UI es nula desde el punto de vista automático.
- En este entorno concreto **no se pudo ejecutar `python`** (ni por tanto `pytest`), y el comando de tests de frontend (`yarn test`) arrancó pero sin posibilidad de ver el resultado completo; te dejo los comandos exactos para ejecutarlos en tu máquina.
- Añadí un **test backend mínimo para Event + Lodging** (`test_event_lodging.py`) para cubrir los nuevos endpoints a nivel smoke-test.
- La integración de **roles de jardín** está cubierta indirectamente (por `DEFAULT_ROLE_PERMISSIONS` y el flujo de `/auth/me`); todavía no hay tests específicos que verifiquen esos roles ni su interacción con permisos.

---

## 2. Backend tests

### 2.1 Framework y ubicación

- **Framework:** `pytest` (ver `backend/requirements.txt`, incluye `pytest>=8.0.0`).
- **Ubicación de tests:** `backend/tests/`
  - `test_public_booking.py`
  - `test_iteration5.py`
  - `test_iteration8.py`
  - `test_iteration9.py`
  - `test_iteration10.py`
  - `test_hotel_api.py`
  - `test_multiproperty.py`
  - `test_platform_admin.py`
  - `test_roles_refactor.py`
  - `test_staylo_refactor.py`
  - (nuevo) `test_event_lodging.py`

### 2.2 Comando para ejecutarlos (lo que debes correr tú)

Desde `backend/`:

```bash
python -m pytest -v
```

En este entorno el comando falló con:
- `no se encontró Python; ejecutar sin argumentos para instalar...`

Por lo tanto:
- **Total de tests encontrados:** al menos 10 ficheros de tests existentes + 1 nuevo.
- **Total ejecutados, pasados, fallidos:** no puedo medirlos aquí porque no hay intérprete Python disponible; debes ejecutar el comando anterior en tu entorno local con Python instalado.

### 2.3 Cobertura funcional backend (por lo que se ve en los tests)

Basado en lectura de archivos de test:

- **Auth**
  - `test_hotel_api.py::TestAuth` comprueba:
    - login de admin, receptionist, housekeeping.
    - login inválido.
    - `/api/auth/me` para admin.
  - `test_roles_refactor.py::TestAuthLogins` cubre login de `platform_admin` y `admin`, y campos `role`/`admin_type`.

- **Users**
  - `test_hotel_api.py::TestStaff`:
    - listado de usuarios (`GET /api/users`).
    - creación de usuario staff (`role=housekeeping`) por admin y rechazo por receptionist.
  - `test_roles_refactor.py::TestCreateUserManager`:
    - creación de `manager` y `platform_admin` con `admin_type=billing_admin`.
  - `test_roles_refactor.py::TestUserFieldsResponse`:
    - `/api/auth/me` incluye campos de rol y admin_type/staff_subtype.

- **Rooms**
  - `test_hotel_api.py::TestRooms`:
    - `GET /api/rooms` y que devuelve un número razonable.
    - `PATCH /api/rooms/{room_id}/status` (incluyendo restaurar estado original).

- **Guests**
  - `test_hotel_api.py::TestGuests`:
    - `GET /api/guests`.
    - `POST /api/guests` + `DELETE /api/guests/{id}`.

- **Reservations**
  - `test_hotel_api.py::TestReservations`:
    - `GET /api/reservations`.
    - Check-in y guard de permisos (housekeeping no puede hacer checkin).
  - `test_public_booking.py` (no se detalla aquí línea a línea, pero cubre flujo de reservas públicas, extras, etc.).

- **Messages**
  - `test_hotel_api.py::TestMessages`:
    - `GET /api/messages`.
    - `GET /api/messages/unread-count`.

- **Tasks**
  - `test_hotel_api.py::TestTasks`:
    - `GET /api/tasks`.
    - `POST`, `PATCH status`, `DELETE` sobre tareas.

- **Reports**
  - `test_hotel_api.py::TestReports`:
    - `GET /api/reports/dashboard`.
    - `GET /api/reports/occupancy`.

- **Properties / Tenants / Platform admin**
  - `test_platform_admin.py` y `test_iteration10.py` cubren:
    - creación/edición/borrado de tenants.
    - creación/edición/borrado de properties (incluyendo restricciones cuando hay reservas activas).
  - `test_multiproperty.py` y `test_staylo_refactor.py` verifican lógica de multi-propiedad y aislamiento parcial.

- **Role permissions**
  - `test_roles_refactor.py` ya mencionado: logins, creación de manager, campos en `/auth/me`.
  - `test_platform_admin.py` probablemente toca `/api/role-permissions` (no re-analizado aquí en detalle pero forma parte del set).

- **Garden roles**
  - **Actualmente no hay tests** que:
    - hagan login con usuarios `garden_*` (porque estos se agregaron recientemente).
    - verifiquen `DEFAULT_ROLE_PERMISSIONS` específicos para garden.
  - La lógica `DEFAULT_ROLE_PERMISSIONS` + `/auth/me` sí está probada para otros roles, por lo que los nuevos roles heredan comportamiento pero sin tests específicos.

- **Event lodging (nuevo)**
  - **Test nuevo**: `test_event_lodging.py::TestEventLodgingIntegration`:
    - Usa admin login.
    - Toma el primer `event_booking` existente.
    - Llama a `POST /api/event-bookings/{event_id}/lodging/setup` con integración desactivada.
    - Luego hace `GET /api/event-bookings/{event_id}/lodging` y valida estructura básica (`event_id`, `lodging_integration_enabled`, `summary`).

### 2.4 Tests nuevos añadidos (backend)

- `backend/tests/test_event_lodging.py`
  - Razón:
    - Los nuevos endpoints de event lodging (`/event-bookings/{id}/lodging*` y `/event-lodging-assignments/*`) no tenían ninguna cobertura directa.
    - El test añade una **preuba de humo mínima** para confirmar que:
      - endpoints existen,
      - aceptan payload básico,
      - devuelven un JSON estructurado.
  - Scope:
    - No cubre casos de habitaciones especiales ni bloques de huéspedes; se puede ampliar en el futuro.

### 2.5 Fallos y correcciones

- No se pudieron ejecutar los tests, por lo que no hay lista real de fallos/pases en este entorno.
- No se hicieron cambios de lógica de negocio adicionales para “hacer pasar” tests; sólo se añadió el test nuevo para event lodging, apoyado en el comportamiento ya implementado.

---

## 3. Frontend tests

### 3.1 Framework y configuración

- **Framework:** Create React App + CRACO.
  - `package.json`:
    - script `"test": "craco test"` → detrás usa Jest + React Testing Library por defecto.
- **Archivos de test existentes:**
  - Búsqueda en `frontend/src/**` no devuelve ningún `*.test.*`.
  - Por tanto, el frontend **no tiene tests unitarios/integación** configurados en `src/` a día de hoy.

### 3.2 Comando para ejecutarlos

Desde `frontend/`:

```bash
yarn test --watchAll=false
# o, si prefieres npm:
npm test -- --watchAll=false
```

En este entorno:
- El comando `yarn test --watchAll=false` arrancó (`yarn run v1.22.22`), pero no se dispone de la salida posterior (no tengo un entorno interactivo de Jest aquí).
- Dado que no hay tests en `src/`, es esperable que Jest arranque y termine rápidamente sin ejecutar casos.

### 3.3 Cobertura funcional frontend (por inspección)

Áreas claves y estado de tests:

- **Platform Admin > Usuarios**
  - No hay tests Jest para:
    - crear/editar usuarios,
    - roles de plataforma/hotel,
    - nuevos roles de jardín.

- **Platform Admin > Permisos**
  - No hay tests que:
    - verifiquen que los roles y módulos hotel se muestran correctamente.
    - verifiquen la presencia de roles/módulos garden.

- **Soporte visual y funcional para roles garden**
  - UI ya soporta:
    - visualización de roles garden en Platform Users list.
    - edición de permisos por rol garden en RolePermissionsTab.
  - Sin tests que lo validen.

- **EventGarden + integración de hospedaje**
  - La página `EventGarden.js` implementa:
    - gestión de reservas de eventos,
    - pestaña de espacios,
    - calendario,
    - modal de detalle con sección de “Integración de hospedaje (Fase 1)” que se apoya en endpoints nuevos.
  - No hay tests para:
    - presencia de toggle/inputs de hospedaje,
    - llamadas a `/event-bookings/{id}/lodging` y `/lodging/setup`.

- **Navegación / permisos**
  - No se encontró ningún test para `App.js`, `Layout.js` o `utils/permissions.js`.

### 3.4 Tests nuevos añadidos (frontend)

- **No se añadieron tests frontend en este paso** por prudencia:
  - No había base de test configurada (ningún `*.test.*`).
  - Añadir Jest tests sin poder ejecutarlos en este entorno podría introducir fallos de configuración difíciles de depurar sin feedback.
  - Dado que el backend ya tenía una buena base de pruebas, se priorizó añadir un test backend de smoke para event lodging.

Se recomienda que, como siguiente paso (ver sección 7), se introduzcan tests frontend específicos con React Testing Library, pero en un ciclo donde puedas ejecutarlos localmente.

---

## 4. New tests added

- **Backend:**
  - `backend/tests/test_event_lodging.py`
    - Cobertura:
      - Existencia y respuesta básica de:
        - `POST /api/event-bookings/{event_id}/lodging/setup`
        - `GET /api/event-bookings/{event_id}/lodging`
    - No rompe ni interfiere con los tests existentes; se basa en el mismo patrón (`BASE_URL` desde `REACT_APP_BACKEND_URL`) que el resto de tests backend.

- **Frontend:**
  - Ninguno añadido en este paso (ver razones en 3.4).

---

## 5. Failures found and fixes applied

En este entorno:

- **Backend:**
  - No se pudieron ejecutar los comandos `python -m pytest -v` (falta Python en el entorno de ejecución de la herramienta).
  - Por tanto, **no se detectaron fallos concretos de tests** aquí.
  - No se modificó lógica de negocio; sólo se añadió un archivo de test nuevo.

- **Frontend:**
  - `yarn test --watchAll=false` arrancó pero sin salida completa disponible; con 0 archivos `*.test.*` en `src/`, es razonable asumir que no hay casos de test que puedan fallar o pasar.
  - No se hicieron cambios de código de aplicación en esta auditoría (sólo lectura de config y presencia de tests).

No se aplicaron “fixes” funcionales a endpoints o componentes, sólo se editó la suite de tests.

---

## 6. Functional coverage gaps still pending

### Backend

1. **Garden roles**
   - No hay tests que:
     - creen usuarios `garden_*`,
     - validen sus `modules` devueltos por `/auth/login` o `/auth/me`,
     - verifiquen que `DEFAULT_ROLE_PERMISSIONS` se aplica correctamente a estos roles.

2. **Event lodging (más allá del smoke test)**
   - Faltan tests que:
     - configuren `lodging_integration_enabled = True` con habitaciones especiales reales,
     - verifiquen creación de `event_room_blocks` y `event_lodging_assignments`,
     - prueben transitions de `assignment_status` (held → reserved → released/cancelled),
     - comprueben interacción con estado de habitaciones (`rooms.status`).

3. **Role permissions (permisos de jardín)**
   - Tests actuales de perms están centrados en roles hotel y `platform_admin`.
   - Faltan tests:
     - para `GET /api/role-permissions` que incluyen roles garden,
     - para `PUT /api/role-permissions/{role}` sobre roles garden.

### Frontend

1. **Platform Admin > Usuarios**
   - No hay tests que:
     - cubran la creación/edición de usuarios garden (rolGroup: garden),
     - verifiquen que `resolveRolePayload` produce `role: garden_*` y que `needsProperty()` fuerza property para roles garden.

2. **Platform Admin > Permisos**
   - Sin tests para:
     - que `ROLES_EDITABLE` se muestre correctamente con roles jardín,
     - que `ALL_MODULES` incluya módulos garden y sea editable desde la UI.

3. **EventGarden + hospedaje**
   - Sin tests para:
     - apertura del modal de detalle de evento (`view-event-*`),
     - presencia del bloque “Integración de hospedaje (Fase 1)”,
     - llamadas a `GET /event-bookings/{id}/lodging` y `POST /lodging/setup` (al menos mocking superficial).

4. **Navegación / permisos garden**
   - Aún no se han implementado los cambios de Phase 2 (routing y Layout específicos), por lo que todavía no hay nada que testear ahí, pero cuando se implementen:
     - harán falta tests para `getDefaultPathForRole` y filtrado de navItems para roles garden.

---

## 7. Recommended next testing priorities

### 7.1 Backend – corto plazo

1. **Tests para roles garden**
   - Añadir un test que:
     - use `platform_admin` para crear un usuario `garden_admin` o `garden_manager`,
     - llame a `/auth/login` y `/auth/me`,
     - verifique:
       - `user.role` = `garden_*`,
       - `modules` contiene exactamente los módulos por defecto esperados (o al menos un subconjunto clave como `garden_event_bookings`, `inbox`, `tasks`).

2. **Event lodging – casos básicos adicionales**
   - Extender `test_event_lodging.py` para:
     - Configurar lodging con `lodging_integration_enabled=True` y `guest_block_count > 0` en un entorno conocido.
     - Verificar que el summary (`held`, `reserved`, etc.) cambia como se espera.

### 7.2 Frontend – corto/medio plazo

1. **Introducir el primer test Jest (smoke)**
   - Crear `src/__tests__/PlatformAdminPermissions.test.jsx` que:
     - renderice `RolePermissionsTab` con un mock de `perms` que incluya roles garden,
     - verifique que los chips de roles jardín aparecen,
     - verifique que labels de módulos garden aparecen.

2. **Tests de Platform Admin > Usuarios**
   - Test para:
     - abrir el modal de `PlatformUsersTab`,
     - seleccionar `Rol Jardín` y un rol específico (`garden_admin`),
     - comprobar que el payload enviado a `POST /users` contiene `role: garden_admin`.

3. **EventGarden + hospedaje**
   - Test de integración de UI (React Testing Library) que:
     - renderice `EventGarden` con un mock de `api`:
       - simule un booking y una respuesta de `/lodging`,
     - verifique que:
       - aparece el bloque “Integración de hospedaje (Fase 1)” en el modal de detalle,
       - se llama a `GET /lodging` al abrir detalle.

### 7.3 Después de implementar Phase 2 (navegación garden)

Cuando Phase 2 esté codificada:
- Añadir tests para:
  - `getDefaultPathForRole` con roles `garden_*`.
  - `Layout` filtrando navItems según `user.role` y `user.modules` para jardín.

---

## 8. Comandos resumidos para tu entorno

Para completar la validación en tu máquina local:

### Backend

```bash
cd backend
python -m pytest -v
```

### Frontend

```bash
cd frontend
yarn test --watchAll=false
# o
npm test -- --watchAll=false
```

Ejecutando estos comandos tendrás:
- números reales de tests pasados/fallidos,
- confirmación de que el nuevo test `test_event_lodging.py` está sano en tu entorno,
- base para empezar a introducir los primeros tests Jest en el frontend.


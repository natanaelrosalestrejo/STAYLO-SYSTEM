# Owner / Corporate dashboard — estado actual y base para evolución

**Documento:** análisis técnico y funcional previo a cambios de código.  
**Fecha:** 2025-03-26  
**Alcance:** dashboard corporativo existente, rutas relacionadas y brecha frente a un panel de control de negocio (hotel + jardines + hospedaje-evento).

---

## 1. Executive summary

- **Existe** un dashboard explícitamente pensado para visión de grupo: la página **`CorporateDashboard`** en la ruta **`/corporate`**, que consume un único endpoint **`GET /api/corporate/dashboard`**.
- **Roles que lo ven hoy:** en frontend y backend están alineados como **`owner`** y **`admin`** (hotel). No es exclusivo del rol `owner`; un administrador de hotel tiene la misma ruta y el mismo endpoint.
- El panel **mezcla hotel y jardines de eventos** (ingresos mensuales, ranking, gráfico comparativo, scores), pero los datos están **fuertemente sesgados al modelo hotel** en métricas como ocupación, oportunidad de ingresos y origen de reservas (canales de **reservas de habitación**, no de eventos).
- **No hay** desglose de ingresos por evento ni por hospedaje ligado a eventos en este dashboard; **no hay** P&L (gastos/utilidad); **no hay** alertas operativas; la “proyección” y la “oportunidad” son **heurísticas** basadas en reservas y habitaciones, no en contabilidad.
- **Evolución recomendada (mínimo riesgo):** **reutilizar** la misma página y el mismo endpoint, **extendiendo** la respuesta del backend con campos adicionales (y secciones UI nuevas) en lugar de duplicar dashboards o separar owner vs admin en una primera iteración—salvo que el negocio exija ocultar datos al rol `admin`.

---

## 2. Current dashboards found

### 2.1 Mapa de pantallas “dashboard” o vistas ejecutivas

| Vista | Archivo(s) | Ruta `App.js` | Endpoint(s) principal(es) | Roles (`allowedRoles` / nav) |
|-------|------------|---------------|---------------------------|------------------------------|
| **Dashboard corporativo / grupo** | `frontend/src/pages/CorporateDashboard.js` | `/corporate` | `GET /corporate/dashboard` | `owner`, `admin` (misma ruta) |
| **Listado estratégico hoteles** | `frontend/src/pages/HotelsOverview.js` | `/hotels` | `GET /properties/stats` (filtra `type === 'hotel'`) | `owner` (nav: solo owner) |
| **Listado estratégico jardines** | `frontend/src/pages/EventGardensOverview.js` | `/event-gardens` | `GET /properties/stats` (filtra `type === 'event_garden'`) | `owner` |
| **Dashboard operativo hotel** | `frontend/src/pages/Dashboard.js` | `/` | `GET /reports/dashboard`, `GET /reservations`, `GET /tasks` | `admin`, `receptionist`, `manager` |
| **Reportes (hotel)** | `frontend/src/pages/Reports.js` | `/reports` | Varios bajo `/reports/*` según implementación | `admin`, `owner`, `manager` |

**Notas:**

- **`/corporate`** es la vista más cercana a “owner / corporativo” unificada.
- **`/hotels`** y **`/event-gardens`** son **overviews por tipo** de propiedad, no un segundo dashboard ejecutivo; sirven de drill-down desde la navegación del owner.
- El **dashboard en `/`** es **operativo de hotel** (habitaciones, check-ins del día, tareas), no de grupo.

### 2.2 Backend — endpoint corporativo

- **Ruta:** `GET /api/corporate/dashboard`  
- **Ubicación:** `backend/server.py` (handler `corporate_dashboard`).  
- **Autorización:** `require_role("admin", "owner")` — igual que el acceso frontend a `/corporate`.

### 2.3 Otros endpoints útiles para contexto de negocio (no sustituyen al corporativo)

- `GET /api/properties/stats` — stats por propiedad (hotel vs `event_garden`); usado por HotelsOverview y EventGardensOverview.
- `GET /api/reports/revenue-breakdown` — desglose hotel vs evento a nivel de **reservas** (`event_name` en reserva); puede informar ingresos “ligados a evento” en sentido débil (portal hotel), no ingresos de `event_bookings` ni lodging.

---

## 3. Current owner/corporate dashboard analysis

### 3.1 KPIs que muestra la UI (`CorporateDashboard.js`)

1. **Fila ingresos:** ingresos del mes (grupo), ingresos históricos totales, ingresos esperados (confirmados futuros), proyección fin de mes.  
2. **Fila desempeño:** ocupación media (etiquetada como hoteles del grupo), “mejor hotel”, “mejor jardín”, número de **cobros pendientes** (conteo agregado).  
3. **Bloque “oportunidad de ingresos”:** estimación tipo **habitaciones vacías × tarifa × días restantes** (lógica hotel).  
4. **Gráfico de barras:** comparativo mensual **hotel vs eventos** (series `hotel` y `eventos` en datos).  
5. **Ranking:** top propiedades por ingresos del mes + barras de proporción + **performance score** hotel vs jardín (anillos).  
6. **Origen de reservas:** distribución por canal (`web`, `reception`, etc.) basada en **`reservation_source`** de **reservas de hotel**.

### 3.2 Datos que usa (origen en backend)

- **Hotel:** colección `reservations` (sin filtro explícito por tenant en el agregado global del handler), habitaciones `rooms` para ocupación y oportunidad.  
- **Jardines:** colección `event_bookings` (ingresos, pendientes de pago de evento, eventos próximos).  
- **Nombres mostrados:** el backend resuelve nombres de propiedad vía `properties` para ranking; el response también incluye nombres fijos de demo en objetos anidados (`hotel.property_name`, `event_gardens.property_name` como strings estilo demo).  
- **Crecimiento / mes anterior:** combinación de reservas hotel + eventos del mes vs mes anterior.  
- **“Origen de reservas”:** solo pipeline sobre **reservas** hoteleras, no sobre contratos de evento.

### 3.3 ¿Mezcla hotel y jardines?

**Sí**, de forma explícita: objeto `group`, `property_ranking`, `comparison_chart`, y subobjetos `hotel` / `event_gardens` en la respuesta. La UI lo refleja (tarjetas, gráfico dual, dos scores).

### 3.4 ¿Visión real de ingresos, pendientes y control de negocio?

- **Ingresos:** hay visión **revenue-oriented** (mes, histórico, esperado, proyección lineal simple). No es contabilidad ni conciliación bancaria.  
- **Pagos pendientes:** un **número** agregado (hotel + eventos en el conteo del grupo); no desglosa montos en MXN pendientes por línea de negocio en la tarjeta principal.  
- **Control de negocio:** útil como **tablero ejecutivo demo / grupo pequeño**; **no** incluye gastos, utilidad, cash flow, ni alertas accionables más allá del indicador de pendientes.

### 3.5 Partes reutilizables

- Estructura de **tarjetas KPI**, **refresh**, **gráfico Recharts**, **ranking**, patrón de datos `group` / `revenue_intelligence`.  
- Separación conceptual **hotel vs event_gardens** en la API y en parte de la UI.  
- Tests backend existentes que validan la **forma** del JSON (`test_iteration5.py`, etc.).

### 3.6 Partes demasiado orientadas a hotel o demo

- **Ocupación** y **oportunidad de ingresos:** texto y fórmula centrados en **habitaciones hotel**.  
- **Origen de reservas:** solo canales de **reserva hotel**, irrelevante como “mix comercial” del jardín.  
- **Leyendas del gráfico** en frontend: nombres fijos tipo **“Hotel Boutique”** y **“Jardín de Amargati”** en lugar de nombres dinámicos del tenant.  
- **Nombres** embebidos en la respuesta del API para bloques `hotel` / `event_gardens` (riesgo de sensación “demo” multi-tenant).  
- **No incorpora** ingresos ni ocupación derivados del **módulo event+lodging** (`event_lodging_assignments`, etc.).

---

## 4. Reusable parts

| Elemento | Reutilización |
|----------|----------------|
| Página `CorporateDashboard.js` | Base única para añadir secciones (nuevas filas, nuevas tarjetas). |
| `GET /api/corporate/dashboard` | Contrato estable; ampliar con claves nuevas sin romper las existentes. |
| Componentes visuales (`MetricCard`, `ScoreRing`, grid) | Mantener; solo cambiar datos y copys. |
| Vistas `/hotels` y `/event-gardens` | Drill-down; no sustituir al dashboard grupo. |
| Tests de estructura del endpoint | Ampliar aserciones cuando se añadan campos. |

---

## 5. Missing business-control pieces

Comparado con el objetivo deseado para el owner:

| Objetivo | Estado actual | Comentario |
|----------|---------------|------------|
| Ingresos totales | **Parcial** | Hay totales grupo + histórico; dependen de agregados globales en backend. |
| Ingresos por evento | **No** en corporativo | Existiría vía listados de `event_bookings` en otras pantallas; no en este dashboard. |
| Ingresos por hospedaje (ligado a evento) | **No** | Lodging fase 1 no suma revenue separado en este endpoint. |
| Pagos pendientes | **Parcial** | Conteo agregado; sin desglose hotel vs jardín vs monto total MXN en UI principal. |
| Eventos próximos | **No** en corporativo | Sí aparece métrica en stats de jardín por propiedad / overview jardines; no en `CorporateDashboard`. |
| Alertas | **No** | Solo indirectamente (pendientes > 0 con color). |
| Ocupación relacionada con eventos | **No** | La ocupación mostrada es de **habitaciones hotel**. |
| Resumen financiero simple (ingresos / gastos / utilidad) | **No** | No hay modelo de gastos en el flujo actual. |
| Control cruzado hotel + jardines | **Parcial** | Visualmente sí; datos no siempre filtrados por tenant/propiedad del owner. |

**Qué habría que modificar (cuando se implemente):**

- Backend: extender `corporate_dashboard` (o sub-recursos) con series nuevas y/o filtros por `tenant_id` / propiedades del usuario.  
- Frontend: nuevas secciones y etiquetas; reemplazar leyendas fijas por datos del API.  
- Opcional: restringir `/corporate` solo a `owner` si el producto lo exige (cambio de rol y tests).

**Qué no conviene tocar de golpe:**

- La lógica core de reservas y reportes hotel usada por el resto de la app.  
- Sustituir el dashboard operativo `/` por el corporativo para roles equivocados.

---

## 6. Safest evolution path

### Opciones evaluadas

1. **Reutilizar y extender** el dashboard actual + endpoint → **recomendado como primera iteración.**  
2. **Variante solo owner:** nueva ruta/página duplicada → más mantenimiento y riesgo de divergencia.  
3. **Separar dashboard hotel vs owner:** implica redefinir quién ve qué; el actual ya mezcla; duplicaría conceptos.  
4. **Separar dashboard jardín vs owner:** las vistas `/event-gardens` ya cubren lista; un cuarto dashboard fragmenta la experiencia.

### Recomendación

- **Un solo dashboard corporativo** (`/corporate`), **mismo archivo** como punto de partida, **extendiendo** `GET /api/corporate/dashboard` con campos nuevos (p. ej. totales lodging, lista top eventos, pendientes desglosados) de forma **aditiva** para no romper clientes/tests existentes.  
- **Parametrizar** textos y nombres (eliminar demo del gráfico) como mejora de bajo riesgo en la misma página.  
- Valorar **restringir** acceso solo a `owner` en una fase posterior si `admin` no debe ver métricas de grupo.

---

## 7. Recommended implementation plan (sin código; orden sugerido)

1. **Auditar datos:** definir qué colecciones alimentan cada KPI nuevo (eventos próximos, montos pendientes en MXN, revenue lodging si existe en modelo).  
2. **Backend:** ampliar respuesta de `corporate/dashboard` con objetos opcionales (`event_pipeline`, `lodging_summary`, `pending_breakdown`, …) manteniendo claves actuales.  
3. **Frontend:** añadir bloques en `CorporateDashboard.js`; sustituir labels fijos del gráfico por props del API.  
4. **Multi-tenant:** si aplica, filtrar agregados por `tenant_id` del owner antes de exponer totales globales.  
5. **Tests:** extender `test_iteration5` / tests corporativos con las nuevas claves.  
6. **Fase 2 (mayor alcance):** modelo de gastos o integración contable; alertas push o lista de umbrales.

---

## Referencias rápidas en código

| Qué | Dónde |
|-----|--------|
| Ruta React | `frontend/src/App.js` → `path="/corporate"` |
| Página | `frontend/src/pages/CorporateDashboard.js` |
| API | `backend/server.py` → `@api_router.get("/corporate/dashboard")` |
| Rol API | `require_role("admin", "owner")` |
| Tests API | `backend/tests/test_iteration5.py`, `test_multiproperty.py`, `test_iteration8.py` |

---

## Actualización (iteración implementada)

Se extendió `GET /api/corporate/dashboard` con campos aditivos: `chart_labels`, `pending_breakdown`, `upcoming_events` (lista), `lodging_summary`, `alerts`. Los nombres de propiedad en `hotel` / `event_gardens` pasan a ser dinámicos (primera propiedad hotel / jardín en BD). `estimated_lodging_revenue` es un **proxy** (suma de `price_per_night × noches` sobre asignaciones held/reserved).  
UI: `CorporateDashboard.js` muestra alertas, desglose de montos pendientes, tabla de próximos eventos y resumen de hospedaje; leyendas del gráfico usan `chart_labels`.

# Auditoría de consolidación — documentación Markdown (STAYLO)

> **Nota:** Las tablas de inventario y rutas en este archivo describen el estado **antes** de la reorganización del 2026-03-28. La estructura **actual** está en [README.md](./README.md) y el detalle de movimientos en [documentation-consolidation-pass1.md](./documentation-consolidation-pass1.md).

**Alcance:** solo archivos `.md` del repositorio del producto.  
**Exclusión intencional:** dependencias bajo `.venv/` (p. ej. licencias de `pip`/`idna`) — no forman parte de la documentación STAYLO.

---

## 1. Totales

| Métrica | Valor |
|--------|--------|
| Archivos `.md` en el árbol del workspace | 20 |
| Archivos bajo `.venv/` (terceros) | 2 |
| **Documentación del proyecto (STAYLO)** | **18** |

Rutas del proyecto (18):

- Raíz: `README.md`, `TECHNICAL_AUDIT_REPORT.md`
- `backend/`: `BACKEND_STABILIZATION_STATUS.md`, `SEED_ANALYSIS.md`, `REFACTOR_PLAN_MODULAR.md`
- `frontend/`: `README.md`
- `docs/`: 12 archivos (lista en §2)

---

## 2. Inventario

| Ruta | Título / propósito (resumido) | Estado probable | Tema principal |
|------|--------------------------------|-----------------|----------------|
| `README.md` | Título del repo; sin contenido útil | Obsoleto / incompleto | other |
| `TECHNICAL_AUDIT_REPORT.md` | Auditoría técnica global (arquitectura, stack, riesgos), mar 2026 | Parcialmente obsoleto | audit, architecture |
| `backend/BACKEND_STABILIZATION_STATUS.md` | Estado del refactor modular backend; fases; permisos en runtime | Parcialmente obsoleto (fases “pendientes” vs código actual) | architecture, permissions, platform admin |
| `backend/SEED_ANALYSIS.md` | Análisis de seeds en startup, guardas, qué colecciones se llenan | Parcialmente obsoleto (referencias a `server.py` vs `seeds/run.py`) | reset / data |
| `backend/REFACTOR_PLAN_MODULAR.md` | Plan detallado para partir `server.py` | Duplicado / superseded | architecture |
| `frontend/README.md` | Plantilla Create React App | Obsoleto para el producto | other |
| `docs/permissions-architecture.md` | Referencia única roles, módulos, lógica efectiva | **Actual** (canónico explícito) | permissions |
| `docs/PERMISSIONS_AUDIT_AND_DESIGN.md` | Auditoría funcional y diseño del sistema de permisos | Duplicado / overlapping con anterior | permissions, audit |
| `docs/permission-resolution-rfc.md` | RFC v1 algoritmo de módulos efectivos (congelado) | **Actual** (normativo) | permissions |
| `docs/staylo-clean-reset-plan.md` | Plan de reset controlado DB `staylo` | **Actual** | reset / data |
| `docs/staylo-reset-execution.md` | Runbook: comandos, dry-run, PowerShell/bash | **Actual** | reset / data, operations |
| `docs/mongo-data-audit-and-cleanup-plan.md` | Auditoría de datos Mongo, inconsistencias típicas | **Actual** (snapshot mar 2025) | audit, reset / data |
| `docs/owner-dashboard-current-state.md` | Estado `/corporate`, endpoints, brechas producto | Parcialmente obsoleto (rutas de código) | product / UX |
| `docs/test-audit-latest.md` | Inventario de tests backend/frontend, comandos | Parcialmente obsoleto; overlapping | testing |
| `docs/test-failure-summary-latest.md` | Diagnóstico pytest: causas, cascadas, orden de fix | **Actual** | testing |
| `docs/garden-role-and-operation-design.md` | Diseño roles de jardín y fases | **Actual** (diseño / roadmap) | gardens / events, roadmap / backlog |
| `docs/event-lodging-design-proposal.md` | Propuesta integración evento ↔ hospedaje | **Actual** (diseño) | gardens / events |
| `docs/system-audit-gardens-and-access.md` | Auditoría jardines, modelos, acceso vs permisos | Parcialmente overlapping | audit, gardens / events, permissions |

---

## 3. Grupos de solapamiento / duplicación

### G1 — Permisos (tres capas complementarias pero dispersas)

- `docs/permissions-architecture.md` — visión de producto y mapa módulos ↔ rutas.
- `docs/PERMISSIONS_AUDIT_AND_DESIGN.md` — narrativa “quién puede qué” y recomendaciones.
- `docs/permission-resolution-rfc.md` — reglas algorítmicas (tenant, `role_permissions`, etc.).

**Recomendación:** mantener el **RFC** como anexo normativo; fusionar o enlazar de forma jerárquica arquitectura + auditoría en un solo **`permissions.md`** con secciones “Producto” y “Auditoría histórica”, o dejar dos archivos bajo `docs/permissions/` con `README` índice.

### G2 — Tests

- `docs/test-audit-latest.md` — lista de ficheros de test, cobertura conceptual, limitaciones del entorno.
- `docs/test-failure-summary-latest.md` — clasificación de fallos, entorno, comandos.

**Recomendación:** merge en **`testing-status.md`** (secciones: inventario, cómo ejecutar, diagnóstico de fallos).

### G3 — Reset y datos Mongo

- `docs/staylo-clean-reset-plan.md` + `docs/staylo-reset-execution.md` — plan vs runbook (complementarios, no duplicados).
- `docs/mongo-data-audit-and-cleanup-plan.md` — inspección y limpieza sin ejecutar borrados masivos.
- `backend/SEED_ANALYSIS.md` — comportamiento de seeds en arranque.

**Recomendación:** agrupar bajo `docs/operations/` o `docs/data/`: `reset-plan.md`, `reset-runbook.md`, `mongo-audit.md`, `seeds-behavior.md` (mover `SEED_ANALYSIS` desde `backend/`).

### G4 — Jardines / eventos / lodging

- `docs/system-audit-gardens-and-access.md` — estado actual y gaps.
- `docs/garden-role-and-operation-design.md` — diseño futuro de roles.
- `docs/event-lodging-design-proposal.md` — modelo de integración hospedaje-evento.

**Recomendación:** no fusionar todo en uno: separar **as-is** vs **diseño**. Carpeta `docs/design/gardens-events/` o `docs/archive/design/` para propuestas estabilizadas.

### G5 — Refactor backend

- `backend/REFACTOR_PLAN_MODULAR.md` — plan inicial “sin código modificado”.
- `backend/BACKEND_STABILIZATION_STATUS.md` — estado tras fases reales.

**Recomendación:** tratar el plan modular como **archivo histórico**; canónico = estabilización + código. Evitar dos fuentes de verdad.

### G6 — Auditoría macro

- `TECHNICAL_AUDIT_REPORT.md` describe el monolito en `server.py`; el repo ya tiene `auth.py`, `routers/`, `seeds/run.py`, etc.

**Recomendación:** mover a **`docs/archive/`** o regenerar un “snapshot” único; hasta entonces marcar banner “superseded parcialmente por docs/ y estructura actual”.

---

## 4. Estructura final recomendada (`docs/`)

```
docs/
├── README.md                      # Índice humano: qué leer primero por rol
├── project-status.md              # 1 página: stack, enlace a audit reciente (opcional)
├── architecture.md                # Extraer/sintetizar de TECHNICAL_AUDIT + stabilization (mantener actualizado)
├── permissions/
│   ├── README.md                  # Índice: arquitectura + RFC
│   ├── product-model.md           # (desde permissions-architecture + partes de PERMISSIONS_AUDIT)
│   └── resolution-rfc.md          # (mover permission-resolution-rfc.md)
├── testing-status.md              # merge test-audit-latest + test-failure-summary-latest
├── technical-debt.md              # Deuda explícita (extraer de audits: reportes sin scope, etc.)
├── operations/
│   ├── reset-plan.md              # staylo-clean-reset-plan
│   ├── reset-runbook.md           # staylo-reset-execution
│   ├── mongo-data-audit.md        # mongo-data-audit-and-cleanup-plan
│   └── seeds.md                   # SEED_ANALYSIS (movido desde backend/)
├── design/
│   ├── owner-corporate-dashboard.md   # owner-dashboard-current-state (renombrar)
│   ├── garden-roles.md            # garden-role-and-operation-design
│   └── event-lodging.md           # event-lodging-design-proposal
├── archive/
│   ├── 2025-03-technical-audit-repo.md    # TECHNICAL_AUDIT_REPORT (opcional)
│   ├── backend-refactor-plan-modular.md   # REFACTOR_PLAN_MODULAR
│   ├── system-audit-gardens-and-access.md # si se desglosa en design+audit nuevo
│   └── permissions-audit-legacy.md        # PERMISSIONS_AUDIT_AND_DESIGN si se fusiona
└── backlog.md                     # Opcional: extraer “próximos pasos” de diseños y audits
```

**Raíz del repo:**

- Sustituir `README.md` por un README real que enlace a `docs/README.md`.
- Eliminar o reemplazar `frontend/README.md` por una nota de 10 líneas + enlace al README principal (CRA doc en web).

---

## 5. Archivos canónicos (post-consolidación sugerida)

| Tema | Canónico sugerido |
|------|-------------------|
| Permisos (producto + mapa módulos) | `docs/permissions/product-model.md` (derivado de `permissions-architecture.md`) |
| Permisos (algoritmo) | `docs/permissions/resolution-rfc.md` |
| Reset demo | Par `operations/reset-plan.md` + `operations/reset-runbook.md` |
| Seeds / startup | `docs/operations/seeds.md` |
| Fallos pytest / cómo testear | `docs/testing-status.md` |
| Estado refactor backend “vivo” | `backend/BACKEND_STABILIZATION_STATUS.md` hasta mover a `docs/architecture.md` |

---

## 6. Candidatos a archivo / eliminación (tras confirmación humana)

| Acción | Archivo | Motivo |
|--------|---------|--------|
| Mover a `docs/archive/` | `TECHNICAL_AUDIT_REPORT.md` | Snapshot desalineado con estructura actual del backend |
| Mover a `docs/archive/` | `backend/REFACTOR_PLAN_MODULAR.md` | Supersedido por estabilización y código |
| Fusionar y archivar origen | `docs/PERMISSIONS_AUDIT_AND_DESIGN.md` | Solapa con `permissions-architecture.md` |
| Fusionar y archivar origen | `docs/test-audit-latest.md` | Solapa con `test-failure-summary-latest` |
| Reemplazar / borrar | `frontend/README.md` | Boilerplate CRA sin valor STAYLO |
| Expandir o borrar | `README.md` (raíz) | Casi vacío; peligro de “doc muerta” |

**No borrar sin revisión:** `system-audit-gardens-and-access.md` (útil como audit trail hasta que un `project-status` lo resuma).

---

## 7. Entregable — checklist para la siguiente fase (solo docs)

1. Crear `docs/README.md` índice.
2. Mover/renombrar según árbol §4 (sin tocar código de producto).
3. Añadir banners “**Superseded** / Ver X” en archivos archivados.
4. Unificar permisos en carpeta `docs/permissions/`.
5. Unificar testing en `testing-status.md`.
6. Regenerar o archivar `TECHNICAL_AUDIT_REPORT.md`.

---

## 8. Ruta de este resumen

Archivo generado por la auditoría: **`docs/documentation-audit-summary.md`** (este documento).

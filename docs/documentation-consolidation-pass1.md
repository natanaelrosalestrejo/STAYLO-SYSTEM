# Consolidación de documentación — pass 1 (2026-03-28)

**Alcance:** solo Markdown; sin cambios a código de producto. Objetivo: estructura, nombres, descubrimiento y archivo seguro.

## 1. Archivos movidos / renombrados

| Origen | Destino |
|--------|---------|
| `docs/permissions-architecture.md` | `docs/permissions/product-model.md` |
| `docs/permission-resolution-rfc.md` | `docs/permissions/resolution-rfc.md` |
| `docs/staylo-clean-reset-plan.md` | `docs/operations/reset-plan.md` |
| `docs/staylo-reset-execution.md` | `docs/operations/reset-runbook.md` |
| `docs/mongo-data-audit-and-cleanup-plan.md` | `docs/operations/mongo-data-audit.md` |
| `backend/SEED_ANALYSIS.md` | `docs/operations/seeds.md` |
| `docs/owner-dashboard-current-state.md` | `docs/design/owner-corporate-dashboard.md` |
| `docs/garden-role-and-operation-design.md` | `docs/design/garden-roles.md` |
| `docs/event-lodging-design-proposal.md` | `docs/design/event-lodging.md` |
| `backend/BACKEND_STABILIZATION_STATUS.md` | `docs/architecture-backend-status.md` |

## 2. Archivos archivados (movidos + banner)

| Origen | Destino |
|--------|---------|
| `docs/PERMISSIONS_AUDIT_AND_DESIGN.md` | `docs/archive/permissions-audit-legacy.md` |
| `docs/system-audit-gardens-and-access.md` | `docs/archive/system-audit-gardens-and-access.md` |
| `TECHNICAL_AUDIT_REPORT.md` (raíz proyecto) | `docs/archive/technical-audit-report-2026-03.md` |
| `backend/REFACTOR_PLAN_MODULAR.md` | `docs/archive/backend-refactor-plan-modular.md` |
| `docs/test-audit-latest.md` | `docs/archive/test-audit-latest.md` |

## 3. Documentos que siguen canónicos (sin archivo)

- `docs/permissions/product-model.md` — modelo de permisos en producto.
- `docs/permissions/resolution-rfc.md` — algoritmo normativo de módulos efectivos.
- `docs/operations/reset-plan.md` + `reset-runbook.md` — reset demo `staylo`.
- `docs/operations/mongo-data-audit.md` — guía de inspección de datos.
- `docs/operations/seeds.md` — análisis de seeds.
- `docs/design/*` — propuestas y estado de diseño (corporativo, jardines, lodging).
- `docs/architecture-backend-status.md` — estado del refactor backend.
- `docs/test-failure-summary-latest.md` — diagnóstico pytest.
- `docs/documentation-audit-summary.md` — registro de la auditoría (tablas con rutas antiguas: ver nota al inicio de ese archivo).

## 4. Archivos nuevos

- `docs/README.md` — índice principal.
- `docs/permissions/README.md` — índice de permisos.
- `docs/operations/README.md` — índice de operaciones.
- `docs/design/README.md` — índice de diseño.
- `docs/archive/README.md` — índice del archivo.
- `docs/documentation-consolidation-pass1.md` — este resumen.
- `README.md` (raíz) — entrada corta enlazando a `docs/README.md`.
- `frontend/README.md` — nota corta enlazando a `docs/README.md`.

## 5. Carpetas creadas

- `docs/permissions/`
- `docs/operations/`
- `docs/design/`
- `docs/archive/`

## 6. Ajustes de contenido (no fusión masiva)

- Banners *Archived / Superseded* en archivos bajo `docs/archive/` y notas de ubicación en `architecture-backend-status.md`, `seeds.md`, cabecera del RFC.
- Título y nota histórica en `product-model.md` (antes “Permissions Architecture”).
- Enlaces actualizados: `reset-runbook.md` → `reset-plan.md`; `reset-plan.md` → `mongo-data-audit.md`; referencias internas en `system-audit-gardens-and-access.md` hacia las nuevas rutas de permisos.

## 7. Pendiente (futuras passes)

- Fusionar opcionalmente `test-failure-summary-latest.md` + archivo de inventario de tests en un único `testing-status.md`.
- Sintetizar `technical-audit-report` archivado + `architecture-backend-status` en un `architecture.md` único si se desea menos dispersión.

---

**Ruta de este archivo:** `docs/documentation-consolidation-pass1.md`

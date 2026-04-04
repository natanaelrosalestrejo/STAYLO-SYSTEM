# Backlog (prioridades según documentación)

Ítems **extraídos de los docs existentes**. No incluye features nuevas no mencionadas en la documentación.

**Leyenda:** *Operativo* = entorno/tests/datos; *Engineering* = código/estructura; *Diseño* = propuesta en `design/*`, a implementar solo si el equipo decide.

---

## Prioridad alta (bloquean calidad o señal confusa)

1. **Entorno de tests backend** — Unificar/ documentar `REACT_APP_BACKEND_URL`; alinear fallbacks entre ficheros de test; smoke de login antes de la suite completa.  
   → [test-failure-summary-latest.md](./test-failure-summary-latest.md) §C1, §D, §F

2. **Datos demo canónicos** — Reset/seed alineado a la forma que esperan los tests (p. ej. conteos de propiedades/habitaciones, usuarios demo, `tenant_id` en usuarios clave según plan de reset).  
   → [test-failure-summary-latest.md](./test-failure-summary-latest.md) §C2–C3; [operations/reset-plan.md](./operations/reset-plan.md); [operations/reset-runbook.md](./operations/reset-runbook.md)

3. **Coherencia Mongo** — Resolver patrones documentados de datos huérfanos, `role_permissions` que sustituyen defaults, alineación `users.tenant_id` / `property_id`.  
   → [operations/mongo-data-audit.md](./operations/mongo-data-audit.md)

---

## Prioridad media (riesgo producto o deuda técnica documentada)

4. **Alcance en reportes** — Revisar `/reports/occupancy` y `/reports/insights` frente al alcance del usuario y a lo que consume cada pantalla.  
   → [operations/mongo-data-audit.md](./operations/mongo-data-audit.md) §1

5. **Alineación rutas frontend vs módulos efectivos** — Reducir inconsistencias entre `allowedRoles` / `ROUTE_MODULE_MAP` y módulos del backend.  
   → [archive/system-audit-gardens-and-access.md](./archive/system-audit-gardens-and-access.md) §1

6. **Refactor backend (plan declarado)** — Fases documentadas tras extracción de modelos: auth y helpers de scope → `auth.py`; seeds → `seeds/run.py`; routers por dominio.  
   → [architecture-backend-status.md](./architecture-backend-status.md) §1, §3–§4

7. **Seeds vs dos jardines demo** — Ajustes descritos para `seed_properties`, reparto de `event_spaces` / `event_bookings`, y backfill de `tenant_id` en usuarios.  
   → [operations/reset-plan.md](./operations/reset-plan.md) §D

8. **UX permisos** — Tras cambios de permisos a un usuario: re-login o refresco de `/auth/me` para sidebar (comportamiento documentado, mejora opcional).  
   → [architecture-backend-status.md](./architecture-backend-status.md) §2.4

---

## Prioridad baja / calidad de tests

9. **Tests frágiles** — Test que inspecciona strings en `routers/auth.py`; nombres vs aserciones (ej. “dollar” vs MXN).  
   → [test-failure-summary-latest.md](./test-failure-summary-latest.md) §C5, §D

10. **Aislamiento entre tests** — Restos de datos entre ejecuciones (habitaciones/propiedades `TEST_*`, fechas de booking público).  
    → [test-failure-summary-latest.md](./test-failure-summary-latest.md) §C6

11. **Cobertura frontend** — No hay tests unitarios en `src/` documentados.  
    → [archive/test-audit-latest.md](./archive/test-audit-latest.md)

12. **Roles / permisos de jardín en tests** — Cobertura indirecta; faltan tests específicos documentados para roles de jardín.  
    → [archive/test-audit-latest.md](./archive/test-audit-latest.md) §1

---

## *Diseño* (roadmap en docs — no asumir implementado)

13. **Roles dedicados de jardín** — Propuesta por fases (`garden_admin`, …) y módulos orientados a eventos.  
    → [design/garden-roles.md](./design/garden-roles.md)

14. **Integración evento ↔ hospedaje** — Modelos propuestos `event_lodging_assignments`, `event_room_blocks`; roadmap en 3 fases.  
    → [design/event-lodging.md](./design/event-lodging.md)

15. **Dashboard corporativo** — Extender mismo endpoint/página con campos nuevos en lugar de duplicar (recomendación doc); brechas: evento, hospedaje-evento, P&L, alertas.  
    → [design/owner-corporate-dashboard.md](./design/owner-corporate-dashboard.md)

16. **Vínculo operativo evento–habitaciones** — Documentado como no existente hoy; paso siguiente requiere modelo explícito.  
    → [archive/system-audit-gardens-and-access.md](./archive/system-audit-gardens-and-access.md) §1

---

## Documentación

17. **Unificar “testing” en un solo estado** — Opcional: `testing-status.md` fusionando inventario + fallos.  
    → [documentation-consolidation-pass1.md](./documentation-consolidation-pass1.md) §7

18. **Arquitectura en un solo doc** — Opcional: sintetizar informe archivado + `architecture-backend-status`.  
    → [documentation-consolidation-pass1.md](./documentation-consolidation-pass1.md) §7

---

## Referencia rápida

- Estado actual resumido: [project-status.md](./project-status.md)  
- Índice de docs: [README.md](./README.md)

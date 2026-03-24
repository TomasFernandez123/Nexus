# Step 6 Final Blockers — Canonical Inventory

## Canonical Table

| blocker_id | title | owner | severity | state | depends_on | notes |
|---|---|---|---|---|---|---|
| B6-001 | Definir owners finales para cada criterio de cierre Step 6 | Product Lead | high | resolved | — | Owner assignment consolidado y auditado |
| B6-002 | Completar trazabilidad blocker → requisito PRD | Tech Lead | high | resolved | B6-001 | Matriz completa en `docs/step6-traceability-matrix.md` |
| B6-003 | Eliminar ambigüedad en DoD y evidencia mínima por blocker | QA Lead | high | resolved | B6-002 | DoD binario + evidencia explícita por blocker |
| B6-004 | Validar orden de ejecución sin ciclos + gate final de alcance | Release Manager | high | resolved | B6-002,B6-003 | Orden topológico validado y checklist de cierre ejecutada |

## Integrity Validation

- Blockers críticos sin `owner`: **0**
- Blockers críticos sin `severity`: **0**
- Blockers críticos sin `state`: **0**

## Dependency-Safe Execution Order (Topological)

1. `B6-001`
2. `B6-002`
3. `B6-003`
4. `B6-004`

Resultado de validación: **sin dependencias circulares**.

## Out-of-Scope Backlog (scope gate)

Mejoras identificadas que NO son críticas para Step 6 y quedan fuera del plan de desbloqueo:

| backlog_id | item | reason | status |
|---|---|---|---|
| NGS-001 | Dashboard visual de blockers en tiempo real | Mejora DX no requerida para cierre Step 6 | out_of_scope |
| NGS-002 | Notificaciones automáticas por Slack/email al resolver blocker | Integración externa fuera de MVP/Step 6 | out_of_scope |
| NGS-003 | Métricas históricas avanzadas de lead-time por blocker | Optimización post-cierre, no bloquea sign-off | out_of_scope |

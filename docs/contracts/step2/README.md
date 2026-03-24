# Step 2 Contract Alignment Artifacts

## Scope Guardrails

This folder contains **alignment-only** artifacts for Step 2 contract formalization.

Allowed in this change:
- Contract clauses aligned to PRD (`contract-delta.md`)
- Ambiguity definitions (`glossary.md`)
- PRD→Contract→Scenario traceability (`traceability-matrix.md`)
- Objective acceptance criteria (`acceptance-criteria.md`)
- Verification preparation (`verification-checklist.md`)

Not allowed in this change:
- Core domain/runtime internals changes (`src/tasks/**`, `src/db/**`, `src/runtime/types.ts`, `server/**`)
- Database schema or migration changes

Allowed adapter scope (PRD-facing):
- DTO mapping in MCP/CLI boundaries to expose canonical contract fields (`status`, `created_at`, canonical error shape)
- Compatibility handling documented as deprecated when needed (`taskId` alias)
- Boundary evidence tests that enforce Step2 alignment-only scope

## Handoff Notes

- `id` is now canonical input key across contracts and runtime-facing docs.
- `taskId` remains as temporary deprecated alias for transition safety and is covered by contract tests.
- `task_list_pending` now uses a single envelope contract: `{ items, next_cursor }` for every call (including `input: {}`).
- This contract update removes legacy shape branching in clients and in stdio `structuredContent` handling.
- Next phase (`sdd-verify`) should validate compatibility coverage and deprecation-path visibility.

# Step 2 Acceptance Criteria

Each criterion is objective and pass/fail testable.

| ID | Clause | Criterion (Pass/Fail) |
|---|---|---|
| AC-2-001 | C-2-001 | PASS if `task_list_pending` response includes only tasks with `status` in `todo|in_progress` and each object has `id,type,title,status,created_at`; FAIL otherwise. |
| AC-2-002 | C-2-002 | PASS if `task_start(id)` on existing `todo` task updates status to `in_progress` and `updated_at` is newer than previous value; FAIL otherwise. |
| AC-2-003 | C-2-003 | PASS if unknown `id` returns payload containing code `TASK_NOT_FOUND`; FAIL if mutation occurs or different code appears. |
| AC-2-004 | C-2-004 | PASS if calling `task_start(id)` on `done` returns code `ALREADY_COMPLETED`; FAIL otherwise. |
| AC-2-005 | C-2-005 | PASS if `task_add_log` inserts exactly one log row tied to task and includes non-null `created_at`; FAIL otherwise. |
| AC-2-006 | C-2-006 | PASS if `task_complete(id)` sets status `done`, updates `updated_at`, and commit message matches `^(feat|fix|chore|refactor|docs): .+ \(Closes #\d+\)$`; FAIL otherwise. |
| AC-2-007 | C-2-007 | PASS if missing `.git` yields code `GIT_NOT_INITIALIZED` with actionable message; FAIL otherwise. |
| AC-2-008 | C-2-008 | PASS if no-change condition yields code `GIT_NOTHING_TO_COMMIT`; FAIL otherwise. |
| AC-2-009 | C-2-009 | PASS if invalid task type yields `INVALID_TASK_TYPE` and blank/whitespace title yields `TITLE_REQUIRED`; FAIL otherwise. |
| AC-2-010 | C-2-010 | PASS if all tool error responses conform to `{ error: string, code?: string }`; FAIL otherwise. |
| AC-2-011 | C-2-011 | PASS if Step 2 changes are limited to PRD-facing adapters (`src/contracts/step2.ts`, MCP/CLI DTO mapping), contract tests, and `docs/contracts/step2/*`, with no core domain/state model changes (`src/tasks/**`, `src/db/**`, `src/runtime/types.ts`); FAIL otherwise. |
| AC-2-012 | C-2-012 | PASS if `id` is canonical in docs/contracts and runtime accepts deprecated `taskId` alias with explicit compatibility tests; FAIL otherwise. |
| AC-2-013 | C-2-013 | PASS if every `task_list_pending` response (with or without `limit`/`cursor`) returns object `{ items, next_cursor }`; FAIL otherwise. |
| AC-2-014 | C-2-014 | PASS if pagination enforces `limit` default `100`, max `500`, validates `cursor` as positive existing integer id, and invalid cases return `VALIDATION_ERROR`; FAIL otherwise. |

## Subjectivity Elimination Notes

- Replaced vague terms like “clear error” with deterministic code + shape requirements.
- Replaced “works correctly” with concrete state transitions and timestamp checks.
- Added explicit file-scope guardrail criterion (AC-2-011) to enforce alignment-only boundary.

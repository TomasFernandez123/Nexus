# Step 2 Contract Delta

## Canonical PRD Reference Format

All references in this delta use `PRD:<ID>` where `<ID>` is a stable requirement identifier from `PRD.md` (for example: `PRD:US-008`).

## Contract Clauses

| Clause ID | PRD Ref | Normative Statement | Scenario Refs | Acceptance Refs | Status |
|---|---|---|---|---|---|
| C-2-001 | PRD:US-005 | `task_list_pending` **MUST** return only tasks in canonical status `todo` or `in_progress`; each item must include at least `id`, `type`, `title`, `status`, `created_at`. | S-2-001 | AC-2-001 | Final |
| C-2-013 | PRD:US-005 | `task_list_pending` **MUST** return a single response envelope `{ items, next_cursor }` for every call, including calls without `limit`/`cursor`; `items` contains canonical tasks and `next_cursor` is `string | null`. | S-2-013 | AC-2-013 | Final |
| C-2-014 | PRD:US-005 | Pagination validation for `task_list_pending` **MUST** enforce `limit` default `100`, max `500`, and `cursor` as positive integer referencing an existing task id; invalid input **SHALL** return `VALIDATION_ERROR`. | S-2-014 | AC-2-014 | Final |
| C-2-002 | PRD:US-006 | `task_start(id)` **MUST** transition a valid task to `in_progress` and update `updated_at`. | S-2-002 | AC-2-002 | Final |
| C-2-003 | PRD:US-006 | `task_start(id)` with unknown task id **SHALL** return a not-found error in canonical error shape with code `TASK_NOT_FOUND`. | S-2-003 | AC-2-003 | Final |
| C-2-004 | PRD:US-006 | `task_start(id)` on a `done` task **SHALL** reject the transition with code `ALREADY_COMPLETED`. | S-2-004 | AC-2-004 | Final |
| C-2-005 | PRD:US-007 | `task_add_log(id, message)` **MUST** persist a task log row with automatic `created_at`. | S-2-005 | AC-2-005 | Final |
| C-2-006 | PRD:US-008 | `task_complete(id)` **MUST** set status to `done`, update `updated_at`, and run local commit flow (`git add .` then commit message format `<type>: <title> (Closes #<id>)`). | S-2-006 | AC-2-006 | Final |
| C-2-007 | PRD:US-008 | If repository is not initialized, `task_complete(id)` **SHALL** return canonical error with code `GIT_NOT_INITIALIZED` and actionable message. | S-2-007 | AC-2-007 | Final |
| C-2-008 | PRD:US-008 | If no staged/unstaged changes exist, `task_complete(id)` **SHALL** return canonical error with code `GIT_NOTHING_TO_COMMIT`. | S-2-008 | AC-2-008 | Final |
| C-2-009 | PRD:US-010 | `task_create(type, title)` **MUST** accept only `feat|fix|chore|refactor|docs`, reject invalid type with `INVALID_TASK_TYPE`, and reject blank title with `TITLE_REQUIRED`. | S-2-009 | AC-2-009 | Final |
| C-2-010 | PRD:4-Error-Response-Contract | All Step 2 tool errors **MUST** follow `{ "error": string, "code": string? }` with deterministic code values from PRD section 4. | S-2-010 | AC-2-010 | Final |
| C-2-011 | PRD:Non-Goals-MVP | Step 2 **MUST** remain alignment-scoped: only PRD-facing adapters (MCP/CLI response DTO mapping + boundary tests/docs) MAY change; core domain/runtime internals MUST remain unchanged. | S-2-011 | AC-2-011 | Final |
| C-2-012 | PRD:US-006,PRD:README-MCP-TOOLS | Input identifier naming **MUST** use `id` as canonical key; `taskId` MAY remain temporarily as deprecated alias for backward compatibility and must be covered by tests. | S-2-012 | AC-2-012 | Final |

## Scenario IDs (Given/When/Then)

- **S-2-001**: Given pending tasks exist, when `task_list_pending` runs, then only `todo|in_progress` are returned with required fields.
- **S-2-002**: Given task exists in `todo`, when `task_start(id)` runs, then status becomes `in_progress` and `updated_at` changes.
- **S-2-003**: Given missing task id, when `task_start(id)` runs, then response returns `TASK_NOT_FOUND` canonical error.
- **S-2-004**: Given task is `done`, when `task_start(id)` runs, then response returns `ALREADY_COMPLETED` canonical error.
- **S-2-005**: Given valid task id and message, when `task_add_log` runs, then row is inserted with auto timestamp.
- **S-2-006**: Given valid in-progress task and repo with changes, when `task_complete` runs, then status updates to `done` and commit message matches regex.
- **S-2-007**: Given no `.git` directory, when `task_complete` runs, then `GIT_NOT_INITIALIZED` is returned.
- **S-2-008**: Given repo initialized but no changes, when `task_complete` runs, then `GIT_NOTHING_TO_COMMIT` is returned.
- **S-2-009**: Given invalid `type` or blank `title`, when `task_create` runs, then deterministic validation errors are returned.
- **S-2-010**: Given any tool failure, when error is produced, then payload conforms to canonical error shape.
- **S-2-011**: Given Step 2 review, when artifacts are inspected, then changes are restricted to PRD-facing adapters + contracts/tests/docs and exclude core runtime internals.
- **S-2-012**: Given tools that accept task identifiers, when called with canonical `id` or deprecated `taskId`, then both are accepted while `id` is documented as canonical.
- **S-2-013**: Given pending tasks exist, when `task_list_pending` is called with or without pagination params, then response shape is always `{ items, next_cursor }`.
- **S-2-014**: Given paginated `task_list_pending` input, when `limit` or `cursor` is invalid/out of range/not found, then response returns deterministic `VALIDATION_ERROR`; otherwise defaults and boundaries are enforced (`limit` default `100`, max `500`).

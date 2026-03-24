# Step 2 Glossary

## Purpose

Resolve ambiguous terms from `PRD.md` and align their operational meaning for Step 2 contracts.

| Term | Source | Approved Definition | Notes |
|---|---|---|---|
| Pending tasks | PRD US-005 | A task is pending when `status` ∈ {`todo`, `in_progress`}. | Matches PRD acceptance criteria for `task_list_pending`. |
| Canonical error shape | PRD §4 Error Response Contract | Error payload MUST include `error` string and MAY include `code` for deterministic categorization. | Contract enforces deterministic codes for Step 2 tools. |
| Local commit only | PRD US-008 + Non-Goals | `task_complete` can stage + commit in local repository; no push to remote is ever part of Step 2. | Keeps MVP non-goal intact. |
| Deterministic transition | docs/mcp-task-lifecycle.md | State change validity is defined by canonical matrix and strict mode rules. | Relevant when task APIs mutate lifecycle state. |
| Requirement ID | Step 2 contract convention | Stable pointer in format `PRD:<ID>` where `<ID>` is user story (`US-xxx`) or canonical PRD section alias. | Used across matrix and criteria. |
| Alignment-only change | Step 2 spec Requirement: Change Boundaries | This change modifies only contract/doc artifacts and excludes runtime implementation changes. | Verify gate MUST reject scope creep. |

## Unresolved Ambiguities

| Item | Current Observation | Proposed Resolution | Owner |
|---|---|---|---|
| Tool input key naming (`id` vs `taskId`) | PRD tool schema examples use `id` while legacy runtime/docs used `taskId` in some endpoints. | `id` is canonical; `taskId` remains temporary deprecated alias for migration safety and must be validated by tests. | Product + Runtime owner |

Any unresolved term MUST remain marked as `Needs Clarification` in `contract-delta.md` until owner sign-off.

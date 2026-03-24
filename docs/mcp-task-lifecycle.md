# MCP Task Lifecycle

## Canonical States

Every task MUST be in exactly one canonical state:

- `todo`
- `in_progress`
- `blocked`
- `done`
- `cancelled`

## Canonical Events

Allowed lifecycle events:

- `create`
- `start`
- `block`
- `unblock`
- `complete`
- `cancel`
- `reopen`

## Deterministic Transition Matrix

| From | Event | To |
|---|---|---|
| — | create | todo |
| todo | start | in_progress |
| in_progress | block | blocked |
| blocked | unblock | in_progress |
| in_progress | complete | done |
| todo | cancel | cancelled |
| in_progress | cancel | cancelled |
| blocked | cancel | cancelled |
| done | reopen | in_progress |
| cancelled | reopen | todo |

Any transition not listed in this matrix MUST fail with `INVALID_TRANSITION` when strict enforcement is enabled.

## Error Contract

### INVALID_STATE

Returned when the input state/event is not canonical.

```json
{
  "code": "INVALID_STATE",
  "message": "State 'paused' is not canonical"
}
```

### INVALID_TRANSITION

Returned when the event is not allowed from the current state.

```json
{
  "code": "INVALID_TRANSITION",
  "message": "Event 'complete' is not allowed from state 'todo'",
  "current_state": "todo",
  "event": "complete",
  "allowed_events": ["start", "cancel"]
}
```

## Open Decision (Resolved)

`reopen(done)` target is **`in_progress`**.

Rationale: reopening a completed task implies active rework rather than sending it back to backlog triage.

## Enforcement Modes

Handlers support two operation modes controlled by `TASK_LIFECYCLE_ENFORCED`:

- `false` (warning-only): lifecycle violations are reported as warnings so legacy flows are not blocked.
- `true` (strict): lifecycle violations return deterministic errors (`INVALID_STATE`, `INVALID_TRANSITION`) and the mutation is rejected.

This allows progressive rollout while preserving a stable contract for strict mode.

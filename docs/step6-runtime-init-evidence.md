# Step 6 Runtime Init Evidence

## Entry Point Discovery (Task 1.1)

- Expected (design draft): `src/runtime/init.ts`
- Actual entrypoint in repository: `src/runtime/index.ts`
- Decision: keep current entrypoint and implement bootstrap contract in `src/runtime/index.ts` to avoid unnecessary file split in this scoped Step 6 fix.

## Requirement → Scenario → Test Matrix

| Requirement | Scenario | Test | Result |
|---|---|---|---|
| Deterministic bootstrap contract | Successful startup emits ordered phases | `tests/runtime/init.contract.test.ts` → `Requirement: Deterministic bootstrap contract / Scenario: Successful startup emits ordered phases` | pass |
| Deterministic bootstrap contract | Startup order violation is rejected | `tests/runtime/init.contract.test.ts` → `Requirement: Deterministic bootstrap contract / Scenario: Startup order violation is rejected` | pass |
| Preflight validation gate | Missing required config fails in preflight | `tests/runtime/init.contract.test.ts` → `Requirement: Preflight validation gate / Scenario: Missing required config fails in preflight` | pass |
| Preflight validation gate | Invalid config type blocks bootstrap | `tests/runtime/init.contract.test.ts` → `Requirement: Preflight validation gate / Scenario: Invalid config type blocks bootstrap` | pass |
| Dependency initialization resilience | Dependency init timeout triggers controlled failure | `tests/runtime/init.contract.test.ts` → `Requirement: Dependency initialization resilience / Scenario: Dependency init timeout triggers controlled failure` | pass |
| Dependency initialization resilience | Partial dependency init performs cleanup | `tests/runtime/init.contract.test.ts` → `Requirement: Dependency initialization resilience / Scenario: Partial dependency init performs cleanup` | pass |
| Observable init outcomes | Success path is test-verifiable | `tests/runtime/init.contract.test.ts` → `Requirement: Observable init outcomes / Scenario: Success path is test-verifiable` | pass |
| Observable init outcomes | Failure paths are test-verifiable | `tests/runtime/init.contract.test.ts` → `Requirement: Observable init outcomes / Scenario: Failure paths are test-verifiable` | pass |
| Scope guard for Step 6 | Init-related patch accepted | `tests/runtime/step6-scope-guard.contract.test.ts` → `Requirement: Scope guard for Step 6 / Scenario: Init-related patch accepted` | pass |
| Scope guard for Step 6 | Non-init enhancement rejected | `tests/runtime/step6-scope-guard.contract.test.ts` → `Requirement: Scope guard for Step 6 / Scenario: Non-init enhancement rejected` | pass |

## Regression Safety (existing behavior)

- `tests/runtime/bootstrap.test.ts` → pass
- `tests/mcp/server.startup-failure.test.ts` → pass

## Scope Gate

- No unrelated feature work added.
- Changes limited to runtime init contract/state/error modeling, targeted tests, fixtures, and evidence doc.

# Step 2 Verification Checklist

## Scenario Coverage

- [x] S-2-001 pending list filter + required fields
- [x] S-2-002 valid start transition
- [x] S-2-003 start unknown id → `TASK_NOT_FOUND`
- [x] S-2-004 start done task → `ALREADY_COMPLETED`
- [x] S-2-005 add log persists timestamped row
- [x] S-2-006 complete task triggers done+commit contract
- [x] S-2-007 missing git repo → `GIT_NOT_INITIALIZED`
- [x] S-2-008 no changes → `GIT_NOTHING_TO_COMMIT`
- [x] S-2-009 task_create validation errors deterministic
- [x] S-2-010 canonical error shape
- [x] S-2-011 alignment-only scope respected (adapter-only runtime boundary)
- [x] S-2-012 canonical `id` + deprecated `taskId` compatibility validated

## Matrix Integrity

- [x] Every PRD row maps to contract clause(s)
- [x] Every contract clause maps to scenario and acceptance criterion
- [x] No duplicate PRD→Contract→Scenario rows
- [x] No orphan clauses without PRD linkage

## Quality Gate

- [x] All normative clauses use RFC 2119 keywords (MUST/SHALL/SHOULD/MAY)
- [x] Acceptance criteria are objective pass/fail
- [x] Deprecation path (canonical `id`, alias `taskId`) documented and test-backed

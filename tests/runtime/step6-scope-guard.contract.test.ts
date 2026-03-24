import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const readUtf8 = (path: string): string => readFileSync(path, 'utf8');

describe('Requirement: Scope guard for Step 6', () => {
  it('Scenario: Init-related patch accepted', () => {
    const evidenceDoc = readUtf8('docs/step6-runtime-init-evidence.md');

    expect(evidenceDoc).toContain('| Scope guard for Step 6 | Init-related patch accepted |');
    expect(evidenceDoc).toContain('tests/runtime/step6-scope-guard.contract.test.ts');
    expect(evidenceDoc).toContain('pass');
  });

  it('Scenario: Non-init enhancement rejected', () => {
    const blockersDoc = readUtf8('docs/step6-final-blockers.md');

    expect(blockersDoc).toContain('## Out-of-Scope Backlog (scope gate)');
    expect(blockersDoc).toContain('Dashboard visual de blockers en tiempo real');
    expect(blockersDoc).toContain('Notificaciones automáticas por Slack/email al resolver blocker');
    expect(blockersDoc).toContain('Métricas históricas avanzadas de lead-time por blocker');
    expect(blockersDoc).toContain('| NGS-001 |');
    expect(blockersDoc).toContain('| NGS-002 |');
    expect(blockersDoc).toContain('| NGS-003 |');
    expect(blockersDoc).toContain('out_of_scope');
  });
});

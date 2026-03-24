import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

type ClosureRow = {
  blocker_id: string;
  state_after: string;
  result: string;
};

const parseMarkdownTableRows = (content: string): string[][] => {
  const lines = content.split(/\r?\n/).filter((line) => line.trim().startsWith('|'));
  if (lines.length < 3) return [];

  const dataLines = lines.slice(2);
  return dataLines
    .map((line) =>
      line
        .split('|')
        .slice(1, -1)
        .map((cell) => cell.trim()),
    )
    .filter((cells) => cells.length > 0 && cells.some((cell) => cell.length > 0));
};

const parseClosureRows = (content: string): ClosureRow[] => {
  const section = content.split('## Binary Closure Checks per Blocker')[1]?.split('##')[0] ?? '';
  const rows = parseMarkdownTableRows(section);

  return rows
    .filter((row) => row[0]?.startsWith('B6-'))
    .map((row) => ({
      blocker_id: row[0] ?? '',
      state_after: (row[7] ?? '').toLowerCase(),
      result: (row[8] ?? '').toLowerCase(),
    }));
};

const evaluateSignoff = (rows: ClosureRow[], contractsPass: boolean): { allowSignoff: boolean; reasons: string[] } => {
  const reasons: string[] = [];

  for (const row of rows) {
    if (row.state_after !== 'resolved') {
      reasons.push(`BLOCKER_UNRESOLVED:${row.blocker_id}`);
    }
    if (row.result !== 'pass') {
      reasons.push(`BLOCKER_CHECK_FAILED:${row.blocker_id}`);
    }
  }

  if (!contractsPass) {
    reasons.push('CONTRACT_EVIDENCE_FAILED');
  }

  return {
    allowSignoff: reasons.length === 0,
    reasons,
  };
};

describe('Release sign-off contract', () => {
  it('Requirement: Criterios binarios de sign-off y cierre / Scenario: Sign-off permitido', () => {
    const checklist = readFileSync('docs/step6-closure-checklist.md', 'utf8');
    const rows = parseClosureRows(checklist);
    const decision = evaluateSignoff(rows, true);

    expect(rows.length).toBeGreaterThan(0);
    expect(decision.allowSignoff).toBe(true);
    expect(decision.reasons).toHaveLength(0);
    expect(checklist).toContain('Estado actual: **unblocked**');
  });

  it('Requirement: Criterios binarios de sign-off y cierre / Scenario: Sign-off bloqueado', () => {
    const blockedRows: ClosureRow[] = [
      { blocker_id: 'B6-001', state_after: 'resolved', result: 'pass' },
      { blocker_id: 'B6-002', state_after: 'blocked', result: 'fail' },
    ];

    const decision = evaluateSignoff(blockedRows, false);

    expect(decision.allowSignoff).toBe(false);
    expect(decision.reasons).toContain('BLOCKER_UNRESOLVED:B6-002');
    expect(decision.reasons).toContain('BLOCKER_CHECK_FAILED:B6-002');
    expect(decision.reasons).toContain('CONTRACT_EVIDENCE_FAILED');
  });
});

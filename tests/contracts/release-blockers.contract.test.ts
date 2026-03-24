import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

type BlockerRow = {
  blocker_id: string;
  title: string;
  owner: string;
  severity: string;
  state: string;
};

const REQUIRED_BLOCKERS = ['B6-001', 'B6-002', 'B6-003', 'B6-004'] as const;
const ALLOWED_STATES = new Set(['resolved', 'blocked', 'in_progress']);
const CRITICAL_SEVERITIES = new Set(['high', 'critical']);

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

const parseCanonicalBlockers = (content: string): BlockerRow[] => {
  const section = content.split('## Canonical Table')[1]?.split('##')[0] ?? '';
  const rows = parseMarkdownTableRows(section);
  return rows.map((cells) => ({
    blocker_id: cells[0] ?? '',
    title: cells[1] ?? '',
    owner: cells[2] ?? '',
    severity: (cells[3] ?? '').toLowerCase(),
    state: (cells[4] ?? '').toLowerCase(),
  }));
};

const parseTraceabilityRefs = (content: string): Map<string, string> => {
  const rows = parseMarkdownTableRows(content);
  const refs = new Map<string, string>();

  for (const row of rows) {
    const blockerId = row[0] ?? '';
    const prdRef = row[2] ?? '';
    if (blockerId.startsWith('B6-')) {
      refs.set(blockerId, prdRef);
    }
  }

  return refs;
};

const readUtf8 = (path: string): string => readFileSync(path, 'utf8');

describe('Release blockers contract', () => {
  it('Requirement: Inventario de blockers crítico validado por contrato / Scenario: Inventario válido', () => {
    const blockersDoc = readUtf8('docs/step6-final-blockers.md');
    const blockers = parseCanonicalBlockers(blockersDoc);

    expect(blockers.length).toBeGreaterThanOrEqual(REQUIRED_BLOCKERS.length);

    const ids = blockers.map((b) => b.blocker_id);
    for (const requiredId of REQUIRED_BLOCKERS) {
      expect(ids).toContain(requiredId);
    }

    const criticalBlockers = blockers.filter((b) => CRITICAL_SEVERITIES.has(b.severity));
    expect(criticalBlockers.length).toBe(REQUIRED_BLOCKERS.length);

    for (const blocker of criticalBlockers) {
      expect(blocker.blocker_id).toBeTruthy();
      expect(blocker.state).toBeTruthy();
      expect(ALLOWED_STATES.has(blocker.state)).toBe(true);
    }
  });

  it('Requirement: Inventario de blockers crítico validado por contrato / Scenario: Inventario incompleto o inconsistente', () => {
    const invalidInventory: BlockerRow[] = [
      {
        blocker_id: 'B6-001',
        title: 'x',
        owner: 'x',
        severity: 'high',
        state: 'resolved',
      },
      {
        blocker_id: 'B6-001',
        title: 'duplicate id',
        owner: 'x',
        severity: 'high',
        state: 'resolved',
      },
      {
        blocker_id: 'B6-003',
        title: 'missing state',
        owner: 'x',
        severity: 'high',
        state: '',
      },
    ];

    const validateInventory = (rows: BlockerRow[]): string[] => {
      const errors: string[] = [];
      const seen = new Set<string>();

      for (const requiredId of REQUIRED_BLOCKERS) {
        if (!rows.some((row) => row.blocker_id === requiredId)) {
          errors.push(`BLOCKER_MISSING:${requiredId}`);
        }
      }

      for (const row of rows) {
        if (seen.has(row.blocker_id)) {
          errors.push(`BLOCKER_DUPLICATE:${row.blocker_id}`);
        }
        seen.add(row.blocker_id);

        if (!row.state) {
          errors.push(`BLOCKER_STATE_MISSING:${row.blocker_id}`);
        }
      }

      return errors;
    };

    const errors = validateInventory(invalidInventory);

    expect(errors).toContain('BLOCKER_MISSING:B6-002');
    expect(errors).toContain('BLOCKER_MISSING:B6-004');
    expect(errors).toContain('BLOCKER_DUPLICATE:B6-001');
    expect(errors).toContain('BLOCKER_STATE_MISSING:B6-003');
  });

  it('Requirement: Trazabilidad blocker → PRD verificable / Scenario: Trazabilidad completa', () => {
    const blockersDoc = readUtf8('docs/step6-final-blockers.md');
    const traceabilityDoc = readUtf8('docs/step6-traceability-matrix.md');

    const blockers = parseCanonicalBlockers(blockersDoc).filter((b) => CRITICAL_SEVERITIES.has(b.severity));
    const traceabilityMap = parseTraceabilityRefs(traceabilityDoc);

    for (const blocker of blockers) {
      const prdRef = traceabilityMap.get(blocker.blocker_id);
      expect(prdRef, `BLOCKER_TRACEABILITY_GAP:${blocker.blocker_id}`).toBeTypeOf('string');
      expect(prdRef?.trim().length, `BLOCKER_TRACEABILITY_GAP:${blocker.blocker_id}`).toBeGreaterThan(0);
      expect(prdRef).toContain('PRD:');
    }
  });

  it('Requirement: Trazabilidad blocker → PRD verificable / Scenario: Gap de trazabilidad', () => {
    const validateTraceability = (criticalIds: string[], refs: Map<string, string>): string[] => {
      const errors: string[] = [];
      for (const id of criticalIds) {
        const ref = refs.get(id);
        if (!ref || !ref.includes('PRD:')) {
          errors.push(`BLOCKER_TRACEABILITY_GAP:${id}`);
        }
      }
      return errors;
    };

    const errors = validateTraceability(['B6-001', 'B6-002'], new Map([['B6-001', 'PRD:2-User-Stories']]));
    expect(errors).toContain('BLOCKER_TRACEABILITY_GAP:B6-002');
  });
});

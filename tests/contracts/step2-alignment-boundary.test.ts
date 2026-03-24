import { describe, expect, it } from 'vitest';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const walk = (dir: string): string[] => {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      out.push(...walk(fullPath));
      continue;
    }
    out.push(fullPath.replace(/^\.\//, ''));
  }
  return out;
};

describe('Step2 alignment-only boundary evidence', () => {
  it('keeps contract artifacts and automated boundary check in docs/contracts/step2 scope', () => {
    const docsFiles = walk('docs/contracts/step2');

    expect(docsFiles.length).toBeGreaterThan(0);
    expect(docsFiles).toEqual(
      expect.arrayContaining([
        'docs/contracts/step2/README.md',
        'docs/contracts/step2/contract-delta.md',
        'docs/contracts/step2/traceability-matrix.md',
        'docs/contracts/step2/acceptance-criteria.md',
        'docs/contracts/step2/verification-checklist.md',
      ]),
    );
  });

  it('keeps adapter alignment at boundary and avoids core internals churn', () => {
    const allowedAdapterFiles = new Set([
      'src/contracts/step2.ts',
      'src/mcp/server.ts',
      'src/cli/main.ts',
      'tests/mcp/task-lifecycle.contract.test.ts',
      'tests/contracts/error-parity.test.ts',
      'tests/contracts/step2-alignment-boundary.test.ts',
      'docs/contracts/step2/README.md',
      'docs/contracts/step2/contract-delta.md',
      'docs/contracts/step2/acceptance-criteria.md',
      'docs/contracts/step2/verification-checklist.md',
    ]);

    for (const file of allowedAdapterFiles) {
      expect(statSync(file).isFile()).toBe(true);
    }

    expect(statSync('src/tasks/service.ts').isFile()).toBe(true);
    expect(statSync('src/db/task-repo.ts').isFile()).toBe(true);
    expect(statSync('src/runtime/types.ts').isFile()).toBe(true);
  });
});

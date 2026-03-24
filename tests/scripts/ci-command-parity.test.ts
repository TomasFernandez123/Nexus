import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const readJson = <T>(path: string): T => {
  const raw = readFileSync(path, 'utf8');
  return JSON.parse(raw) as T;
};

describe('CI command parity contract', () => {
  it('invokes the same canonical command as local', () => {
    const packageJsonPath = resolve(process.cwd(), 'package.json');
    const workflowPath = resolve(process.cwd(), '.github/workflows/e2e-smoke.yml');

    const packageJson = readJson<{ scripts?: Record<string, string> }>(packageJsonPath);
    const localCommand = packageJson.scripts?.['test:e2e'];
    const workflow = readFileSync(workflowPath, 'utf8');

    expect(localCommand).toBeTypeOf('string');
    expect(localCommand).toBeTruthy();
    expect(workflow).toContain('run: npm run test:e2e');
  });

  it('keeps release gate command canonical and deterministic', () => {
    const packageJsonPath = resolve(process.cwd(), 'package.json');
    const packageJson = readJson<{ scripts?: Record<string, string> }>(packageJsonPath);

    const releaseGateCommand = packageJson.scripts?.['release:gate'];

    expect(releaseGateCommand).toBeTypeOf('string');
    expect(releaseGateCommand).toBe('npm run build && npm run typecheck && npm run test');
  });
});

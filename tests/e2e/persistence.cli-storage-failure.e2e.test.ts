import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createE2EFixture, type E2EFixture } from './fixtures/index.js';
import { executeCliCommand } from './harness.js';

const fixtures = new Set<E2EFixture>();

const makeFixture = (): E2EFixture => {
  const fixture = createE2EFixture({
    ...process.env,
    NODE_ENV: 'test',
    MCP_PORT: '6463',
    LOG_LEVEL: 'error',
    SMOKE_TIMEOUT_MS: '3000',
    SMOKE_POLL_INTERVAL_MS: '25',
  });
  fixtures.add(fixture);
  return fixture;
};

afterEach(() => {
  for (const fixture of fixtures) {
    fixture.cleanup();
  }
  fixtures.clear();
});

describe('e2e persistence: storage failure contract', () => {
  // Requirement: Storage Failure Contract
  // Scenario: Unwritable DB path
  // Requirement: Contract-Oriented Assertions
  // Scenario: Error-path assertion
  it('returns non-zero and machine-meaningful stderr when db path is invalid', async () => {
    const fixture = makeFixture();
    const invalidPath = resolve(fixture.tempDir, 'blocked-directory');
    mkdirSync(invalidPath, { recursive: true });

    const result = await executeCliCommand('init', [], {
      fixture,
      env: {
        NEXUS_DB_PATH: invalidPath,
      },
    });

    expect(result.code).toBe(1);
    expect(result.stderr.trim().length).toBeGreaterThan(0);
    const payload = JSON.parse(result.stderr) as Record<string, unknown>;
    expect(payload).toEqual(
      expect.objectContaining({
        code: 'DB_CONNECTION_FAILED',
        error: expect.stringContaining('Failed to open SQLite database'),
      }),
    );
  });
});

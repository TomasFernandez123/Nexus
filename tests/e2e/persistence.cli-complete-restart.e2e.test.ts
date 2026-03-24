import { afterEach, describe, expect, it } from 'vitest';
import { createE2EFixture, type E2EFixture } from './fixtures/index.js';
import { executeCliCommand } from './harness.js';

const fixtures = new Set<E2EFixture>();

const makeFixture = (): E2EFixture => {
  const fixture = createE2EFixture({
    ...process.env,
    NODE_ENV: 'test',
    MCP_PORT: '6462',
    LOG_LEVEL: 'error',
    SMOKE_TIMEOUT_MS: '4000',
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

describe('e2e persistence: complete across restart', () => {
  // Requirement: Data Persists Across CLI Restarts
  // Scenario: Completion persistence after restart
  // Requirement: Contract-Oriented Assertions
  // Scenario: Canonical payload assertion
  it('removes completed task from pending board output after restart', async () => {
    const fixture = makeFixture();

    const initResult = await executeCliCommand('init', [], { fixture });
    expect(initResult.code).toBe(0);

    const addResult = await executeCliCommand('add', ['fix', 'Complete me'], { fixture });
    expect(addResult.code, addResult.stderr).toBe(0);
    const created = JSON.parse(addResult.stdout) as { id: number };

    const completeResult = await executeCliCommand('complete', [String(created.id)], { fixture });
    expect(completeResult.code, completeResult.stderr).toBe(0);
    const completionPayload = JSON.parse(completeResult.stdout) as Record<string, unknown>;
    expect(completionPayload).toEqual(
      expect.objectContaining({
        task: expect.objectContaining({
          id: created.id,
          status: 'done',
        }),
        commit: expect.objectContaining({
          hash: expect.any(String),
          message: expect.any(String),
        }),
      }),
    );

    const boardResult = await executeCliCommand('board', [], { fixture });
    expect(boardResult.code, boardResult.stderr).toBe(0);
    const boardPayload = JSON.parse(boardResult.stdout) as Array<{ id: number }>;
    expect(boardPayload.some((task) => task.id === created.id)).toBe(false);
  });
});

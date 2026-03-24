import { afterEach, describe, expect, it } from 'vitest';
import { createE2EFixture, type E2EFixture } from './fixtures/index.js';
import { executeCliCommand } from './harness.js';

const fixtures = new Set<E2EFixture>();

const makeFixture = (): E2EFixture => {
  const fixture = createE2EFixture({
    ...process.env,
    NODE_ENV: 'test',
    MCP_PORT: '6464',
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

describe('e2e persistence: recovery after abrupt stop', () => {
  // Requirement: Recovery from Abrupt Termination
  // Scenario: Restart after abrupt stop
  // Requirement: Contract-Oriented Assertions
  // Scenario: Canonical payload assertion
  it('keeps committed records readable after a later abrupt process termination', async () => {
    const fixture = makeFixture();

    const initResult = await executeCliCommand('init', [], { fixture });
    expect(initResult.code).toBe(0);

    const addResult = await executeCliCommand('add', ['chore', 'Durable task'], { fixture });
    expect(addResult.code, addResult.stderr).toBe(0);
    const created = JSON.parse(addResult.stdout) as Record<string, unknown>;

    const abrupt = await executeCliCommand('mcp', ['stdio'], { fixture, timeoutMs: 25 });
    expect(abrupt.signal).toBe('SIGTERM');

    const boardResult = await executeCliCommand('board', [], { fixture });
    expect(boardResult.code, boardResult.stderr).toBe(0);
    const boardPayload = JSON.parse(boardResult.stdout) as Array<Record<string, unknown>>;
    expect(boardPayload).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: created.id,
          type: 'chore',
          title: 'Durable task',
          status: 'todo',
          created_at: expect.any(String),
        }),
      ]),
    );
  });
});

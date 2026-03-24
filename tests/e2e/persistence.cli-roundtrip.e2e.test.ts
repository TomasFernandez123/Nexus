import { afterEach, describe, expect, it } from 'vitest';
import { createE2EFixture, type E2EFixture } from './fixtures/index.js';
import { executeCliCommand } from './harness.js';

const fixtures = new Set<E2EFixture>();

const makeFixture = (): E2EFixture => {
  const fixture = createE2EFixture({
    ...process.env,
    NODE_ENV: 'test',
    MCP_PORT: '6461',
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

describe('e2e persistence: cli roundtrip', () => {
  // Requirement: Data Persists Across CLI Restarts
  // Scenario: Roundtrip persistence
  // Requirement: Contract-Oriented Assertions
  // Scenario: Canonical payload assertion
  it('persists add -> board across independent CLI subprocesses', async () => {
    const fixture = makeFixture();

    await expect(executeCliCommand('init', [], { fixture })).resolves.toMatchObject({ code: 0 });

    const addResult = await executeCliCommand('add', ['feat', 'Persist me'], { fixture });
    expect(addResult.code, addResult.stderr).toBe(0);
    const created = JSON.parse(addResult.stdout) as Record<string, unknown>;
    expect(created).toEqual(
      expect.objectContaining({
        id: expect.any(Number),
        type: 'feat',
        title: 'Persist me',
        status: 'todo',
        created_at: expect.any(String),
      }),
    );

    const boardResult = await executeCliCommand('board', [], { fixture });
    expect(boardResult.code, boardResult.stderr).toBe(0);
    const boardPayload = JSON.parse(boardResult.stdout) as Array<Record<string, unknown>>;
    expect(boardPayload.length).toBeGreaterThan(0);
    expect(boardPayload).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: created.id,
          type: 'feat',
          title: 'Persist me',
          status: 'todo',
          created_at: expect.any(String),
        }),
      ]),
    );
  });
});

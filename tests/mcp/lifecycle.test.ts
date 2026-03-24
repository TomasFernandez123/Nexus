import { afterEach, describe, expect, it } from 'vitest';
import { startMcpServer } from '../../src/mcp/server.js';
import { resetRuntimeForTests } from '../../src/runtime/index.js';
import { unlinkSync } from 'node:fs';
import type { LifecyclePhase } from '../../src/runtime/index.js';

const originalEnv = process.env;

const cleanupDbFiles = (path: string): void => {
  for (const candidate of [path, `${path}-shm`, `${path}-wal`]) {
    try {
      unlinkSync(candidate);
    } catch {
      // ignore cleanup errors
    }
  }
};

describe('mcp lifecycle parity', () => {
  const dbPath = '.nexus.mcp.lifecycle.test.db';

  afterEach(() => {
    resetRuntimeForTests();
    process.env = originalEnv;
    cleanupDbFiles(dbPath);
  });

  it('emits running -> shutdown -> terminated for HTTP startup and clean stop', async () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: 'test',
      MCP_PORT: '7091',
      LOG_LEVEL: 'error',
      NEXUS_DB_PATH: dbPath,
    };

    const phases: LifecyclePhase[] = [];
    const handle = await startMcpServer({
      onLifecyclePhaseChange: (phase) => phases.push(phase),
    });

    await handle.stop();

    expect(phases).toEqual(['running', 'shutdown', 'terminated']);
  });
});

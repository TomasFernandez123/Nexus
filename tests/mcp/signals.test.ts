import { afterEach, describe, expect, it } from 'vitest';
import { PassThrough } from 'node:stream';
import { startMcpServer } from '../../src/mcp/server.js';
import { resetRuntimeForTests } from '../../src/runtime/index.js';
import { unlinkSync } from 'node:fs';

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

describe('mcp signal handling', () => {
  const dbPath = '.nexus.mcp.signals.test.db';
  const originalExitCode = process.exitCode;

  afterEach(() => {
    resetRuntimeForTests();
    process.env = originalEnv;
    process.exitCode = originalExitCode;
    cleanupDbFiles(dbPath);
  });

  it('handles repeated SIGINT with idempotent shutdown and deterministic listeners cleanup', async () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: 'test',
      MCP_PORT: '7092',
      LOG_LEVEL: 'error',
      NEXUS_DB_PATH: dbPath,
    };

    const sigintBefore = process.listeners('SIGINT').length;
    const sigtermBefore = process.listeners('SIGTERM').length;

    const input = new PassThrough();
    const output = new PassThrough();
    const handle = await startMcpServer({ mode: 'stdio', input, output });

    expect(process.listeners('SIGINT').length).toBe(sigintBefore + 1);
    expect(process.listeners('SIGTERM').length).toBe(sigtermBefore + 1);

    process.emit('SIGINT');
    process.emit('SIGINT');
    await handle.stop();

    expect(process.listeners('SIGINT').length).toBe(sigintBefore);
    expect(process.listeners('SIGTERM').length).toBe(sigtermBefore);
    expect(process.exitCode).toBe(130);
  });
});

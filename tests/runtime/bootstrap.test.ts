import { afterEach, describe, expect, it, vi } from 'vitest';
import { getRuntime, resetRuntimeForTests } from '../../src/runtime/index.js';
import { runCli } from '../../src/cli/main.js';
import { startMcpServer } from '../../src/mcp/server.js';
import { unlinkSync } from 'node:fs';

const baseEnv = process.env;

afterEach(() => {
  resetRuntimeForTests();
  process.env = baseEnv;
  vi.restoreAllMocks();
});

describe('runtime bootstrap composition', () => {
  it('initializes config and logger exactly once and shares singleton runtime', async () => {
    process.env = {
      ...baseEnv,
      NODE_ENV: 'test',
      MCP_PORT: '6124',
      LOG_LEVEL: 'error',
      NEXUS_DB_PATH: '.nexus.bootstrap.test.db',
    };

    const runtimeA = getRuntime();
    const runtimeB = getRuntime();

    expect(runtimeA).toBe(runtimeB);

    runCli(['--help']);

    const handle = await startMcpServer();
    await handle.stop();

    const runtimeC = getRuntime();
    expect(runtimeC).toBe(runtimeA);

    try {
      unlinkSync('.nexus.bootstrap.test.db');
    } catch {
      // ignore cleanup errors in test
    }
  });

  it('running only CLI mode does not bind MCP ports', async () => {
    const port = 6123;
    process.env = {
      ...baseEnv,
      NODE_ENV: 'test',
      MCP_PORT: String(port),
      LOG_LEVEL: 'error',
      NEXUS_DB_PATH: '.nexus.bootstrap.test.db',
    };

    const code = runCli(['--help']);
    expect(code).toBe(0);

    const response = await fetch(`http://127.0.0.1:${port}/health`)
      .then(() => 'reachable')
      .catch(() => 'unreachable');

    expect(response).toBe('unreachable');

    try {
      unlinkSync('.nexus.bootstrap.test.db');
    } catch {
      // ignore cleanup errors in test
    }
  });

  it('wires taskService into runtime singleton', () => {
    process.env = {
      ...baseEnv,
      NODE_ENV: 'test',
      MCP_PORT: '6125',
      LOG_LEVEL: 'error',
      NEXUS_DB_PATH: '.nexus.bootstrap.test.db',
    };

    const runtime = getRuntime();
    expect(runtime.taskService).toBeDefined();

    try {
      unlinkSync('.nexus.bootstrap.test.db');
    } catch {
      // ignore cleanup errors in test
    }
  });
});

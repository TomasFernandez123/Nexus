import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RuntimeDeps } from '../../src/runtime/types.js';
import { getRuntime, resetRuntimeForTests } from '../../src/runtime/index.js';
import { unlinkSync } from 'node:fs';

const baseEnv = process.env;

afterEach(() => {
  resetRuntimeForTests();
  process.env = baseEnv;
  vi.restoreAllMocks();
});

describe('RuntimeDeps contract', () => {
  it('keeps consumer-visible runtime surface minimal', () => {
    process.env = {
      ...baseEnv,
      NODE_ENV: 'test',
      MCP_PORT: '6130',
      LOG_LEVEL: 'error',
      NEXUS_DB_PATH: '.nexus.runtime-contract.test.db',
    };

    const runtime: RuntimeDeps = getRuntime();

    expect(Object.keys(runtime).sort()).toEqual(['config', 'dbBootstrapService', 'logger', 'taskService']);
    expect(runtime.config).toBeDefined();
    expect(runtime.logger).toBeDefined();
    expect(runtime.dbBootstrapService).toBeDefined();
    expect(runtime.taskService).toBeDefined();

    try {
      unlinkSync('.nexus.runtime-contract.test.db');
    } catch {
      // ignore cleanup errors in test
    }
  });
});

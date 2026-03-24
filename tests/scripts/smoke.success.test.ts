import { afterEach, describe, expect, it } from 'vitest';
import { runE2E } from '../../scripts/smoke.js';
import { resetRuntimeForTests } from '../../src/runtime/index.js';
import { createE2EFixture } from '../e2e/fixtures/index.js';

const originalEnv = process.env;

describe('smoke success flow', () => {
  afterEach(() => {
    resetRuntimeForTests();
    process.env = originalEnv;
  });

  it('passes CLI help and MCP health checks within timeout', async () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: 'test',
      MCP_PORT: '6331',
      LOG_LEVEL: 'error',
      SMOKE_TIMEOUT_MS: '1000',
    };

    await expect(runE2E(createE2EFixture())).resolves.toBeUndefined();
  });
});

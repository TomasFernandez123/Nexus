import { describe, expect, it } from 'vitest';
import { runMcpHealthSmoke } from './harness.js';
import { createE2EFixture } from './fixtures/index.js';
import { resetRuntimeForTests } from '../../src/runtime/index.js';

const originalEnv = process.env;

describe('e2e smoke: mcp health', () => {
  it('polls health endpoint until MCP is ready', async () => {
    resetRuntimeForTests();
    try {
      process.env = {
        ...originalEnv,
        NODE_ENV: 'test',
        MCP_PORT: '6342',
        LOG_LEVEL: 'error',
      };

      const fixture = createE2EFixture({
        ...originalEnv,
        ...process.env,
        SMOKE_TIMEOUT_MS: '1000',
        SMOKE_POLL_INTERVAL_MS: '50',
      });

      try {
        await expect(runMcpHealthSmoke(fixture)).resolves.toBeUndefined();
      } finally {
        fixture.cleanup();
      }
    } finally {
      process.env = originalEnv;
      resetRuntimeForTests();
    }
  });
});

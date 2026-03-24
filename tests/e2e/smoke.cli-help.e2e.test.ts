import { describe, expect, it } from 'vitest';
import { runCliHelpSmoke } from './harness.js';
import { createE2EFixture } from './fixtures/index.js';

describe('e2e smoke: cli help', () => {
  it('validates --help exit code and usage marker', async () => {
    const fixture = createE2EFixture({
      ...process.env,
      NODE_ENV: 'test',
      MCP_PORT: '6341',
      LOG_LEVEL: 'error',
      SMOKE_TIMEOUT_MS: '1000',
    });

    try {
      await expect(runCliHelpSmoke(fixture)).resolves.toBeUndefined();
    } finally {
      fixture.cleanup();
    }
  });
});

import { describe, expect, it } from 'vitest';
import { runCliHelpSmoke } from './harness.js';
import { createE2EFixture } from './fixtures/index.js';

describe('e2e smoke: cli help regression', () => {
  it('fails with actionable context when usage marker is missing', async () => {
    const fixture = createE2EFixture({
      ...process.env,
      NODE_ENV: 'test',
      MCP_PORT: '6343',
      LOG_LEVEL: 'error',
      SMOKE_TIMEOUT_MS: '1000',
    });

    const brokenFixture = {
      ...fixture,
      usageMarker: 'UNREACHABLE_USAGE_MARKER_FOR_REGRESSION',
    };

    try {
      await expect(runCliHelpSmoke(brokenFixture)).rejects.toMatchObject({
        name: 'E2EHarnessError',
        diagnostics: {
          step: 'cli-help',
          reason: expect.stringContaining("Usage marker 'UNREACHABLE_USAGE_MARKER_FOR_REGRESSION' not found"),
        },
      });
    } finally {
      fixture.cleanup();
    }
  });
});

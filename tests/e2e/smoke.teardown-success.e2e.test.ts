import { describe, expect, it, vi } from 'vitest';
import { runMcpHealthSmoke } from './harness.js';
import { createE2EFixture } from './fixtures/index.js';

describe('e2e smoke: teardown on success', () => {
  it('executes teardown successfully after healthy pass', async () => {
    const fixture = createE2EFixture({
      ...process.env,
      NODE_ENV: 'test',
      MCP_PORT: '6344',
      LOG_LEVEL: 'error',
      SMOKE_TIMEOUT_MS: '300',
      SMOKE_POLL_INTERVAL_MS: '10',
    });

    const stop = vi.fn(async () => undefined);

    try {
      await expect(
        runMcpHealthSmoke(fixture, {
          startServer: async () => ({
            server: { listening: true } as never,
            stop,
          }),
          pollDeps: {
            fetchImpl: vi.fn<typeof fetch>().mockResolvedValue({ status: 200 } as Response),
          },
        }),
      ).resolves.toBeUndefined();

      expect(stop).toHaveBeenCalledTimes(1);
    } finally {
      fixture.cleanup();
    }
  });
});

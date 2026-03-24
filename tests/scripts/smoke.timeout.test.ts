import { afterEach, describe, expect, it, vi } from 'vitest';
import { runMcpHealthSmoke } from '../e2e/harness.js';
import { createE2EFixture } from '../e2e/fixtures/index.js';

describe('smoke timeout edge case', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fails with timeout context when MCP health does not respond in time', async () => {
    process.env = {
      ...process.env,
      MCP_PORT: '6321',
      SMOKE_TIMEOUT_MS: '25',
      SMOKE_POLL_INTERVAL_MS: '5',
    };

    const stop = vi.fn(async () => undefined);

    await expect(
      runMcpHealthSmoke(createE2EFixture(), {
        startServer: async () => ({
          server: { listening: true } as never,
          stop,
        }),
        pollDeps: {
          fetchImpl: (() =>
            new Promise<Response>((_resolve, reject) => {
              const abortError = new Error('The operation was aborted.');
              abortError.name = 'AbortError';
              setTimeout(() => reject(abortError), 35);
            })) as typeof fetch,
        },
      }),
    ).rejects.toThrowError(/MCP healthcheck timeout after 25ms/);

    expect(stop).toHaveBeenCalledTimes(1);
  });
});

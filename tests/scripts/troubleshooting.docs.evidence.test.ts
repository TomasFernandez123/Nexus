import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runMcpHealthSmoke } from '../e2e/harness.js';
import { createE2EFixture } from '../e2e/fixtures/index.js';

const readDocs = (): string => {
  const path = resolve(process.cwd(), 'docs/testing.md');
  return readFileSync(path, 'utf8');
};

describe('troubleshooting docs executable evidence', () => {
  it('timeout troubleshooting section is backed by executable timeout failure', async () => {
    const docs = readDocs();
    expect(docs).toContain('### 1) Timeout de health MCP');
    expect(docs).toContain('MCP healthcheck timeout after <N>ms');

    const fixture = createE2EFixture({
      ...process.env,
      NODE_ENV: 'test',
      MCP_PORT: '6345',
      LOG_LEVEL: 'error',
      SMOKE_TIMEOUT_MS: '25',
      SMOKE_POLL_INTERVAL_MS: '5',
    });

    try {
      await expect(
        runMcpHealthSmoke(fixture, {
          startServer: async () => ({
            server: { listening: true } as never,
            stop: async () => undefined,
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
    } finally {
      fixture.cleanup();
    }
  });

  it('command parity troubleshooting section is backed by executable parity check', () => {
    const docs = readDocs();
    expect(docs).toContain('### 2) Paridad local/CI');
    expect(docs).toContain('npm run test:e2e');

    const packageJsonPath = resolve(process.cwd(), 'package.json');
    const workflowPath = resolve(process.cwd(), '.github/workflows/e2e-smoke.yml');

    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
      scripts?: Record<string, string>;
    };
    const workflow = readFileSync(workflowPath, 'utf8');

    expect(packageJson.scripts?.['test:e2e']).toBeTypeOf('string');
    expect(workflow).toContain('run: npm run test:e2e');
  });
});

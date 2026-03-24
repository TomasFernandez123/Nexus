import { afterEach, describe, expect, it, vi } from 'vitest';
import { PassThrough } from 'node:stream';
import { runCli } from '../../src/cli/main.js';
import { startMcpServer } from '../../src/mcp/server.js';
import { getRuntime, resetRuntimeForTests } from '../../src/runtime/index.js';
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

const waitForOutput = async (stream: PassThrough, minLines: number): Promise<string[]> => {
  const lines: string[] = [];

  return new Promise((resolve) => {
    const onData = (chunk: Buffer | string): void => {
      const value = chunk.toString();
      for (const part of value.split('\n')) {
        const trimmed = part.trim();
        if (trimmed.length > 0) {
          lines.push(trimmed);
        }
      }

      if (lines.length >= minLines) {
        stream.off('data', onData);
        resolve(lines);
      }
    };

    stream.on('data', onData);
  });
};

describe('error code parity between CLI and MCP', () => {
  const dbPath = '.nexus.error.parity.test.db';
  const noInitDbPath = '.nexus.error.parity.noinit.test.db';

  afterEach(() => {
    resetRuntimeForTests();
    process.env = originalEnv;
    vi.restoreAllMocks();
    cleanupDbFiles(dbPath);
    cleanupDbFiles(noInitDbPath);
  });

  it('returns TASK_NOT_FOUND for same missing-task failure', async () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: 'test',
      MCP_PORT: '6092',
      LOG_LEVEL: 'error',
      NEXUS_DB_PATH: dbPath,
    };

    const cliErr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    expect(runCli(['init'])).toBe(0);
    const cliCode = runCli(['complete', '99999']);
    expect(cliCode).toBe(1);

    const cliPayloadRaw = cliErr.mock.calls.at(-1)?.[0];
    expect(typeof cliPayloadRaw).toBe('string');

    const cliPayload = JSON.parse(String(cliPayloadRaw));
    expect(cliPayload).toMatchObject({
      code: 'TASK_NOT_FOUND',
      error: expect.any(String),
    });

    const handle = await startMcpServer();
    try {
      const mcpResponse = await fetch('http://127.0.0.1:6092/tools/call', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          tool: 'task_complete',
          input: { id: 99999 },
        }),
      });

      expect(mcpResponse.status).toBe(400);
      const mcpPayload = await mcpResponse.json();
      expect(mcpPayload).toMatchObject({
        code: 'TASK_NOT_FOUND',
        error: expect.any(String),
      });

      expect(mcpPayload.code).toBe(cliPayload.code);
    } finally {
      await handle.stop();
    }
  });

  it('returns DB_NOT_INITIALIZED for same bootstrap check failure when baseline is missing', async () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: 'test',
      MCP_PORT: '6093',
      LOG_LEVEL: 'error',
      NEXUS_DB_PATH: noInitDbPath,
    };

    const cliErr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    const cliCode = runCli(['check']);
    expect(cliCode).toBe(1);

    const cliPayloadRaw = cliErr.mock.calls.at(-1)?.[0];
    expect(typeof cliPayloadRaw).toBe('string');
    const cliPayload = JSON.parse(String(cliPayloadRaw));
    expect(cliPayload).toMatchObject({
      code: 'DB_NOT_INITIALIZED',
      error: expect.any(String),
    });

    const handle = await startMcpServer();
    try {
      const mcpResponse = await fetch('http://127.0.0.1:6093/tools/call', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          tool: 'db_check',
          input: {},
        }),
      });

      expect(mcpResponse.status).toBe(400);
      const mcpPayload = await mcpResponse.json();
      expect(mcpPayload).toMatchObject({
        code: 'DB_NOT_INITIALIZED',
        error: expect.any(String),
      });

      expect(mcpPayload.code).toBe(cliPayload.code);
    } finally {
      await handle.stop();
    }
  });

  it('keeps terminal infrastructure category parity for same db_check failure in CLI and MCP stdio', async () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: 'test',
      MCP_PORT: '6094',
      LOG_LEVEL: 'error',
      NEXUS_DB_PATH: dbPath,
    };

    const runtime = getRuntime();
    vi.spyOn(runtime.dbBootstrapService, 'check').mockImplementation(() => {
      throw new Error('simulated infra failure in db_check');
    });

    const cliErr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const cliCode = runCli(['check']);

    expect(cliCode).toBe(70);
    expect(cliErr.mock.calls.at(-1)?.[0]).toContain('simulated infra failure in db_check');

    const input = new PassThrough();
    const output = new PassThrough();
    const handle = await startMcpServer({ mode: 'stdio', input, output });

    try {
      input.write(`${JSON.stringify({ id: 1, method: 'initialize' })}\n`);
      input.write(
        `${JSON.stringify({
          id: 2,
          method: 'tools/call',
          params: { name: 'db_check', arguments: {} },
        })}\n`,
      );

      const lines = await waitForOutput(output, 2);
      const dbCheckFailure = JSON.parse(lines[1]) as Record<string, unknown>;

      expect(dbCheckFailure).toMatchObject({
        id: 2,
        result: {
          isError: true,
          content: [{ type: 'text', text: expect.any(String) }],
          structuredContent: {
            code: 'INFRASTRUCTURE_ERROR',
            error: 'simulated infra failure in db_check',
          },
        },
      });

      const result = dbCheckFailure.result as {
        content: Array<{ type: string; text: string }>;
        structuredContent: Record<string, unknown>;
      };
      expect(JSON.parse(result.content[0].text)).toMatchObject(result.structuredContent);
    } finally {
      input.end();
      await handle.stop();
    }
  });
});

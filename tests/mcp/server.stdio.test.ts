import { afterEach, describe, expect, it } from 'vitest';
import { PassThrough } from 'node:stream';
import { mkdtempSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startMcpServer } from '../../src/mcp/server.js';
import { resetRuntimeForTests } from '../../src/runtime/index.js';

const originalEnv = process.env;

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

const cleanupDbFiles = (path: string): void => {
  for (const candidate of [path, `${path}-shm`, `${path}-wal`]) {
    try {
      unlinkSync(candidate);
    } catch {
      // ignore cleanup errors
    }
  }
};

describe('mcp stdio mode', () => {
  const dbPath = '.nexus.mcp.stdio.test.db';
  const tempRoots: string[] = [];

  afterEach(() => {
    resetRuntimeForTests();
    process.env = originalEnv;
    cleanupDbFiles(dbPath);
    for (const root of tempRoots.splice(0)) {
      cleanupDbFiles(join(root, '.nexuscli', 'db'));
    }
  });

  it('resolves active root from roots and re-resolves on roots/list_changed', async () => {
    const rootA = mkdtempSync(join(tmpdir(), 'nexuscli-stdio-root-a-'));
    const rootB = mkdtempSync(join(tmpdir(), 'nexuscli-stdio-root-b-'));
    tempRoots.push(rootA, rootB);

    process.env = {
      ...originalEnv,
      NODE_ENV: 'test',
      MCP_PORT: '7004',
      LOG_LEVEL: 'error',
    };

    const input = new PassThrough();
    const output = new PassThrough();

    const handle = await startMcpServer({ mode: 'stdio', input, output });
    try {
      input.write(
        `${JSON.stringify({
          id: 1,
          method: 'initialize',
          params: {
            capabilities: { roots: {} },
            roots: [{ path: rootA }],
          },
        })}\n`,
      );
      input.write(
        `${JSON.stringify({
          id: 2,
          method: 'tools/call',
          params: { name: 'runtime_info', arguments: {} },
        })}\n`,
      );
      input.write(
        `${JSON.stringify({
          id: 3,
          method: 'notifications/roots/list_changed',
          params: { roots: [{ path: rootB }] },
        })}\n`,
      );
      input.write(
        `${JSON.stringify({
          id: 4,
          method: 'tools/call',
          params: { name: 'runtime_info', arguments: {} },
        })}\n`,
      );

      const lines = await waitForOutput(output, 4);
      const runtimeInfoA = JSON.parse(lines[1]) as {
        id: number;
        result: { structuredContent: { cwd: string; resolutionSource: string } };
      };
      const rootsChangedAck = JSON.parse(lines[2]) as Record<string, unknown>;
      const runtimeInfoB = JSON.parse(lines[3]) as {
        id: number;
        result: { structuredContent: { cwd: string; resolutionSource: string } };
      };

      expect(runtimeInfoA.id).toBe(2);
      expect(runtimeInfoA.result.structuredContent.cwd).toBe(rootA);
      expect(runtimeInfoA.result.structuredContent.resolutionSource).toBe('roots');

      expect(rootsChangedAck).toMatchObject({
        id: 3,
        result: {},
      });

      expect(runtimeInfoB.id).toBe(4);
      expect(runtimeInfoB.result.structuredContent.cwd).toBe(rootB);
      expect(runtimeInfoB.result.structuredContent.resolutionSource).toBe('roots');
    } finally {
      input.end();
      await handle.stop();
    }
  });

  it('uses initialize client cwd when roots are unavailable', async () => {
    const clientRoot = mkdtempSync(join(tmpdir(), 'nexuscli-stdio-client-root-'));
    tempRoots.push(clientRoot);

    process.env = {
      ...originalEnv,
      NODE_ENV: 'test',
      MCP_PORT: '7005',
      LOG_LEVEL: 'error',
    };

    const input = new PassThrough();
    const output = new PassThrough();

    const handle = await startMcpServer({ mode: 'stdio', input, output });
    try {
      input.write(
        `${JSON.stringify({
          id: 1,
          method: 'initialize',
          params: {
            capabilities: { tools: {} },
            clientInfo: { name: 'nexus-client', version: '1.0.0', cwd: clientRoot },
          },
        })}\n`,
      );
      input.write(
        `${JSON.stringify({
          id: 2,
          method: 'tools/call',
          params: { name: 'runtime_info', arguments: {} },
        })}\n`,
      );

      const lines = await waitForOutput(output, 2);
      const runtimeInfo = JSON.parse(lines[1]) as {
        id: number;
        result: { structuredContent: { cwd: string; resolutionSource: string } };
      };

      expect(runtimeInfo.id).toBe(2);
      expect(runtimeInfo.result.structuredContent.cwd).toBe(clientRoot);
      expect(runtimeInfo.result.structuredContent.resolutionSource).toBe('client');
    } finally {
      input.end();
      await handle.stop();
    }
  });

  it('proves stdio call results expose content + structuredContent with canonical tool errors', async () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: 'test',
      MCP_PORT: '7001',
      LOG_LEVEL: 'error',
      NEXUS_DB_PATH: dbPath,
    };

    const input = new PassThrough();
    const output = new PassThrough();

    const handle = await startMcpServer({ mode: 'stdio', input, output });
    try {
      input.write(`${JSON.stringify({ id: 1, method: 'initialize' })}\n`);
      input.write(`${JSON.stringify({ id: 2, method: 'tools/list' })}\n`);
      input.write(
        `${JSON.stringify({
          id: 3,
          method: 'tools/call',
          params: { name: 'db_init', arguments: {} },
        })}\n`,
      );
      input.write(
        `${JSON.stringify({
          id: 4,
          method: 'tools/call',
          params: { name: 'task_create', arguments: { type: 'feat', title: 'stdio parity test' } },
        })}\n`,
      );
      input.write(
        `${JSON.stringify({
          id: 5,
          method: 'tools/call',
          params: { name: 'unknown_tool', arguments: {} },
        })}\n`,
      );
      input.write(
        `${JSON.stringify({
          id: 6,
          method: 'tools/call',
          params: { name: 'task_start', arguments: { id: 0 } },
        })}\n`,
      );
      input.write(
        `${JSON.stringify({
          id: 7,
          method: 'tools/call',
          params: { name: 'runtime_info', arguments: {} },
        })}\n`,
      );
      input.write(
        `${JSON.stringify({
          id: 8,
          method: 'tools/call',
          params: { name: 'task_list_pending', arguments: {} },
        })}\n`,
      );

      const lines = await waitForOutput(output, 8);

      const initializeAck = JSON.parse(lines[0]) as Record<string, unknown>;
      expect(initializeAck).toMatchObject({
        id: 1,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'nexuscli', version: '0.1.0' },
        },
      });

      const toolsList = JSON.parse(lines[1]) as Record<string, unknown>;
      expect(toolsList).toMatchObject({
        id: 2,
        result: {
          tools: expect.arrayContaining([
            expect.objectContaining({ name: 'task_create' }),
            expect.objectContaining({ name: 'task_list_pending' }),
            expect.objectContaining({ name: 'task_start' }),
            expect.objectContaining({ name: 'task_add_log' }),
            expect.objectContaining({ name: 'task_complete' }),
          ]),
        },
      });

      const dbInit = JSON.parse(lines[2]) as Record<string, unknown>;
      expect(dbInit).toMatchObject({
        id: 3,
        result: {
          content: [
            {
              type: 'text',
              text: expect.any(String),
            },
          ],
          structuredContent: {
            status: 'initialized',
            schemaVersion: expect.any(String),
            dbPath: expect.any(String),
          },
        },
      });

      const taskCreate = JSON.parse(lines[3]) as Record<string, unknown>;
      expect(taskCreate).toMatchObject({
        id: 4,
        result: {
          content: [
            {
              type: 'text',
              text: expect.any(String),
            },
          ],
          structuredContent: {
            id: expect.any(Number),
            type: 'feat',
            title: 'stdio parity test',
            status: 'todo',
            created_at: expect.any(String),
            updated_at: expect.any(String),
            completed_at: null,
            commit_hash: null,
            commit_message: null,
          },
        },
      });

      const taskCreateResult = (taskCreate.result as Record<string, unknown>).structuredContent as Record<string, unknown>;
      expect(taskCreateResult).not.toHaveProperty('createdAt');
      expect(taskCreateResult).not.toHaveProperty('updatedAt');
      expect(taskCreateResult).not.toHaveProperty('completedAt');

      const unknownTool = JSON.parse(lines[4]) as Record<string, unknown>;
      expect(unknownTool).toMatchObject({
        id: 5,
        result: {
          isError: true,
          content: [
            {
              type: 'text',
              text: expect.any(String),
            },
          ],
          structuredContent: {
            code: 'VALIDATION_ERROR',
            error: "Unsupported tool 'unknown_tool'",
          },
        },
      });

      const validationFailure = JSON.parse(lines[5]) as Record<string, unknown>;
      expect(validationFailure).toMatchObject({
        id: 6,
        result: {
          isError: true,
          content: [
            {
              type: 'text',
              text: expect.any(String),
            },
          ],
          structuredContent: {
            code: 'VALIDATION_ERROR',
            error: expect.stringContaining('positive integer'),
          },
        },
      });

      const runtimeInfo = JSON.parse(lines[6]) as Record<string, unknown>;
      expect(runtimeInfo).toMatchObject({
        id: 7,
        result: {
          content: [{ type: 'text', text: expect.any(String) }],
          structuredContent: {
            cwd: expect.any(String),
            dbPath: expect.any(String),
            projectNamespace: expect.any(String),
            resolutionSource: 'process',
            nodeVersion: expect.any(String),
            runtime: 'node',
            serverVersion: '0.1.0',
          },
        },
      });

      const runtimeInfoResult = runtimeInfo.result as {
        content: Array<{ type: string; text: string }>;
        structuredContent: Record<string, unknown>;
      };
      expect(JSON.parse(runtimeInfoResult.content[0].text)).toMatchObject(runtimeInfoResult.structuredContent);

      const pendingList = JSON.parse(lines[7]) as Record<string, unknown>;
      expect(pendingList).toMatchObject({
        id: 8,
        result: {
          content: [{ type: 'text', text: expect.any(String) }],
          structuredContent: {
            items: [
              expect.objectContaining({
                title: 'stdio parity test',
                status: 'todo',
              }),
            ],
            next_cursor: null,
          },
        },
      });

      const pendingListResult = pendingList.result as {
        content: Array<{ type: string; text: string }>;
        structuredContent: Record<string, unknown>;
      };
      expect(JSON.parse(pendingListResult.content[0].text)).toMatchObject(pendingListResult.structuredContent);
    } finally {
      input.end();
      await handle.stop();
    }
  });

  it('handles EOF shutdown without emitting partial/corrupted envelopes', async () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: 'test',
      MCP_PORT: '7002',
      LOG_LEVEL: 'error',
      NEXUS_DB_PATH: dbPath,
    };

    const input = new PassThrough();
    const output = new PassThrough();
    const handle = await startMcpServer({ mode: 'stdio', input, output });

    input.write(`${JSON.stringify({ id: 1, method: 'initialize' })}\n`);
    input.end();

    const lines = await waitForOutput(output, 1);
    await handle.stop();

    expect(lines.length).toBeGreaterThanOrEqual(1);
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
  });

  it('removes signal listeners gracefully on explicit stop', async () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: 'test',
      MCP_PORT: '7003',
      LOG_LEVEL: 'error',
      NEXUS_DB_PATH: dbPath,
    };

    const sigintBefore = process.listeners('SIGINT').length;
    const sigtermBefore = process.listeners('SIGTERM').length;

    const input = new PassThrough();
    const output = new PassThrough();
    const handle = await startMcpServer({ mode: 'stdio', input, output });

    expect(process.listeners('SIGINT').length).toBe(sigintBefore + 1);
    expect(process.listeners('SIGTERM').length).toBe(sigtermBefore + 1);

    await handle.stop();

    expect(process.listeners('SIGINT').length).toBeLessThanOrEqual(sigintBefore);
    expect(process.listeners('SIGTERM').length).toBeLessThanOrEqual(sigtermBefore);

    expect(output.readable).toBe(true);
  });
});

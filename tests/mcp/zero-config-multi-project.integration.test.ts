import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { getRuntime, getRuntimeForRoot, resetRuntimeForTests } from '../../src/runtime/index.js';
import { startMcpServer } from '../../src/mcp/server.js';

const originalEnv = process.env;

const callTool = async (port: number, tool: string, input: Record<string, unknown> = {}): Promise<Response> =>
  fetch(`http://127.0.0.1:${port}/tools/call`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ tool, input }),
  });

const withMcpSession = async <T>(env: NodeJS.ProcessEnv, run: (port: number) => Promise<T>): Promise<T> => {
  process.env = env;
  const handle = await startMcpServer();
  try {
    const runtime = getRuntime();
    if (runtime.config.MCP_PORT === undefined) {
      throw new Error('MCP_PORT must be configured in test session');
    }
    return await run(runtime.config.MCP_PORT);
  } finally {
    await handle.stop();
    resetRuntimeForTests();
  }
};

describe('mcp zero-config multi-project runtime', () => {
  const projectRoots: string[] = [];

  afterEach(() => {
    process.env = originalEnv;
    resetRuntimeForTests();
    vi.restoreAllMocks();

    while (projectRoots.length > 0) {
      const dir = projectRoots.pop();
      if (!dir) continue;
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('auto-initializes schema for first tool usage without db_init', async () => {
    const projectA = mkdtempSync(join(tmpdir(), 'nexuscli-mcp-project-a-'));
    projectRoots.push(projectA);

    await withMcpSession(
      {
        ...originalEnv,
        NODE_ENV: 'test',
        LOG_LEVEL: 'error',
        MCP_PORT: '7111',
        NEXUS_CLIENT_CWD: projectA,
      },
      async (port) => {
        const listResponse = await callTool(port, 'task_list_pending', {});
        expect(listResponse.status).toBe(200);
        const listPayload = await listResponse.json() as {
          items: unknown[];
          next_cursor: string | null;
        };
        expect(listPayload).toEqual({
          items: [],
          next_cursor: null,
        });

        const diagnosticsResponse = await callTool(port, 'runtime_info', {});
        expect(diagnosticsResponse.status).toBe(200);
        const diagnostics = await diagnosticsResponse.json() as {
          cwd: string;
          dbPath: string;
          projectNamespace: string;
          nodeVersion: string;
          runtime: string;
          serverVersion: string;
        };

        expect(diagnostics.cwd).toBe(resolve(projectA));
        expect(diagnostics.dbPath).toContain('.nexuscli/db/');
        expect(diagnostics.projectNamespace).toMatch(/^.+-[a-f0-9]{16}$/);
        expect(diagnostics.nodeVersion).toMatch(/^v/);
        expect(diagnostics.runtime).toBe('node');
        expect(diagnostics.serverVersion).toBe('0.1.0');
      },
    );
  });

  it('keeps state isolated between projects and persistent per project', async () => {
    const projectA = mkdtempSync(join(tmpdir(), 'nexuscli-mcp-project-a-'));
    const projectB = mkdtempSync(join(tmpdir(), 'nexuscli-mcp-project-b-'));
    projectRoots.push(projectA, projectB);

    let dbPathA = '';
    let dbPathB = '';

    await withMcpSession(
      {
        ...originalEnv,
        NODE_ENV: 'test',
        LOG_LEVEL: 'error',
        MCP_PORT: '7112',
        NEXUS_CLIENT_CWD: projectA,
      },
      async (port) => {
        const createA = await callTool(port, 'task_create', { type: 'feat', title: 'Task only for project A' });
        expect(createA.status).toBe(200);

        const diagnosticsA = await callTool(port, 'runtime_info', {});
        const payloadA = await diagnosticsA.json() as { dbPath: string };
        dbPathA = payloadA.dbPath;
      },
    );

    await withMcpSession(
      {
        ...originalEnv,
        NODE_ENV: 'test',
        LOG_LEVEL: 'error',
        MCP_PORT: '7113',
        NEXUS_CLIENT_CWD: projectB,
      },
      async (port) => {
        const createB = await callTool(port, 'task_create', { type: 'fix', title: 'Task only for project B' });
        expect(createB.status).toBe(200);

        const diagnosticsB = await callTool(port, 'runtime_info', {});
        const payloadB = await diagnosticsB.json() as { dbPath: string };
        dbPathB = payloadB.dbPath;
      },
    );

    expect(dbPathA).not.toBe(dbPathB);

    await withMcpSession(
      {
        ...originalEnv,
        NODE_ENV: 'test',
        LOG_LEVEL: 'error',
        MCP_PORT: '7114',
        NEXUS_CLIENT_CWD: projectA,
      },
      async (port) => {
        const listA = await callTool(port, 'task_list_pending', {});
        expect(listA.status).toBe(200);
        const payloadA = await listA.json() as {
          items: Array<{ title: string }>;
        };
        expect(payloadA.items.map((task) => task.title)).toEqual(['Task only for project A']);
      },
    );

    await withMcpSession(
      {
        ...originalEnv,
        NODE_ENV: 'test',
        LOG_LEVEL: 'error',
        MCP_PORT: '7115',
        NEXUS_CLIENT_CWD: projectB,
      },
      async (port) => {
        const listB = await callTool(port, 'task_list_pending', {});
        expect(listB.status).toBe(200);
        const payloadB = await listB.json() as {
          items: Array<{ title: string }>;
        };
        expect(payloadB.items.map((task) => task.title)).toEqual(['Task only for project B']);
      },
    );
  });

  it('returns controlled timeout error for read tools instead of hanging', async () => {
    const projectA = mkdtempSync(join(tmpdir(), 'nexuscli-mcp-project-timeout-'));
    projectRoots.push(projectA);

    await withMcpSession(
      {
        ...originalEnv,
        NODE_ENV: 'test',
        LOG_LEVEL: 'error',
        MCP_PORT: '7116',
        NEXUS_CLIENT_CWD: projectA,
        NEXUS_READ_TOOL_TIMEOUT_MS: '30',
      },
      async (port) => {
        const runtime = getRuntimeForRoot(projectA);
        vi.spyOn(runtime.taskService, 'listPendingPage').mockImplementation(
          () => new Promise(() => undefined) as never,
        );

        const response = await callTool(port, 'task_list_pending', { limit: 10 });
        expect(response.status).toBe(500);
        const payload = await response.json() as { code: string; error: string };
        expect(payload.code).toBe('VALIDATION_ERROR');
        expect(payload.error).toContain('task_list_pending timeout');
      },
    );
  });
});

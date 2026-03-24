import { afterEach, describe, expect, it } from 'vitest';
import { startMcpServer } from '../../src/mcp/server.js';
import { resetRuntimeForTests } from '../../src/runtime/index.js';
import { mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const originalEnv = process.env;
const originalCwd = process.cwd();
let repoDir: string | null = null;

describe('task lifecycle contract', () => {
  afterEach(() => {
    resetRuntimeForTests();
    process.env = originalEnv;
    process.chdir(originalCwd);
    if (repoDir) {
      rmSync(repoDir, { recursive: true, force: true });
      repoDir = null;
    }
    for (const candidate of [
      '.nexus.mcp.contract.test.db',
      '.nexus.mcp.contract.test.db-shm',
      '.nexus.mcp.contract.test.db-wal',
    ]) {
      try {
        unlinkSync(candidate);
      } catch {
        // ignore cleanup errors
      }
    }
  });

  it('exposes MCP task tool contract with success and errors', async () => {
    repoDir = mkdtempSync(join(tmpdir(), 'nexuscli-mcp-contract-'));
    process.chdir(repoDir);
    writeFileSync(join(repoDir, 'README.md'), '# NexusCLI MCP contract test repo\n');
    execFileSync('git', ['init'], { cwd: repoDir, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.name', 'NexusCLI Test'], { cwd: repoDir, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.email', 'nexuscli@test.local'], { cwd: repoDir, stdio: 'ignore' });
    execFileSync('git', ['add', 'README.md'], { cwd: repoDir, stdio: 'ignore' });
    execFileSync('git', ['commit', '-m', 'chore: bootstrap test repo'], { cwd: repoDir, stdio: 'ignore' });

    process.env = {
      ...originalEnv,
      NODE_ENV: 'test',
      MCP_PORT: '6081',
      LOG_LEVEL: 'error',
      NEXUS_DB_PATH: join(repoDir, '.nexus.mcp.contract.test.db'),
    };

    const runtime = await import('../../src/runtime/index.js');
    const boot = runtime.getRuntime();
    boot.dbBootstrapService.init();
    boot.taskService.init();

    const handle = await startMcpServer();
    try {
      const createResponse = await fetch('http://127.0.0.1:6081/tools/call', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          tool: 'task_create',
          input: { type: 'feat', title: 'Ship MVP vertical slice' },
        }),
      });

      expect(createResponse.status).toBe(200);
      const createPayload = await createResponse.json();
      expect(createPayload).toMatchObject({
        id: expect.any(Number),
        title: 'Ship MVP vertical slice',
        type: 'feat',
        status: 'todo',
        created_at: expect.any(String),
      });

      const startResponse = await fetch('http://127.0.0.1:6081/tools/call', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          tool: 'task_start',
          input: { id: createPayload.id },
        }),
      });
      expect(startResponse.status).toBe(200);
      const startPayload = await startResponse.json();
      expect(startPayload).toMatchObject({
        id: createPayload.id,
        status: 'in_progress',
        updated_at: expect.any(String),
      });

      const addLogResponse = await fetch('http://127.0.0.1:6081/tools/call', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          tool: 'task_add_log',
          input: { id: createPayload.id, text: 'Working on acceptance criteria' },
        }),
      });

      expect(addLogResponse.status).toBe(200);
      const addLogPayload = await addLogResponse.json();
      expect(addLogPayload).toMatchObject({
        task_id: createPayload.id,
        text: 'Working on acceptance criteria',
        id: expect.any(Number),
        created_at: expect.any(String),
      });

      const listResponse = await fetch('http://127.0.0.1:6081/tools/call', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          tool: 'task_list_pending',
          input: {},
        }),
      });

      const listPayload = await listResponse.json();
      expect(listResponse.status).toBe(200);
      expect(listPayload).toMatchObject({
        items: expect.arrayContaining([
          expect.objectContaining({ id: createPayload.id, status: 'in_progress', created_at: expect.any(String) }),
        ]),
        next_cursor: null,
      });

      for (let index = 0; index < 3; index += 1) {
        const paginatedCreate = await fetch('http://127.0.0.1:6081/tools/call', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            tool: 'task_create',
            input: { type: 'chore', title: `Pagination seed ${index}` },
          }),
        });

        expect(paginatedCreate.status).toBe(200);
      }

      const paginatedFirst = await fetch('http://127.0.0.1:6081/tools/call', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          tool: 'task_list_pending',
          input: { limit: 2 },
        }),
      });

      expect(paginatedFirst.status).toBe(200);
      const paginatedFirstPayload = await paginatedFirst.json();
      expect(paginatedFirstPayload).toMatchObject({
        items: expect.any(Array),
      });
      expect(Array.isArray(paginatedFirstPayload.items)).toBe(true);
      expect(paginatedFirstPayload.items).toHaveLength(2);
      expect(typeof paginatedFirstPayload.next_cursor).toBe('string');

      const paginatedSecond = await fetch('http://127.0.0.1:6081/tools/call', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          tool: 'task_list_pending',
          input: { limit: 2, cursor: paginatedFirstPayload.next_cursor as string },
        }),
      });

      expect(paginatedSecond.status).toBe(200);
      const paginatedSecondPayload = await paginatedSecond.json();
      expect(paginatedSecondPayload).toMatchObject({
        items: expect.any(Array),
      });
      expect(Array.isArray(paginatedSecondPayload.items)).toBe(true);
      expect((paginatedSecondPayload.items as Array<unknown>).length).toBeGreaterThan(0);

      const paginatedIdsFirst = (paginatedFirstPayload.items as Array<{ id: number }>).map((task) => task.id);
      const paginatedIdsSecond = (paginatedSecondPayload.items as Array<{ id: number }>).map((task) => task.id);

      for (const id of paginatedIdsSecond) {
        expect(paginatedIdsFirst.includes(id)).toBe(false);
      }

      const invalidLimit = await fetch('http://127.0.0.1:6081/tools/call', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          tool: 'task_list_pending',
          input: { limit: 9999 },
        }),
      });
      expect(invalidLimit.status).toBe(400);
      const invalidLimitPayload = await invalidLimit.json();
      expect(invalidLimitPayload).toEqual(expect.objectContaining({ code: 'VALIDATION_ERROR', error: expect.any(String) }));

      const invalidCursor = await fetch('http://127.0.0.1:6081/tools/call', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          tool: 'task_list_pending',
          input: { cursor: 'not-a-number' },
        }),
      });
      expect(invalidCursor.status).toBe(400);
      const invalidCursorPayload = await invalidCursor.json();
      expect(invalidCursorPayload).toEqual(expect.objectContaining({ code: 'VALIDATION_ERROR', error: expect.any(String) }));

      const unknownCursor = await fetch('http://127.0.0.1:6081/tools/call', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          tool: 'task_list_pending',
          input: { cursor: '99999999' },
        }),
      });
      expect(unknownCursor.status).toBe(400);
      const unknownCursorPayload = await unknownCursor.json();
      expect(unknownCursorPayload).toEqual(expect.objectContaining({ code: 'VALIDATION_ERROR', error: expect.any(String) }));

      const dbCheckResponse = await fetch('http://127.0.0.1:6081/tools/call', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          tool: 'db_check',
          input: {},
        }),
      });

      expect(dbCheckResponse.status).toBe(200);
      const dbCheckPayload = await dbCheckResponse.json();
      expect(dbCheckPayload).toMatchObject({
        status: 'ready',
        schemaVersion: '0004',
      });

      const completeResponse = await fetch('http://127.0.0.1:6081/tools/call', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          tool: 'task_complete',
          input: { id: createPayload.id },
        }),
      });

      expect(completeResponse.status).toBe(200);
      const completePayload = await completeResponse.json();
      expect(completePayload).toMatchObject({
        task: {
          id: createPayload.id,
          status: 'done',
          commit_hash: expect.any(String),
          commit_message: expect.any(String),
          completed_at: expect.any(String),
        },
        commit: {
          hash: expect.any(String),
          message: expect.any(String),
        },
      });

      const alreadyCompleted = await fetch('http://127.0.0.1:6081/tools/call', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          tool: 'task_start',
          input: { id: createPayload.id },
        }),
      });

      expect(alreadyCompleted.status).toBe(400);
      const alreadyCompletedPayload = await alreadyCompleted.json();
      expect(alreadyCompletedPayload).toEqual(expect.objectContaining({ code: 'ALREADY_COMPLETED', error: expect.any(String) }));

      const deprecatedTaskIdStillSupported = await fetch('http://127.0.0.1:6081/tools/call', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          tool: 'task_start',
          input: { taskId: 999999 },
        }),
      });

      expect(deprecatedTaskIdStillSupported.status).toBe(400);
      const deprecatedTaskIdPayload = await deprecatedTaskIdStillSupported.json();
      expect(deprecatedTaskIdPayload).toEqual(expect.objectContaining({ code: 'TASK_NOT_FOUND', error: expect.any(String) }));

      const unknownTask = await fetch('http://127.0.0.1:6081/tools/call', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          tool: 'task_start',
          input: { id: 999999 },
        }),
      });

      const unknownPayload = await unknownTask.json();
      expect(unknownTask.status).toBe(400);
      expect(unknownPayload).toEqual(expect.objectContaining({ code: 'TASK_NOT_FOUND', error: expect.any(String) }));

      const invalidCreateType = await fetch('http://127.0.0.1:6081/tools/call', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          tool: 'task_create',
          input: { type: 'invalid', title: 'Should fail' },
        }),
      });

      expect(invalidCreateType.status).toBe(400);
      const invalidCreateTypePayload = await invalidCreateType.json();
      expect(invalidCreateTypePayload).toEqual(expect.objectContaining({ code: 'INVALID_TASK_TYPE', error: expect.any(String) }));

      const invalidCreateTitle = await fetch('http://127.0.0.1:6081/tools/call', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          tool: 'task_create',
          input: { type: 'feat', title: '   ' },
        }),
      });

      expect(invalidCreateTitle.status).toBe(400);
      const invalidCreateTitlePayload = await invalidCreateTitle.json();
      expect(invalidCreateTitlePayload).toEqual(expect.objectContaining({ code: 'TITLE_REQUIRED', error: expect.any(String) }));
    } finally {
      await handle.stop();
    }
  });
});

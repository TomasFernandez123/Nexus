import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { unlinkSync } from 'node:fs';
import { runCli } from '../../src/cli/main.js';
import { getRuntime, resetRuntimeForTests } from '../../src/runtime/index.js';
import { TaskService } from '../../src/tasks/service.js';
import { openDatabase, closeDatabase } from '../../src/db/sqlite.js';
import { TaskRepo } from '../../src/db/task-repo.js';
import { TaskLogRepo } from '../../src/db/task-log-repo.js';
import { LocalGitRunner, type GitCommand } from '../../src/git/runner.js';
import { DomainError } from '../../src/tasks/types.js';

const baseEnv = process.env;
const dbPath = '.nexus.integration.persistence.test.db';

const cleanupDbFiles = (path: string): void => {
  for (const candidate of [path, `${path}-shm`, `${path}-wal`]) {
    try {
      unlinkSync(candidate);
    } catch {
      // ignore cleanup errors
    }
  }
};

describe('task service integration', () => {
  beforeEach(() => {
    resetRuntimeForTests();
    process.env = {
      ...baseEnv,
      NODE_ENV: 'test',
      MCP_PORT: '6091',
      LOG_LEVEL: 'error',
      NEXUS_DB_PATH: dbPath,
    };
  });

  afterEach(() => {
    resetRuntimeForTests();
    process.env = baseEnv;
    vi.restoreAllMocks();
    cleanupDbFiles(dbPath);
  });

  it('persists pending tasks across runtime restart', () => {
    const runtimeA = getRuntime();
    runtimeA.taskService.init();

    const created = runtimeA.taskService.create({
      type: 'feat',
      title: 'Persist across restart',
    });

    resetRuntimeForTests();

    const runtimeB = getRuntime();
    runtimeB.taskService.init();

    const pending = runtimeB.taskService.listPending();
    expect(pending).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: created.id,
          title: created.title,
          state: 'pending',
        }),
      ]),
    );
  });

  it('keeps task identities and metadata stable across repeated init calls', () => {
    const db = openDatabase(dbPath);
    const service = new TaskService({
      db,
      taskRepo: new TaskRepo(db),
      taskLogRepo: new TaskLogRepo(db),
      gitRunner: new LocalGitRunner((args) => {
        if (args[0] === 'add' || args[0] === 'commit') return { ok: true, out: '' };
        if (args[0] === 'rev-parse') return { ok: true, out: 'deadbeef' };
        return { ok: false, message: `Unexpected command ${args.join(' ')}` };
      }),
    });

    try {
      service.init();

      const created = service.create({
        type: 'chore',
        title: 'Idempotent init stability check',
      });

      service.init();
      service.init();

      const pending = service.listPending();
      expect(pending).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: created.id,
            title: created.title,
            type: created.type,
            state: created.state,
            createdAt: created.createdAt,
            updatedAt: created.updatedAt,
            completedAt: null,
            commitHash: null,
            commitMessage: null,
          }),
        ]),
      );
    } finally {
      closeDatabase(db);
      cleanupDbFiles(dbPath);
    }
  });

  it('returns empty board payload with success exit code when board runs without init', () => {
    const err = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const out = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    const code = runCli(['board']);

    expect(code).toBe(0);
    expect(out).toHaveBeenCalledWith(expect.stringContaining('[]'));
    expect(err).not.toHaveBeenCalledWith(expect.stringContaining('"code":"DB_NOT_INITIALIZED"'));
  });

  it('transitions pending -> in_progress -> done with commit metadata on complete', () => {
    const runGitCalls: string[][] = [];
    const runGit: GitCommand = (args) => {
      runGitCalls.push(args);
      if (args[0] === 'add') return { ok: true, out: '' };
      if (args[0] === 'commit') return { ok: true, out: '' };
      if (args[0] === 'rev-parse') return { ok: true, out: 'abc123' };
      return { ok: false, message: `Unexpected command ${args.join(' ')}` };
    };

    const db = openDatabase(dbPath);
    const service = new TaskService({
      db,
      taskRepo: new TaskRepo(db),
      taskLogRepo: new TaskLogRepo(db),
      gitRunner: new LocalGitRunner(runGit),
    });

    try {
      service.init();

      const created = service.create({
        type: 'feat',
        title: 'Lifecycle integration proof',
      });
      expect(created.state).toBe('pending');

      const started = service.start(created.id);
      expect(started.state).toBe('in_progress');

      const result = service.complete(created.id);
      expect(result.task).toMatchObject({
        id: created.id,
        state: 'done',
        completedAt: expect.any(String),
        commitHash: 'abc123',
        commitMessage: `feat: Lifecycle integration proof (Closes #${created.id})`,
      });
      expect(result.commit).toMatchObject({
        hash: 'abc123',
        message: `feat: Lifecycle integration proof (Closes #${created.id})`,
      });

      expect(runGitCalls).toEqual([
        ['add', '-A'],
        ['commit', '-m', `feat: Lifecycle integration proof (Closes #${created.id})`],
        ['rev-parse', '--short', 'HEAD'],
      ]);
    } finally {
      closeDatabase(db);
    }
  });

  it('keeps task in_progress when git commit fails during complete', () => {
    const runGit: GitCommand = (args) => {
      if (args[0] === 'add') return { ok: true, out: '' };
      if (args[0] === 'commit') return { ok: false, message: 'forced failure from test' };
      return { ok: true, out: '' };
    };

    const db = openDatabase(dbPath);
    const service = new TaskService({
      db,
      taskRepo: new TaskRepo(db),
      taskLogRepo: new TaskLogRepo(db),
      gitRunner: new LocalGitRunner(runGit),
    });
    try {
      service.init();

      const created = service.create({
        type: 'feat',
        title: 'No persistence corruption on git failure',
      });

      service.start(created.id);

      try {
        service.complete(created.id);
        throw new Error('Expected complete to throw');
      } catch (error) {
        expect(error).toBeInstanceOf(DomainError);
        expect((error as DomainError).code).toBe('GIT_ERROR');
      }

      const pending = service.listPending();
      expect(pending).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: created.id,
            state: 'in_progress',
            completedAt: null,
            commitHash: null,
            commitMessage: null,
          }),
        ]),
      );
    } finally {
      closeDatabase(db);
    }
  });

  it('returns ALREADY_COMPLETED when completing an already done task', () => {
    const runGit: GitCommand = (args) => {
      if (args[0] === 'add') return { ok: true, out: '' };
      if (args[0] === 'commit') return { ok: true, out: '' };
      if (args[0] === 'rev-parse') return { ok: true, out: 'abc123' };
      return { ok: false, message: `Unexpected command ${args.join(' ')}` };
    };

    const db = openDatabase(dbPath);
    const service = new TaskService({
      db,
      taskRepo: new TaskRepo(db),
      taskLogRepo: new TaskLogRepo(db),
      gitRunner: new LocalGitRunner(runGit),
    });

    try {
      service.init();
      const created = service.create({ type: 'feat', title: 'Already completed check' });
      service.start(created.id);
      service.complete(created.id);

      try {
        service.complete(created.id);
        throw new Error('Expected second complete to throw');
      } catch (error) {
        expect(error).toBeInstanceOf(DomainError);
        expect((error as DomainError).code).toBe('ALREADY_COMPLETED');
      }
    } finally {
      closeDatabase(db);
    }
  });

  it('validates create errors with PRD canonical codes', () => {
    const runtime = getRuntime();
    runtime.taskService.init();

    const expectDomainCode = (fn: () => unknown, code: string): void => {
      try {
        fn();
        throw new Error('Expected function to throw DomainError');
      } catch (error) {
        expect(error).toBeInstanceOf(DomainError);
        expect((error as DomainError).code).toBe(code);
      }
    };

    expectDomainCode(() => runtime.taskService.create({ type: 'feat', title: '   ' }), 'TITLE_REQUIRED');
    expectDomainCode(
      () => runtime.taskService.create({ type: 'invalid' as never, title: 'Valid title' }),
      'INVALID_TASK_TYPE',
    );
  });
});

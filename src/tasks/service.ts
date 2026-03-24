import type { TaskLogRepo } from '../db/task-log-repo.js';
import type { TaskRepo } from '../db/task-repo.js';
import { bootstrapSchema } from '../db/schema.js';
import type { SqliteDb } from '../db/sqlite.js';
import { runInTransaction } from '../db/sqlite.js';
import type { GitRunner } from '../git/runner.js';
import { ensureTransition } from './lifecycle.js';
import {
  DomainError,
  TASK_TYPES,
  type GitCommitResult,
  type TaskEntity,
  type TaskLogEntity,
  type TaskType,
} from './types.js';

export interface TaskServiceDeps {
  db: SqliteDb;
  taskRepo: TaskRepo;
  taskLogRepo: TaskLogRepo;
  gitRunner: GitRunner;
  now?: () => string;
}

const defaultNow = (): string => new Date().toISOString();

export class TaskService {
  private initialized = false;

  constructor(private readonly deps: TaskServiceDeps) {}

  init(): void {
    bootstrapSchema(this.deps.db);
    this.initialized = true;
  }

  create(input: { title: string; description?: string; type: TaskType }): TaskEntity {
    this.ensureInitialized();

    if (!input.title || input.title.trim().length === 0) {
      throw new DomainError('TITLE_REQUIRED', 'Task title is required');
    }

    if (!TASK_TYPES.includes(input.type)) {
      throw new DomainError('INVALID_TASK_TYPE', `Invalid task type '${input.type}'.`, {
        allowed: TASK_TYPES,
      });
    }

    const now = (this.deps.now ?? defaultNow)();
    return this.deps.taskRepo.create({
      title: input.title.trim(),
      description: input.description?.trim() || undefined,
      type: input.type,
      now,
    });
  }

  listPending(): TaskEntity[] {
    this.ensureInitialized();
    return this.deps.taskRepo.listPending();
  }

  listPendingPage(input: { limit: number; cursor?: string | number }): {
    items: TaskEntity[];
    nextCursor: string | null;
  } {
    this.ensureInitialized();

    if (!Number.isInteger(input.limit) || input.limit <= 0) {
      throw new DomainError('VALIDATION_ERROR', 'limit must be a positive integer');
    }

    let cursorId: number | undefined;
    if (input.cursor !== undefined) {
      cursorId = Number(input.cursor);
      if (!Number.isInteger(cursorId) || cursorId <= 0) {
        throw new DomainError('VALIDATION_ERROR', 'cursor must be a positive integer');
      }

      const cursorTask = this.deps.taskRepo.getById(cursorId);
      if (!cursorTask) {
        throw new DomainError('VALIDATION_ERROR', `cursor '${cursorId}' not found`, { cursor: cursorId });
      }
    }

    return this.deps.taskRepo.listPendingPage({
      limit: input.limit,
      cursorId,
    });
  }

  start(taskId: number): TaskEntity {
    this.ensureInitialized();
    const task = this.requireTask(taskId);
    ensureTransition(task.state, 'in_progress');

    const now = (this.deps.now ?? defaultNow)();
    this.deps.taskRepo.updateState({ id: taskId, state: 'in_progress', now, completedAt: null });
    return this.requireTask(taskId);
  }

  addLog(taskId: number, text: string): TaskLogEntity {
    this.ensureInitialized();
    this.requireTask(taskId);

    if (!text || text.trim().length === 0) {
      throw new DomainError('VALIDATION_ERROR', 'Task log text is required');
    }

    const now = (this.deps.now ?? defaultNow)();
    return this.deps.taskLogRepo.append({ taskId, text: text.trim(), now });
  }

  complete(taskId: number): { task: TaskEntity; commit: GitCommitResult } {
    this.ensureInitialized();
    const task = this.requireTask(taskId);
    ensureTransition(task.state, 'done');

    const now = (this.deps.now ?? defaultNow)();

    return runInTransaction(this.deps.db, () => {
      const commit = this.deps.gitRunner.commitForTask({
        taskId,
        title: task.title,
        type: task.type,
      });

      this.deps.taskRepo.setCompletionCommit({
        id: taskId,
        hash: commit.hash,
        message: commit.message,
        now,
        completedAt: now,
      });

      return {
        task: this.requireTask(taskId),
        commit,
      };
    });
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new DomainError('DB_NOT_INITIALIZED', "Database is not initialized. Run 'init' first.");
    }
  }

  private requireTask(taskId: number): TaskEntity {
    const task = this.deps.taskRepo.getById(taskId);
    if (!task) {
      throw new DomainError('TASK_NOT_FOUND', `Task '${taskId}' not found`, { taskId });
    }
    return task;
  }
}

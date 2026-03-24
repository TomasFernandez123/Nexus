import type { TaskEntity, TaskState, TaskType } from '../tasks/types.js';
import type { SqliteDb } from './sqlite.js';

const LIST_PENDING_LIMIT = 1000;

export interface ListPendingPageInput {
  limit: number;
  cursorId?: number;
}

export interface ListPendingPageResult {
  items: TaskEntity[];
  nextCursor: string | null;
}

interface TaskRow {
  id: number;
  title: string;
  description: string | null;
  type: TaskType;
  state: TaskState;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  commit_hash: string | null;
  commit_message: string | null;
}

const mapTask = (row: TaskRow): TaskEntity => ({
  id: row.id,
  title: row.title,
  description: row.description,
  type: row.type,
  state: row.state,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  completedAt: row.completed_at,
  commitHash: row.commit_hash,
  commitMessage: row.commit_message,
});

const asRunResult = (db: SqliteDb, sql: string, ...params: unknown[]): { lastInsertRowid: bigint | number } =>
  db.prepare(sql).run(...params);

export class TaskRepo {
  constructor(private readonly db: SqliteDb) {}

  create(input: { title: string; description?: string; type: TaskType; now: string }): TaskEntity {
    const result = asRunResult(
      this.db,
      `INSERT INTO tasks(title, description, type, state, created_at, updated_at)
       VALUES (?, ?, ?, 'pending', ?, ?)`,
      input.title,
      input.description ?? null,
      input.type,
      input.now,
      input.now,
    );

    return this.getById(Number(result.lastInsertRowid)) as TaskEntity;
  }

  getById(id: number): TaskEntity | null {
    const row = this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as TaskRow | undefined;
    return row ? mapTask(row) : null;
  }

  listPending(): TaskEntity[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM tasks WHERE state IN ('pending', 'in_progress') ORDER BY created_at ASC, id ASC LIMIT ?",
      )
      .all(LIST_PENDING_LIMIT) as TaskRow[];
    return rows.map(mapTask);
  }

  listPendingPage(input: ListPendingPageInput): ListPendingPageResult {
    const fetchLimit = input.limit + 1;

    const rows = (input.cursorId === undefined
      ? this.db
          .prepare(
            "SELECT * FROM tasks WHERE state IN ('pending', 'in_progress') ORDER BY created_at ASC, id ASC LIMIT ?",
          )
          .all(fetchLimit)
      : this.db
          .prepare(
            `SELECT * FROM tasks
             WHERE state IN ('pending', 'in_progress')
               AND ((created_at > (SELECT created_at FROM tasks WHERE id = ?))
               OR (created_at = (SELECT created_at FROM tasks WHERE id = ?) AND id > ?))
             ORDER BY created_at ASC, id ASC
             LIMIT ?`,
          )
          .all(input.cursorId, input.cursorId, input.cursorId, fetchLimit)) as TaskRow[];

    const hasMore = rows.length > input.limit;
    const pageRows = hasMore ? rows.slice(0, input.limit) : rows;
    const last = pageRows.at(-1);

    return {
      items: pageRows.map(mapTask),
      nextCursor: hasMore && last ? String(last.id) : null,
    };
  }

  updateState(input: { id: number; state: TaskState; now: string; completedAt?: string | null }): void {
    asRunResult(
      this.db,
      'UPDATE tasks SET state = ?, updated_at = ?, completed_at = ? WHERE id = ?',
      input.state,
      input.now,
      input.completedAt ?? null,
      input.id,
    );
  }

  setCompletionCommit(input: { id: number; hash: string; message: string; now: string; completedAt: string }): void {
    asRunResult(
      this.db,
      `UPDATE tasks
       SET state = 'done', updated_at = ?, completed_at = ?, commit_hash = ?, commit_message = ?
       WHERE id = ?`,
      input.now,
      input.completedAt,
      input.hash,
      input.message,
      input.id,
    );
  }
}

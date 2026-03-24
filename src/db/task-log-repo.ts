import type { TaskLogEntity } from '../tasks/types.js';
import type { SqliteDb } from './sqlite.js';

interface TaskLogRow {
  id: number;
  task_id: number;
  text: string;
  created_at: string;
}

const mapTaskLog = (row: TaskLogRow): TaskLogEntity => ({
  id: row.id,
  taskId: row.task_id,
  text: row.text,
  createdAt: row.created_at,
});

export class TaskLogRepo {
  constructor(private readonly db: SqliteDb) {}

  append(input: { taskId: number; text: string; now: string }): TaskLogEntity {
    const result = this.db
      .prepare('INSERT INTO task_logs(task_id, text, created_at) VALUES (?, ?, ?)')
      .run(input.taskId, input.text, input.now);

    const row = this.db.prepare('SELECT * FROM task_logs WHERE id = ?').get(Number(result.lastInsertRowid)) as
      | TaskLogRow
      | undefined;

    if (!row) {
      throw new Error('Task log could not be loaded after insert');
    }

    return mapTaskLog(row);
  }

  listByTaskId(taskId: number): TaskLogEntity[] {
    const rows = this.db
      .prepare('SELECT * FROM task_logs WHERE task_id = ? ORDER BY created_at ASC, id ASC')
      .all(taskId) as TaskLogRow[];
    return rows.map(mapTaskLog);
  }
}

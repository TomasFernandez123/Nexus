import type { SqliteDb } from './sqlite.js';

const schemaStatements = [
  `
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    type TEXT NOT NULL CHECK(type IN ('feat', 'fix', 'chore', 'refactor', 'docs')),
    state TEXT NOT NULL CHECK(state IN ('pending', 'in_progress', 'done')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    completed_at TEXT,
    commit_hash TEXT,
    commit_message TEXT
  );
  `,
  `
  CREATE TABLE IF NOT EXISTS task_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL,
    text TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE
  );
  `,
  `
  CREATE INDEX IF NOT EXISTS idx_tasks_state_created_at
  ON tasks(state, created_at, id);
  `,
  `
  CREATE INDEX IF NOT EXISTS idx_task_logs_task_id_created_at
  ON task_logs(task_id, created_at, id);
  `,
];

export const bootstrapSchema = (db: SqliteDb): void => {
  for (const statement of schemaStatements) {
    db.exec(statement);
  }
};

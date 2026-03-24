import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { RuntimeConfig } from '../runtime/types.js';
import { DomainError, type DomainErrorCode } from '../tasks/types.js';
import { closeDatabase, openDatabase, type SqliteDb } from './sqlite.js';

interface DbConfig {
  dbPath: string;
}

interface AppliedMigrationRow {
  version: string;
}

interface BootstrapStatus {
  status: 'initialized' | 'already_initialized';
  dbPath: string;
  schemaVersion: string;
}

interface ReadinessStatus {
  status: 'ready';
  dbPath: string;
  schemaVersion: string;
}

interface MigrationUnit {
  version: string;
  sql: string;
}

const MIGRATIONS_TABLE = 'nexus_schema_migrations';

const baselineMigrations: MigrationUnit[] = [
  {
    version: '0001',
    sql: `
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
  },
  {
    version: '0002',
    sql: `
    CREATE TABLE IF NOT EXISTS task_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL,
      text TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE
    );
  `,
  },
  {
    version: '0003',
    sql: `
    CREATE INDEX IF NOT EXISTS idx_tasks_state_created_at
    ON tasks(state, created_at, id);
  `,
  },
  {
    version: '0004',
    sql: `
    CREATE INDEX IF NOT EXISTS idx_task_logs_task_id_created_at
    ON task_logs(task_id, created_at, id);
  `,
  },
];

const ensureMigrationTable = (db: SqliteDb): void => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
      version TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);
};

const parseSqliteMessage = (error: unknown): string =>
  error instanceof Error ? error.message : 'Unknown SQLite error';

const normalizeDbError = (code: DomainErrorCode, message: string, details?: Record<string, unknown>): DomainError =>
  new DomainError(code, message, details);

export const resolveDbConfig = (config: Pick<RuntimeConfig, 'NEXUS_DB_PATH'>): DbConfig => {
  const raw = config.NEXUS_DB_PATH?.trim() ?? '';

  if (!raw) {
    throw normalizeDbError('DB_CONFIG_INVALID', 'NEXUS_DB_PATH must not be empty', {
      key: 'NEXUS_DB_PATH',
    });
  }

  const dbPath = resolve(raw);
  const dir = dirname(dbPath);

  try {
    mkdirSync(dir, { recursive: true });
  } catch (error) {
    throw normalizeDbError('DB_CONFIG_INVALID', 'Cannot prepare DB directory', {
      dbPath,
      cause: parseSqliteMessage(error),
    });
  }

  return { dbPath };
};

export const createDbConnectionFactory = () => ({
  open: (dbPath: string): SqliteDb => {
    try {
      return openDatabase(dbPath);
    } catch (error) {
      throw normalizeDbError('DB_CONNECTION_FAILED', 'Failed to open SQLite database', {
        dbPath,
        cause: parseSqliteMessage(error),
      });
    }
  },
  close: (db: SqliteDb): void => {
    closeDatabase(db);
  },
});

export class MigrationRunner {
  constructor(private readonly migrations: MigrationUnit[] = baselineMigrations) {}

  runBaseline(db: SqliteDb): { schemaVersion: string; applied: number; alreadyApplied: boolean } {
    const ordered = [...this.migrations].sort((a, b) => a.version.localeCompare(b.version));
    ensureMigrationTable(db);

    const appliedVersions = new Set(
      (
        db.prepare(`SELECT version FROM ${MIGRATIONS_TABLE} ORDER BY version ASC`).all() as AppliedMigrationRow[]
      ).map((row) => row.version),
    );

    let appliedCount = 0;
    const now = new Date().toISOString();

    try {
      const tx = db.transaction(() => {
        for (const migration of ordered) {
          if (appliedVersions.has(migration.version)) continue;
          db.exec(migration.sql);
          db.prepare(`INSERT INTO ${MIGRATIONS_TABLE}(version, applied_at) VALUES (?, ?)`)
            .run(migration.version, now);
          appliedCount += 1;
        }
      });

      tx();
    } catch (error) {
      throw normalizeDbError('MIGRATION_FAILED', 'Migration execution failed', {
        cause: parseSqliteMessage(error),
      });
    }

    return {
      schemaVersion: ordered.at(-1)?.version ?? '0000',
      applied: appliedCount,
      alreadyApplied: appliedCount === 0,
    };
  }

  getReadiness(db: SqliteDb): ReadinessStatus {
    ensureMigrationTable(db);
    const row = db
      .prepare(`SELECT version FROM ${MIGRATIONS_TABLE} ORDER BY version DESC LIMIT 1`)
      .get() as AppliedMigrationRow | undefined;

    if (!row) {
      throw normalizeDbError('DB_NOT_INITIALIZED', 'Database is missing baseline migrations');
    }

    return {
      status: 'ready',
      dbPath: '',
      schemaVersion: row.version,
    };
  }
}

export class BootstrapService {
  private readonly resolver = resolveDbConfig;
  private readonly connectionFactory = createDbConnectionFactory();
  private readonly migrationRunner = new MigrationRunner();

  constructor(private readonly config: Pick<RuntimeConfig, 'NEXUS_DB_PATH'>) {}

  init(): BootstrapStatus {
    const { dbPath } = this.resolver(this.config);
    const db = this.connectionFactory.open(dbPath);

    try {
      const migrationResult = this.migrationRunner.runBaseline(db);
      return {
        status: migrationResult.alreadyApplied ? 'already_initialized' : 'initialized',
        dbPath,
        schemaVersion: migrationResult.schemaVersion,
      };
    } finally {
      this.connectionFactory.close(db);
    }
  }

  check(): ReadinessStatus {
    const { dbPath } = this.resolver(this.config);
    const db = this.connectionFactory.open(dbPath);

    try {
      const status = this.migrationRunner.getReadiness(db);
      return { ...status, dbPath };
    } finally {
      this.connectionFactory.close(db);
    }
  }
}

import Database from 'better-sqlite3';

export type SqliteDb = Database.Database;

export const openDatabase = (path: string): SqliteDb => {
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  return db;
};

export const closeDatabase = (db: SqliteDb): void => {
  db.close();
};

export const runInTransaction = <T>(db: SqliteDb, operation: () => T): T => {
  const transaction = db.transaction(operation);
  return transaction();
};

import { afterEach, describe, expect, it } from 'vitest';
import { unlinkSync } from 'node:fs';
import { BootstrapService, MigrationRunner, createDbConnectionFactory } from '../../src/db/bootstrap.js';
import { openDatabase } from '../../src/db/sqlite.js';

const cleanupDbFiles = (path: string): void => {
  for (const candidate of [path, `${path}-shm`, `${path}-wal`]) {
    try {
      unlinkSync(candidate);
    } catch {
      // ignore cleanup errors
    }
  }
};

describe('db bootstrap service', () => {
  const dbPath = '.nexus.bootstrap.service.test.db';

  afterEach(() => {
    cleanupDbFiles(dbPath);
  });

  it('initializes idempotently and reports deterministic schema version', () => {
    const service = new BootstrapService({ NEXUS_DB_PATH: dbPath });

    const first = service.init();
    const second = service.init();
    const check = service.check();

    expect(first).toEqual({
      status: 'initialized',
      dbPath: expect.stringContaining(dbPath),
      schemaVersion: '0004',
    });
    expect(second).toEqual({
      status: 'already_initialized',
      dbPath: expect.stringContaining(dbPath),
      schemaVersion: '0004',
    });
    expect(check).toEqual({
      status: 'ready',
      dbPath: expect.stringContaining(dbPath),
      schemaVersion: '0004',
    });
  });

  it('fails with DB_NOT_INITIALIZED when checking before init', () => {
    const service = new BootstrapService({ NEXUS_DB_PATH: dbPath });
    expect(() => service.check()).toThrowError(/Database is missing baseline migrations/);
    try {
      service.check();
    } catch (error) {
      expect(error).toMatchObject({ code: 'DB_NOT_INITIALIZED' });
    }
  });

  it('fails with DB_CONFIG_INVALID when NEXUS_DB_PATH is blank', () => {
    const service = new BootstrapService({ NEXUS_DB_PATH: '   ' });

    expect(() => service.init()).toThrowError(/NEXUS_DB_PATH must not be empty/);

    try {
      service.init();
    } catch (error) {
      expect(error).toMatchObject({ code: 'DB_CONFIG_INVALID' });
    }
  });

  it('applies migrations in version order and persists tracking metadata', () => {
    const db = openDatabase(dbPath);
    try {
      const runner = new MigrationRunner();
      const result = runner.runBaseline(db);

      const versions = db
        .prepare('SELECT version FROM nexus_schema_migrations ORDER BY version ASC')
        .all() as Array<{ version: string }>;

      expect(result.schemaVersion).toBe('0004');
      expect(versions.map((v) => v.version)).toEqual(['0001', '0002', '0003', '0004']);
    } finally {
      createDbConnectionFactory().close(db);
    }
  });

  it('keeps migration tracking unchanged when a migration fails mid-sequence', () => {
    const db = openDatabase(dbPath);
    const runner = new MigrationRunner([
      { version: '0001', sql: 'CREATE TABLE IF NOT EXISTS foo(id INTEGER PRIMARY KEY);' },
      { version: '0002', sql: 'THIS IS INVALID SQL;' },
      { version: '0003', sql: 'CREATE TABLE IF NOT EXISTS bar(id INTEGER PRIMARY KEY);' },
    ]);

    try {
      expect(() => runner.runBaseline(db)).toThrowError(/Migration execution failed/);

      const versions = db
        .prepare('SELECT version FROM nexus_schema_migrations ORDER BY version ASC')
        .all() as Array<{ version: string }>;

      expect(versions).toEqual([]);
    } finally {
      createDbConnectionFactory().close(db);
    }
  });
});

import { mkdtempSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export interface E2EFixture {
  readonly cliCommand: string;
  readonly cliBaseArgs: readonly string[];
  readonly cliCwd: string;
  readonly cliEnv: NodeJS.ProcessEnv;
  readonly usageMarker: string;
  readonly mcpPort: number;
  readonly healthUrl: string;
  readonly timeoutMs: number;
  readonly pollIntervalMs: number;
  readonly dbPath: string;
  readonly tempDir: string;
  readonly cleanup: () => void;
}

const toPositiveInt = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

export const createE2EFixture = (env: NodeJS.ProcessEnv = process.env): E2EFixture => {
  const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
  const tempDir = mkdtempSync(join(tmpdir(), 'nexuscli-e2e-'));
  const dbPath = resolve(tempDir, 'nexus.e2e.db');
  const mcpPort = toPositiveInt(env.MCP_PORT, 6061);
  const timeoutMs = toPositiveInt(env.SMOKE_TIMEOUT_MS, 5000);
  const pollIntervalMs = toPositiveInt(env.SMOKE_POLL_INTERVAL_MS, 150);

  spawnSync('git', ['init'], {
    cwd: tempDir,
    stdio: 'ignore',
  });

  return {
    cliCommand: process.execPath,
    cliBaseArgs: ['--import', 'tsx', resolve(projectRoot, 'src/cli/main.ts')],
    cliCwd: projectRoot,
    cliEnv: {
      ...env,
      NODE_ENV: env.NODE_ENV ?? 'test',
      MCP_PORT: String(mcpPort),
      LOG_LEVEL: env.LOG_LEVEL ?? 'error',
      NEXUS_DB_PATH: env.NEXUS_DB_PATH?.trim() ? env.NEXUS_DB_PATH : dbPath,
      GIT_DIR: resolve(tempDir, '.git'),
      GIT_WORK_TREE: tempDir,
      GIT_AUTHOR_NAME: env.GIT_AUTHOR_NAME ?? 'nexuscli-e2e',
      GIT_AUTHOR_EMAIL: env.GIT_AUTHOR_EMAIL ?? 'nexuscli-e2e@example.test',
      GIT_COMMITTER_NAME: env.GIT_COMMITTER_NAME ?? 'nexuscli-e2e',
      GIT_COMMITTER_EMAIL: env.GIT_COMMITTER_EMAIL ?? 'nexuscli-e2e@example.test',
    },
    usageMarker: 'Usage:',
    mcpPort,
    healthUrl: `http://127.0.0.1:${mcpPort}/health`,
    timeoutMs,
    pollIntervalMs,
    dbPath,
    tempDir,
    cleanup: () => rmSync(tempDir, { recursive: true, force: true }),
  };
};

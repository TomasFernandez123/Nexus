import type { RuntimeConfig } from './types.js';
import path from 'node:path';
import { createHash } from 'node:crypto';

const REQUIRED_KEYS = [] as const;

const VALID_NODE_ENVS: RuntimeConfig['NODE_ENV'][] = ['development', 'test', 'production'];
const VALID_LOG_LEVELS: RuntimeConfig['LOG_LEVEL'][] = ['debug', 'info', 'warn', 'error'];

export class RuntimeConfigError extends Error {
  constructor(public readonly missingKeys: string[], message?: string) {
    super(message ?? `Missing required runtime env vars: ${missingKeys.join(', ')}`);
    this.name = 'RuntimeConfigError';
  }
}

const parsePort = (value: string): number => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
    throw new Error(`Invalid MCP_PORT: '${value}'. Expected integer between 1 and 65535.`);
  }
  return parsed;
};

const DEFAULT_READ_TOOL_TIMEOUT_MS = 15000;

const parsePositiveIntWithFallback = (value: string | undefined, fallback: number): number => {
  if (!value || value.trim() === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid NEXUS_READ_TOOL_TIMEOUT_MS: '${value}'. Expected positive integer.`);
  }
  return parsed;
};

const safePathSegment = (value: string): string => value.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 48) || 'project';

export const deriveProjectNamespace = (cwd: string): string => {
  const normalized = path.resolve(cwd);
  const base = safePathSegment(path.basename(normalized));
  const hash = createHash('sha256').update(normalized).digest('hex').slice(0, 16);
  return `${base}-${hash}`;
};

export const resolveZeroConfigDbPath = (cwd: string, namespace: string): string => {
  const runtimeRoot = path.join(cwd, '.nexuscli');
  const dbRoot = path.join(runtimeRoot, 'db');
  return path.join(dbRoot, `${namespace}.sqlite`);
};

export const loadRuntimeConfigForRoot = (
  activeRoot: string,
  env: NodeJS.ProcessEnv = process.env,
): RuntimeConfig => {
  const missing = REQUIRED_KEYS.filter((key) => !env[key] || env[key]?.trim() === '');

  if (missing.length > 0) {
    throw new RuntimeConfigError([...missing]);
  }

  const NODE_ENV = (env.NODE_ENV?.trim() || 'development') as RuntimeConfig['NODE_ENV'];
  const LOG_LEVEL = (env.LOG_LEVEL?.trim() || 'info') as RuntimeConfig['LOG_LEVEL'];
  const rawPort = env.MCP_PORT?.trim();

  if (!VALID_NODE_ENVS.includes(NODE_ENV)) {
    throw new Error(`Invalid NODE_ENV: '${env.NODE_ENV}'. Allowed: ${VALID_NODE_ENVS.join(', ')}`);
  }

  if (!VALID_LOG_LEVELS.includes(LOG_LEVEL)) {
    throw new Error(`Invalid LOG_LEVEL: '${env.LOG_LEVEL}'. Allowed: ${VALID_LOG_LEVELS.join(', ')}`);
  }

  const effectiveCwd = path.resolve(activeRoot);
  const projectNamespace = deriveProjectNamespace(effectiveCwd);
  const dbPath = env.NEXUS_DB_PATH?.trim()
    ? env.NEXUS_DB_PATH
    : resolveZeroConfigDbPath(effectiveCwd, projectNamespace);
  const readToolTimeoutMs = parsePositiveIntWithFallback(env.NEXUS_READ_TOOL_TIMEOUT_MS?.trim(), DEFAULT_READ_TOOL_TIMEOUT_MS);

  return {
    NODE_ENV,
    MCP_PORT: rawPort ? parsePort(rawPort) : undefined,
    LOG_LEVEL,
    NEXUS_DB_PATH: dbPath,
    NEXUS_EFFECTIVE_CWD: effectiveCwd,
    NEXUS_PROJECT_NAMESPACE: projectNamespace,
    NEXUS_READ_TOOL_TIMEOUT_MS: readToolTimeoutMs,
  };
};

export const loadRuntimeConfig = (env: NodeJS.ProcessEnv = process.env): RuntimeConfig => {
  const rootFromEnv = env.NEXUS_CLIENT_CWD?.trim();
  const activeRoot = rootFromEnv ? rootFromEnv : process.cwd();
  return loadRuntimeConfigForRoot(activeRoot, env);
};

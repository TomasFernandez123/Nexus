import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { homedir } from 'node:os';

export interface SetupResult {
  status: 'configured' | 'already_configured';
  configPath: string;
  entry: Record<string, unknown>;
}

const NEXUS_MCP_ENTRY = {
  type: 'local',
  command: ['nexus', 'mcp', 'stdio'],
} as const;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const deepEqual = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((item, index) => deepEqual(item, b[index]));
  }

  if (isPlainObject(a) && isPlainObject(b)) {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    return keysA.every((key) => deepEqual(a[key], b[key]));
  }

  return false;
};

export const resolveOpencodeConfigPath = (): string =>
  path.join(homedir(), '.config', 'opencode', 'opencode.json');

export const setupOpencode = (configPath?: string): SetupResult => {
  const resolvedPath = configPath ?? resolveOpencodeConfigPath();

  let config: Record<string, unknown> = {};
  try {
    const raw = readFileSync(resolvedPath, 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (isPlainObject(parsed)) {
      config = parsed;
    }
  } catch {
    // File doesn't exist or is invalid — start fresh
  }

  if (!isPlainObject(config.mcp)) {
    config.mcp = {};
  }

  const mcp = config.mcp as Record<string, unknown>;
  const existing = mcp.nexuscli;

  if (isPlainObject(existing) && deepEqual(existing, NEXUS_MCP_ENTRY)) {
    return {
      status: 'already_configured',
      configPath: resolvedPath,
      entry: { ...NEXUS_MCP_ENTRY },
    };
  }

  mcp.nexuscli = { ...NEXUS_MCP_ENTRY };

  mkdirSync(path.dirname(resolvedPath), { recursive: true });
  writeFileSync(resolvedPath, JSON.stringify(config, null, 2) + '\n', 'utf8');

  return {
    status: 'configured',
    configPath: resolvedPath,
    entry: { ...NEXUS_MCP_ENTRY },
  };
};

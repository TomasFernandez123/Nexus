import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setupOpencode } from '../../src/cli/setup.js';

describe('setupOpencode', () => {
  const tempDirs: string[] = [];

  const createTempDir = (): string => {
    const dir = mkdtempSync(join(tmpdir(), 'nexus-setup-'));
    tempDirs.push(dir);
    return dir;
  };

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // ignore cleanup errors
      }
    }
  });

  it('creates config file when it does not exist', () => {
    const dir = createTempDir();
    const configPath = join(dir, 'opencode', 'opencode.json');

    const result = setupOpencode(configPath);

    expect(result.status).toBe('configured');
    expect(result.configPath).toBe(configPath);
    expect(result.entry).toEqual({
      type: 'local',
      command: ['nexus', 'mcp', 'stdio'],
    });

    const written = JSON.parse(readFileSync(configPath, 'utf8')) as Record<string, unknown>;
    expect(written).toEqual({
      mcp: {
        nexuscli: {
          type: 'local',
          command: ['nexus', 'mcp', 'stdio'],
        },
      },
    });
  });

  it('preserves existing config keys when adding nexuscli entry', () => {
    const dir = createTempDir();
    const configPath = join(dir, 'opencode.json');
    const existingConfig = {
      provider: { google: { models: {} } },
      mcp: {
        context7: { enabled: true, type: 'remote', url: 'https://mcp.context7.com/mcp' },
      },
    };

    writeFileSync(configPath, JSON.stringify(existingConfig), 'utf8');

    const result = setupOpencode(configPath);

    expect(result.status).toBe('configured');
    const written = JSON.parse(readFileSync(configPath, 'utf8')) as Record<string, unknown>;
    expect(written).toMatchObject({
      provider: { google: { models: {} } },
      mcp: {
        context7: { enabled: true, type: 'remote', url: 'https://mcp.context7.com/mcp' },
        nexuscli: { type: 'local', command: ['nexus', 'mcp', 'stdio'] },
      },
    });
  });

  it('overwrites stale nexuscli entry but keeps other MCPs', () => {
    const dir = createTempDir();
    const configPath = join(dir, 'opencode.json');
    const existingConfig = {
      mcp: {
        engram: { command: ['engram', 'mcp'], enabled: true, type: 'local' },
        nexuscli: {
          type: 'local',
          command: [
            'env', 'NODE_ENV=development', 'MCP_PORT=6061',
            'npm', '--prefix', '/old/path', 'run', 'dev:cli', '--', 'mcp', 'stdio',
          ],
        },
      },
    };

    writeFileSync(configPath, JSON.stringify(existingConfig), 'utf8');

    const result = setupOpencode(configPath);

    expect(result.status).toBe('configured');
    const written = JSON.parse(readFileSync(configPath, 'utf8')) as Record<string, unknown>;
    const mcp = written.mcp as Record<string, unknown>;
    expect(mcp.engram).toEqual({ command: ['engram', 'mcp'], enabled: true, type: 'local' });
    expect(mcp.nexuscli).toEqual({ type: 'local', command: ['nexus', 'mcp', 'stdio'] });
  });

  it('returns already_configured when entry matches', () => {
    const dir = createTempDir();
    const configPath = join(dir, 'opencode.json');
    const existingConfig = {
      mcp: {
        nexuscli: { type: 'local', command: ['nexus', 'mcp', 'stdio'] },
      },
    };

    writeFileSync(configPath, JSON.stringify(existingConfig), 'utf8');

    const result = setupOpencode(configPath);

    expect(result.status).toBe('already_configured');
  });

  it('handles malformed JSON by creating fresh config', () => {
    const dir = createTempDir();
    const configPath = join(dir, 'opencode.json');
    writeFileSync(configPath, '{ broken json !@#$', 'utf8');

    const result = setupOpencode(configPath);

    expect(result.status).toBe('configured');
    const written = JSON.parse(readFileSync(configPath, 'utf8')) as Record<string, unknown>;
    expect(written).toEqual({
      mcp: {
        nexuscli: { type: 'local', command: ['nexus', 'mcp', 'stdio'] },
      },
    });
  });

  it('creates parent directories when they do not exist', () => {
    const dir = createTempDir();
    const configPath = join(dir, 'nested', 'deep', 'opencode.json');

    const result = setupOpencode(configPath);

    expect(result.status).toBe('configured');
    const written = JSON.parse(readFileSync(configPath, 'utf8')) as Record<string, unknown>;
    expect(written).toMatchObject({
      mcp: { nexuscli: { type: 'local', command: ['nexus', 'mcp', 'stdio'] } },
    });
  });
});

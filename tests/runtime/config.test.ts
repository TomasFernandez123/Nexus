import { describe, expect, it } from 'vitest';
import { loadRuntimeConfig } from '../../src/runtime/config.js';
import path from 'node:path';

describe('runtime config', () => {
  it('loads valid env values', () => {
    const config = loadRuntimeConfig({
      NODE_ENV: 'development',
      MCP_PORT: '8765',
      LOG_LEVEL: 'info',
    });

    expect(config.NODE_ENV).toBe('development');
    expect(config.MCP_PORT).toBe(8765);
    expect(config.LOG_LEVEL).toBe('info');
    expect(config.NEXUS_DB_PATH).toContain('.nexuscli/db/');
    expect(config.NEXUS_EFFECTIVE_CWD).toBe(path.resolve(process.cwd()));
    expect(config.NEXUS_PROJECT_NAMESPACE).toMatch(/^.+-[a-f0-9]{16}$/);
    expect(config.NEXUS_READ_TOOL_TIMEOUT_MS).toBe(15000);
  });

  it('accepts custom NEXUS_DB_PATH when provided', () => {
    const config = loadRuntimeConfig({
      NODE_ENV: 'test',
      MCP_PORT: '9000',
      LOG_LEVEL: 'error',
      NEXUS_DB_PATH: '.tmp/custom.db',
    });

    expect(config.NEXUS_DB_PATH).toBe('.tmp/custom.db');
  });

  it('derives config from NEXUS_CLIENT_CWD for zero-config multi-project isolation', () => {
    const projectACwd = '/tmp/nexus-project-a';
    const projectBCwd = '/tmp/nexus-project-b';

    const projectAConfig = loadRuntimeConfig({
      NODE_ENV: 'test',
      MCP_PORT: '9001',
      LOG_LEVEL: 'error',
      NEXUS_CLIENT_CWD: projectACwd,
    });

    const projectBConfig = loadRuntimeConfig({
      NODE_ENV: 'test',
      MCP_PORT: '9002',
      LOG_LEVEL: 'error',
      NEXUS_CLIENT_CWD: projectBCwd,
    });

    expect(projectAConfig.NEXUS_EFFECTIVE_CWD).toBe(path.resolve(projectACwd));
    expect(projectBConfig.NEXUS_EFFECTIVE_CWD).toBe(path.resolve(projectBCwd));
    expect(projectAConfig.NEXUS_PROJECT_NAMESPACE).not.toBe(projectBConfig.NEXUS_PROJECT_NAMESPACE);
    expect(projectAConfig.NEXUS_DB_PATH).not.toBe(projectBConfig.NEXUS_DB_PATH);
  });

  it('fails on invalid read tool timeout', () => {
    expect(() =>
      loadRuntimeConfig({
        NODE_ENV: 'test',
        MCP_PORT: '8765',
        LOG_LEVEL: 'info',
        NEXUS_READ_TOOL_TIMEOUT_MS: '0',
      }),
    ).toThrowError(/Invalid NEXUS_READ_TOOL_TIMEOUT_MS/);
  });

  it('uses defaults when optional env keys are missing', () => {
    const config = loadRuntimeConfig({
      NODE_ENV: 'development',
    });

    expect(config.NODE_ENV).toBe('development');
    expect(config.LOG_LEVEL).toBe('info');
    expect(config.MCP_PORT).toBeUndefined();
  });

  it('fails on invalid MCP_PORT type/range', () => {
    expect(() =>
      loadRuntimeConfig({
        NODE_ENV: 'development',
        MCP_PORT: 'not-a-number',
        LOG_LEVEL: 'info',
      }),
    ).toThrowError(/Invalid MCP_PORT/);
  });
});

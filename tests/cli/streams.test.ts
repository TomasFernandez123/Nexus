import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runCli } from '../../src/cli/main.js';
import { resetRuntimeForTests } from '../../src/runtime/index.js';
import { unlinkSync } from 'node:fs';

describe('cli stream contracts', () => {
  const previousEnv = process.env;

  beforeEach(() => {
    resetRuntimeForTests();
    process.env = {
      ...previousEnv,
      NODE_ENV: 'test',
      MCP_PORT: '4581',
      LOG_LEVEL: 'error',
      NEXUS_DB_PATH: '.nexus.cli.streams.test.db',
    };
  });

  afterEach(() => {
    resetRuntimeForTests();
    process.env = previousEnv;
    vi.restoreAllMocks();

    try {
      unlinkSync('.nexus.cli.streams.test.db');
    } catch {
      // ignore cleanup errors
    }
  });

  it('writes successful payloads to stdout and keeps stderr clean', () => {
    const out = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const err = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    const code = runCli(['--help']);

    expect(code).toBe(0);
    expect(out).toHaveBeenCalled();
    expect(err).not.toHaveBeenCalled();
  });

  it('writes terminal failures to stderr and keeps stdout free from success payloads', () => {
    const out = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const err = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    const code = runCli(['definitely-unknown']);

    expect(code).toBe(64);
    expect(err).toHaveBeenCalledWith(expect.stringContaining('Unknown command'));
    expect(out).not.toHaveBeenCalled();
  });
});

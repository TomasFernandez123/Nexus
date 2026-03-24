import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runCli } from '../../src/cli/main.js';
import { resetRuntimeForTests } from '../../src/runtime/index.js';
import { unlinkSync } from 'node:fs';

describe('cli main', () => {
  const previousEnv = process.env;

  beforeEach(() => {
    resetRuntimeForTests();
    process.env = {
      ...previousEnv,
      NODE_ENV: 'test',
      MCP_PORT: '4567',
      LOG_LEVEL: 'error',
      NEXUS_DB_PATH: '.nexus.cli.test.db',
    };
  });

  afterEach(() => {
    resetRuntimeForTests();
    process.env = previousEnv;
    vi.restoreAllMocks();

    try {
      unlinkSync('.nexus.cli.test.db');
    } catch {
      // ignore cleanup errors
    }
  });

  it('returns 0 and prints help for --help', () => {
    const out = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    const code = runCli(['--help']);

    expect(code).toBe(0);
    expect(out).toHaveBeenCalled();
  });

  it('returns non-zero for unknown flags', () => {
    const err = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    const code = runCli(['--unsupported']);

    expect(code).toBe(64);
    expect(err).toHaveBeenCalledWith(expect.stringContaining("Unknown command '--unsupported'."));
    expect(err).toHaveBeenCalledWith(expect.stringContaining("Use 'nexuscli --help'."));
  });

  it('returns canonical validation error for unsupported mcp mode', () => {
    const err = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    const code = runCli(['mcp', 'http']);

    expect(code).toBe(65);
    expect(err).toHaveBeenCalledWith(expect.stringContaining('"code":"VALIDATION_ERROR"'));
    expect(err).toHaveBeenCalledWith(expect.stringContaining("Unsupported MCP mode 'http'. Expected 'stdio'. Hint:"));
  });

  it('prints subcommand help with command-specific usage', () => {
    const out = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    const code = runCli(['add', '--help']);

    expect(code).toBe(0);
    expect(out).toHaveBeenCalledWith(expect.stringContaining('Usage: nexuscli add <type> <title>'));
    expect(out).toHaveBeenCalledWith(expect.stringContaining('feat|fix|chore|refactor|docs'));
  });

  it('supports init/add/board happy path', () => {
    const out = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    expect(runCli(['init'])).toBe(0);
    expect(runCli(['add', 'feat', 'Create', 'runtime', 'wiring'])).toBe(0);
    expect(runCli(['board'])).toBe(0);

    expect(out).toHaveBeenCalled();
  });

  it('supports check after init with readiness payload', () => {
    const out = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    expect(runCli(['init'])).toBe(0);
    expect(runCli(['check'])).toBe(0);

    const checkOutput = out.mock.calls.at(-1)?.[0];
    expect(checkOutput).toContain('"status": "ready"');
    expect(checkOutput).toContain('"schemaVersion": "0004"');
  });

  it('returns domain errors for complete when task is missing', () => {
    const err = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    expect(runCli(['init'])).toBe(0);
    const code = runCli(['complete', '999']);

    expect(code).toBe(1);
    expect(err).toHaveBeenCalledWith(expect.stringContaining('"code":"TASK_NOT_FOUND"'));
    expect(err).toHaveBeenCalledWith(expect.stringContaining('"error":"Task \'999\' not found"'));
  });

  it('returns validation-category exit code for invalid option value', () => {
    const err = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    const code = runCli(['complete', 'zero']);

    expect(code).toBe(65);
    expect(err).toHaveBeenCalledWith(expect.stringContaining('"code":"VALIDATION_ERROR"'));
    expect(err).toHaveBeenCalledWith(expect.stringContaining('Hint: use \'nexuscli complete <id>\''));
  });

  it('returns usage exit code for unknown subcommand help request', () => {
    const err = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    const code = runCli(['unknown', '--help']);

    expect(code).toBe(64);
    expect(err).toHaveBeenCalledWith(expect.stringContaining("Unknown command 'unknown'."));
  });

  it('prints canonical PRD task contract on add and board', () => {
    const out = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    expect(runCli(['init'])).toBe(0);
    expect(runCli(['add', 'feat', 'Canonical', 'shape', 'check'])).toBe(0);
    expect(runCli(['board'])).toBe(0);

    const addPayload = JSON.parse(String(out.mock.calls[1]?.[0] ?? '{}')) as Record<string, unknown>;
    expect(addPayload).toMatchObject({
      id: expect.any(Number),
      type: 'feat',
      title: 'Canonical shape check',
      status: 'todo',
      created_at: expect.any(String),
    });

    const boardPayload = JSON.parse(String(out.mock.calls[2]?.[0] ?? '[]')) as Array<Record<string, unknown>>;
    expect(Array.isArray(boardPayload)).toBe(true);
    expect(boardPayload).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: addPayload.id, status: 'todo', created_at: expect.any(String) }),
      ]),
    );
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runCli } from '../../src/cli/main.js';
import { resetRuntimeForTests } from '../../src/runtime/index.js';
import { unlinkSync } from 'node:fs';
import type { LifecyclePhase } from '../../src/runtime/index.js';

describe('cli lifecycle phases', () => {
  const previousEnv = process.env;

  beforeEach(() => {
    resetRuntimeForTests();
    process.env = {
      ...previousEnv,
      NODE_ENV: 'test',
      MCP_PORT: '4582',
      LOG_LEVEL: 'error',
      NEXUS_DB_PATH: '.nexus.cli.lifecycle.test.db',
    };
  });

  afterEach(() => {
    resetRuntimeForTests();
    process.env = previousEnv;
    vi.restoreAllMocks();

    try {
      unlinkSync('.nexus.cli.lifecycle.test.db');
    } catch {
      // ignore cleanup errors
    }
  });

  it('transitions startup -> running -> shutdown -> terminated on success', () => {
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const phases: LifecyclePhase[] = [];

    const code = runCli(['--help'], {
      onLifecyclePhaseChange: (phase) => phases.push(phase),
    });

    expect(code).toBe(0);
    expect(phases).toEqual(['running', 'shutdown', 'terminated']);
  });

  it('transitions startup -> running -> shutdown -> terminated on terminal usage error', () => {
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const phases: LifecyclePhase[] = [];

    const code = runCli(['unknown-command'], {
      onLifecyclePhaseChange: (phase) => phases.push(phase),
    });

    expect(code).toBe(64);
    expect(phases).toEqual(['running', 'shutdown', 'terminated']);
  });

  it('transitions startup -> shutdown -> terminated on startup failure before running', () => {
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const phases: LifecyclePhase[] = [];

    process.env = {
      ...previousEnv,
      NODE_ENV: 'test',
    };

    const code = runCli(['check'], {
      onLifecyclePhaseChange: (phase) => phases.push(phase),
    });

    expect(code).toBe(70);
    expect(phases).toEqual(['shutdown', 'terminated']);
  });

  it('transitions startup -> running -> shutdown -> terminated on running failure', () => {
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const phases: LifecyclePhase[] = [];

    const code = runCli(['mcp', 'http'], {
      onLifecyclePhaseChange: (phase) => phases.push(phase),
    });

    expect(code).toBe(65);
    expect(phases).toEqual(['running', 'shutdown', 'terminated']);
  });
});

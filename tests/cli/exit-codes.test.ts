import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runCli } from '../../src/cli/main.js';
import { resetRuntimeForTests } from '../../src/runtime/index.js';
import { resolveTerminalDecision } from '../../src/runtime/index.js';
import { unlinkSync } from 'node:fs';
import type { LifecyclePhase } from '../../src/runtime/index.js';

describe('cli exit code mapping', () => {
  const previousEnv = process.env;

  beforeEach(() => {
    resetRuntimeForTests();
    process.env = {
      ...previousEnv,
      NODE_ENV: 'test',
      MCP_PORT: '4571',
      LOG_LEVEL: 'error',
      NEXUS_DB_PATH: '.nexus.cli.exit-codes.test.db',
    };
  });

  afterEach(() => {
    resetRuntimeForTests();
    process.env = previousEnv;
    vi.restoreAllMocks();

    try {
      unlinkSync('.nexus.cli.exit-codes.test.db');
    } catch {
      // ignore cleanup errors
    }
  });

  it('returns success exit code for happy path', () => {
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    const code = runCli(['--help']);

    expect(code).toBe(0);
  });

  it('returns usage exit code for unknown command', () => {
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    const code = runCli(['definitely-unknown']);

    expect(code).toBe(64);
  });

  it('returns validation exit code for invalid option/input value', () => {
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    const code = runCli(['complete', 'NaN']);

    expect(code).toBe(65);
  });

  it('returns infrastructure exit code for startup/runtime bootstrap failure', () => {
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    process.env = {
      ...previousEnv,
      NODE_ENV: 'test',
    };

    const code = runCli(['check']);

    expect(code).toBe(70);
  });

  it('returns domain exit code for domain terminal errors', () => {
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    runCli(['init']);
    const code = runCli(['complete', '999']);

    expect(code).toBe(1);
  });

  it('keeps signal policy stable at exit code 130', () => {
    const decision = resolveTerminalDecision({ signal: 'SIGINT' });
    expect(decision.exitCode).toBe(130);
  });

  it('emits deterministic startup -> running -> shutdown -> terminated phases for nominal flow', () => {
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const phases: LifecyclePhase[] = [];

    const code = runCli(['--help'], {
      onLifecyclePhaseChange: (phase) => phases.push(phase),
    });

    expect(code).toBe(0);
    expect(phases).toEqual(['running', 'shutdown', 'terminated']);
  });

  it('emits deterministic shutdown -> terminated tail for terminal error flow', () => {
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const phases: LifecyclePhase[] = [];

    const code = runCli(['complete', 'invalid-id'], {
      onLifecyclePhaseChange: (phase) => phases.push(phase),
    });

    expect(code).toBe(65);
    expect(phases.slice(-2)).toEqual(['shutdown', 'terminated']);
  });
});

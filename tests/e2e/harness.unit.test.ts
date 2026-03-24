import { PassThrough } from 'node:stream';
import { EventEmitter } from 'node:events';
import { existsSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createE2EFixture } from './fixtures/index.js';
import { E2EHarnessError, executeCliCommand, pollHealth } from './harness.js';

interface MockChildProcess extends EventEmitter {
  stdout: PassThrough;
  stderr: PassThrough;
  pid: number;
  killed: boolean;
  exitCode: number | null;
  signalCode: NodeJS.Signals | null;
  kill: (signal?: NodeJS.Signals) => boolean;
}

const createMockChild = (): MockChildProcess => {
  const child = new EventEmitter() as MockChildProcess;
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.pid = 4321;
  child.killed = false;
  child.exitCode = null;
  child.signalCode = null;
  child.kill = (signal?: NodeJS.Signals) => {
    child.killed = true;
    child.signalCode = signal ?? 'SIGTERM';
    setTimeout(() => {
      child.exitCode = null;
      child.emit('exit', null, child.signalCode);
    }, 0);
    return true;
  };
  return child;
};

describe('e2e harness pollHealth utility', () => {
  it('returns once health responds with HTTP 200', async () => {
    const fixture = createE2EFixture({
      NODE_ENV: 'test',
      MCP_PORT: '6120',
      LOG_LEVEL: 'error',
      SMOKE_TIMEOUT_MS: '200',
      SMOKE_POLL_INTERVAL_MS: '10',
    });

    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce({ status: 503 } as Response)
      .mockResolvedValueOnce({ status: 200 } as Response);

    try {
      await expect(
        pollHealth(fixture, {
          fetchImpl,
          sleep: async () => undefined,
        }),
      ).resolves.toBeUndefined();

      expect(fetchImpl).toHaveBeenCalledTimes(2);
    } finally {
      fixture.cleanup();
    }
  });

  it('fails deterministically with timeout semantics when health never gets ready', async () => {
    const fixture = createE2EFixture({
      NODE_ENV: 'test',
      MCP_PORT: '6121',
      LOG_LEVEL: 'error',
      SMOKE_TIMEOUT_MS: '25',
      SMOKE_POLL_INTERVAL_MS: '5',
    });

    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(new Error('connection refused'));

    try {
      await expect(
        pollHealth(fixture, {
          fetchImpl,
          now: (() => {
            let tick = 0;
            return () => {
              tick += 10;
              return tick;
            };
          })(),
          sleep: async () => undefined,
        }),
      ).rejects.toMatchObject({ name: 'AbortError' });
    } finally {
      fixture.cleanup();
    }
  });
});

describe('e2e harness executeCliCommand utility', () => {
  it('returns canonical cli execution result with stdout/stderr/code/signal', async () => {
    const fixture = createE2EFixture({
      ...process.env,
      NODE_ENV: 'test',
      MCP_PORT: '6122',
      LOG_LEVEL: 'error',
      SMOKE_TIMEOUT_MS: '200',
    });

    const child = createMockChild();
    const spawnImpl = vi.fn(() => {
      setTimeout(() => {
        child.stdout.write('ok-out');
        child.stderr.write('warn-err');
        child.exitCode = 0;
        child.emit('exit', 0, null);
      }, 0);
      return child as never;
    });

    try {
      await expect(executeCliCommand('check', [], { fixture }, { spawnImpl })).resolves.toEqual({
        code: 0,
        signal: null,
        stdout: 'ok-out',
        stderr: 'warn-err',
      });
      expect(spawnImpl).toHaveBeenCalledTimes(1);
    } finally {
      fixture.cleanup();
    }
  });

  it('enforces timeout deterministically and kills subprocess', async () => {
    const fixture = createE2EFixture({
      ...process.env,
      NODE_ENV: 'test',
      MCP_PORT: '6123',
      LOG_LEVEL: 'error',
      SMOKE_TIMEOUT_MS: '5',
    });

    const child = createMockChild();
    const killSpy = vi.spyOn(child, 'kill');
    const spawnImpl = vi.fn(() => child as never);

    try {
      const result = await executeCliCommand('board', [], { fixture, timeoutMs: 5 }, { spawnImpl });
      expect(result.code).toBeNull();
      expect(result.signal).toBe('SIGTERM');
      expect(killSpy).toHaveBeenCalledTimes(1);
      expect(killSpy).toHaveBeenCalledWith('SIGTERM');
    } finally {
      fixture.cleanup();
    }
  });
});

describe('e2e harness diagnostics contract', () => {
  it('formats step, reason and process state in errors', () => {
    const error = new E2EHarnessError({
      step: 'mcp-health',
      reason: 'MCP healthcheck timeout after 25ms',
      processState: {
        pid: 123,
        exitCode: null,
        signalCode: null,
        killed: false,
        stdoutTail: '',
        stderrTail: 'connection refused',
      },
    });

    expect(error.message).toContain('[mcp-health] MCP healthcheck timeout after 25ms');
    expect(error.diagnostics.step).toBe('mcp-health');
    expect(error.diagnostics.reason).toContain('timeout');
    expect(error.diagnostics.processState.stderrTail).toContain('connection refused');
  });
});

describe('e2e fixture isolation and cleanup contract', () => {
  it('creates isolated DB/temp paths per fixture and removes both on cleanup', () => {
    const fixtureA = createE2EFixture({
      ...process.env,
      NODE_ENV: 'test',
      MCP_PORT: '6124',
      LOG_LEVEL: 'error',
    });

    const fixtureB = createE2EFixture({
      ...process.env,
      NODE_ENV: 'test',
      MCP_PORT: '6125',
      LOG_LEVEL: 'error',
    });

    expect(fixtureA.tempDir).not.toBe(fixtureB.tempDir);
    expect(fixtureA.dbPath).not.toBe(fixtureB.dbPath);

    expect(existsSync(fixtureA.tempDir)).toBe(true);
    expect(existsSync(fixtureB.tempDir)).toBe(true);

    fixtureA.cleanup();
    fixtureB.cleanup();

    expect(existsSync(fixtureA.tempDir)).toBe(false);
    expect(existsSync(fixtureB.tempDir)).toBe(false);
  });
});

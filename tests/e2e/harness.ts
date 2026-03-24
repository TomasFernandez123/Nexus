import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { once } from 'node:events';
import { startMcpServer, type MpcServerHandle } from '../../src/mcp/server.js';
import { createE2EFixture, type E2EFixture } from './fixtures/index.js';

export interface E2EDiagnostics {
  readonly step: 'cli-help' | 'mcp-health' | 'teardown' | 'cli-exec';
  readonly reason: string;
  readonly processState: {
    readonly pid: number | null;
    readonly exitCode: number | null;
    readonly signalCode: NodeJS.Signals | null;
    readonly killed: boolean;
    readonly stdoutTail: string;
    readonly stderrTail: string;
  };
}

export class E2EHarnessError extends Error {
  constructor(public readonly diagnostics: E2EDiagnostics) {
    super(`[${diagnostics.step}] ${diagnostics.reason}`);
    this.name = 'E2EHarnessError';
  }
}

const TAIL_LIMIT = 1200;

const pushTail = (current: string, chunk: string): string => {
  const next = `${current}${chunk}`;
  return next.length > TAIL_LIMIT ? next.slice(-TAIL_LIMIT) : next;
};

const timeoutError = (ms: number): Error => {
  const error = new Error(`Timeout after ${ms}ms`);
  error.name = 'AbortError';
  return error;
};

const sleep = async (ms: number): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, ms));
};

export interface PollHealthDeps {
  readonly fetchImpl: typeof fetch;
  readonly now?: () => number;
  readonly sleep?: (ms: number) => Promise<void>;
}

const defaultPollDeps: PollHealthDeps = {
  fetchImpl: fetch,
};

export interface HarnessDeps {
  readonly spawnImpl?: typeof spawn;
  readonly startServer?: typeof startMcpServer;
  readonly pollDeps?: PollHealthDeps;
}

export interface CliExecResult {
  readonly code: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly stdout: string;
  readonly stderr: string;
}

export interface CliExecOptions {
  readonly fixture?: E2EFixture;
  readonly env?: NodeJS.ProcessEnv;
  readonly timeoutMs?: number;
  readonly cwd?: string;
}

const defaultDeps: Required<HarnessDeps> = {
  spawnImpl: spawn,
  startServer: startMcpServer,
  pollDeps: defaultPollDeps,
};

export const executeCliCommand = async (
  command: string,
  args: readonly string[] = [],
  options: CliExecOptions = {},
  deps: HarnessDeps = defaultDeps,
): Promise<CliExecResult> => {
  const fixture = options.fixture ?? createE2EFixture();
  const spawnImpl = deps.spawnImpl ?? defaultDeps.spawnImpl;
  const cliEnv: NodeJS.ProcessEnv = {
    ...fixture.cliEnv,
    ...(options.env ?? {}),
  };
  const timeoutMs = options.timeoutMs ?? fixture.timeoutMs;
  const cwd = options.cwd ?? fixture.cliCwd;

  const child = spawnImpl(
    fixture.cliCommand,
    [...fixture.cliBaseArgs, command, ...args],
    {
      env: cliEnv,
      cwd,
      stdio: 'pipe',
    },
  ) as ChildProcessWithoutNullStreams;

  let stdoutTail = '';
  let stderrTail = '';
  let stdout = '';
  let stderr = '';

  child.stdout.on('data', (chunk: Buffer | string) => {
    const value = chunk.toString();
    stdout += value;
    stdoutTail = pushTail(stdoutTail, value);
  });

  child.stderr.on('data', (chunk: Buffer | string) => {
    const value = chunk.toString();
    stderr += value;
    stderrTail = pushTail(stderrTail, value);
  });

  const timeout = setTimeout(() => {
    child.kill('SIGTERM');
  }, timeoutMs);

  try {
    const [code, signal] = (await once(child, 'exit')) as [number | null, NodeJS.Signals | null];
    return { code, signal, stdout, stderr };
  } catch (error) {
    throw new E2EHarnessError({
      step: 'cli-exec',
      reason: error instanceof Error ? error.message : String(error),
      processState: {
        pid: child.pid ?? null,
        exitCode: child.exitCode,
        signalCode: child.signalCode,
        killed: child.killed,
        stdoutTail,
        stderrTail,
      },
    });
  } finally {
    clearTimeout(timeout);
  }
};

export const runCliHelpSmoke = async (
  fixture: E2EFixture = createE2EFixture(),
  deps: HarnessDeps = defaultDeps,
): Promise<void> => {
  const result = await executeCliCommand('--help', [], { fixture }, deps);
  const stdoutTail = result.stdout.length > TAIL_LIMIT ? result.stdout.slice(-TAIL_LIMIT) : result.stdout;
  const stderrTail = result.stderr.length > TAIL_LIMIT ? result.stderr.slice(-TAIL_LIMIT) : result.stderr;

  try {
    const { code, signal } = result;

    if (code !== 0) {
      throw new E2EHarnessError({
        step: 'cli-help',
        reason: `CLI exited with code ${code ?? 'null'} signal ${signal ?? 'none'}`,
        processState: {
          pid: null,
          exitCode: code,
          signalCode: signal,
          killed: signal !== null,
          stdoutTail,
          stderrTail,
        },
      });
    }

    if (!stdoutTail.includes(fixture.usageMarker)) {
      throw new E2EHarnessError({
        step: 'cli-help',
        reason: `Usage marker '${fixture.usageMarker}' not found in CLI output`,
        processState: {
          pid: null,
          exitCode: code,
          signalCode: signal,
          killed: signal !== null,
          stdoutTail,
          stderrTail,
        },
      });
    }
  } catch (error) {
    if (error instanceof E2EHarnessError) {
      throw error;
    }

    throw new E2EHarnessError({
      step: 'cli-help',
      reason: error instanceof Error ? error.message : String(error),
      processState: {
        pid: null,
        exitCode: result.code,
        signalCode: result.signal,
        killed: result.signal !== null,
        stdoutTail,
        stderrTail,
      },
    });
  }
};

export const pollHealth = async (
  fixture: E2EFixture,
  deps: PollHealthDeps = defaultPollDeps,
): Promise<void> => {
  const now = deps.now ?? Date.now;
  const sleeper = deps.sleep ?? sleep;
  const fetchImpl = deps.fetchImpl;

  const deadline = now() + fixture.timeoutMs;
  let lastError: string | null = null;

  while (now() <= deadline) {
    try {
      const response = await fetchImpl(fixture.healthUrl);
      if (response.status === 200) {
        return;
      }
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }

    await sleeper(fixture.pollIntervalMs);
  }

  throw timeoutError(fixture.timeoutMs);
};

export const runMcpHealthSmoke = async (
  fixture: E2EFixture = createE2EFixture(),
  deps: HarnessDeps = defaultDeps,
): Promise<void> => {
  const startServer = deps.startServer ?? defaultDeps.startServer;
  const handle = await startServer();

  try {
    await pollHealth(fixture, deps.pollDeps ?? defaultDeps.pollDeps);
  } catch (error) {
    throw new E2EHarnessError({
      step: 'mcp-health',
      reason:
        error instanceof Error && error.name === 'AbortError'
          ? `MCP healthcheck timeout after ${fixture.timeoutMs}ms`
          : error instanceof Error
            ? `MCP healthcheck failed: ${error.message}`
            : `MCP healthcheck failed: ${String(error)}`,
      processState: {
        pid: handle.server.listening ? process.pid : null,
        exitCode: null,
        signalCode: null,
        killed: false,
        stdoutTail: '',
        stderrTail: '',
      },
    });
  } finally {
    await safeStop(handle);
  }
};

export const safeStop = async (handle: MpcServerHandle): Promise<void> => {
  try {
    await handle.stop();
  } catch (error) {
    throw new E2EHarnessError({
      step: 'teardown',
      reason: error instanceof Error ? error.message : String(error),
      processState: {
        pid: process.pid,
        exitCode: null,
        signalCode: null,
        killed: false,
        stdoutTail: '',
        stderrTail: '',
      },
    });
  }
};

import { loadRuntimeConfig, loadRuntimeConfigForRoot } from './config.js';
import path from 'node:path';
import { createLogger } from './logger.js';
import type { RuntimeDeps } from './types.js';
import type { RuntimeConfig, RuntimeInitErrorCode, RuntimeInitResult, RuntimeInitState } from './types.js';
import { TaskRepo } from '../db/task-repo.js';
import { TaskLogRepo } from '../db/task-log-repo.js';
import { LocalGitRunner } from '../git/runner.js';
import { TaskService } from '../tasks/service.js';
import { BootstrapService, createDbConnectionFactory, resolveDbConfig } from '../db/bootstrap.js';
import { DomainError } from '../tasks/types.js';
import { RuntimeInitError } from './errors.js';
import { assertRuntimeInitTransition, RuntimeInitContractError } from './state.js';

export type LifecyclePhase = 'startup' | 'running' | 'shutdown' | 'terminated';

export type TerminalCategory = 'success' | 'usage' | 'validation' | 'domain' | 'infrastructure' | 'signal';

export interface TerminalDecision {
  category: TerminalCategory;
  stream: 'stdout' | 'stderr';
  exitCode: number;
  message?: string;
  hint?: string;
}

const TERMINAL_POLICY: Record<TerminalCategory, Pick<TerminalDecision, 'stream' | 'exitCode'>> = {
  success: { stream: 'stdout', exitCode: 0 },
  usage: { stream: 'stderr', exitCode: 64 },
  validation: { stream: 'stderr', exitCode: 65 },
  domain: { stream: 'stderr', exitCode: 1 },
  infrastructure: { stream: 'stderr', exitCode: 70 },
  signal: { stream: 'stderr', exitCode: 130 },
};

const toTerminalCategoryFromError = (error: unknown): TerminalCategory => {
  if (error instanceof DomainError) {
    if (error.code === 'VALIDATION_ERROR' || error.code === 'INVALID_TASK_TYPE' || error.code === 'TITLE_REQUIRED') {
      return 'validation';
    }

    return 'domain';
  }

  return 'infrastructure';
};

export const resolveTerminalDecision = (input: {
  category?: Exclude<TerminalCategory, 'success'>;
  error?: unknown;
  signal?: NodeJS.Signals;
  message?: string;
  hint?: string;
  success?: boolean;
}): TerminalDecision => {
  const category: TerminalCategory = input.success
    ? 'success'
    : input.signal
      ? 'signal'
      : input.category ?? toTerminalCategoryFromError(input.error);

  const policy = TERMINAL_POLICY[category];

  return {
    category,
    stream: policy.stream,
    exitCode: policy.exitCode,
    message: input.message,
    hint: input.hint,
  };
};

export interface LifecycleController {
  getPhase: () => LifecyclePhase;
  transitionToRunning: () => void;
  transitionToShutdown: () => void;
  transitionToTerminated: () => void;
}

export const createLifecycleController = (onPhaseChange?: (phase: LifecyclePhase) => void): LifecycleController => {
  let phase: LifecyclePhase = 'startup';

  const transition = (next: LifecyclePhase): void => {
    if (phase === next) return;
    phase = next;
    onPhaseChange?.(phase);
  };

  return {
    getPhase: () => phase,
    transitionToRunning: () => transition('running'),
    transitionToShutdown: () => transition('shutdown'),
    transitionToTerminated: () => transition('terminated'),
  };
};

let runtimeSingleton: RuntimeDeps | null = null;
const runtimeByRoot = new Map<string, RuntimeDeps>();

const toInitErrorCode = (error: unknown, fallback: RuntimeInitErrorCode): RuntimeInitErrorCode => {
  if (error instanceof RuntimeInitError) {
    return error.code;
  }

  if (error instanceof RuntimeInitContractError) {
    return 'INIT_CONTRACT_VIOLATION';
  }

  return fallback;
};

const toInitMessage = (error: unknown, fallback: string): string =>
  error instanceof Error && error.message.trim().length > 0 ? error.message : fallback;

const isValidConfigForBootstrap = (config: RuntimeConfig): boolean => {
  if (
    config.MCP_PORT !== undefined
    && (!Number.isInteger(config.MCP_PORT) || config.MCP_PORT <= 0 || config.MCP_PORT > 65535)
  ) {
    return false;
  }

  return typeof config.NEXUS_DB_PATH === 'string' && config.NEXUS_DB_PATH.trim().length > 0;
};

export interface RuntimeBootstrapRunInput {
  config: RuntimeConfig;
  dependencies?: string[];
  initDependency?: (name: string) => unknown;
  cleanup?: () => void;
}

export interface RuntimeBootstrapRunResult extends RuntimeInitResult {
  transitions: Exclude<RuntimeInitState, 'idle'>[];
  cleanupCalls: number;
}

export const createRuntimeBootstrapRunner = () => {
  return {
    run: ({ config, dependencies = ['runtime'], initDependency, cleanup }: RuntimeBootstrapRunInput): RuntimeBootstrapRunResult => {
      let state: RuntimeInitState = 'idle';
      const transitions: Exclude<RuntimeInitState, 'idle'>[] = [];
      let cleanupCalls = 0;

      const transitionTo = (next: RuntimeInitState): void => {
        assertRuntimeInitTransition(state, next);
        state = next;
        if (next !== 'idle') {
          transitions.push(next);
        }
      };

      const runCleanup = (): void => {
        cleanupCalls += 1;
        cleanup?.();
      };

      try {
        transitionTo('preflight');
      } catch (error) {
        return {
          ok: false,
          state,
          errorCode: toInitErrorCode(error, 'INIT_CONTRACT_VIOLATION'),
          message: toInitMessage(error, 'Runtime init contract violation'),
          transitions,
          cleanupCalls,
        };
      }

      if (!isValidConfigForBootstrap(config)) {
        const isTypeInvalid = config.MCP_PORT !== undefined
          && (!Number.isInteger(config.MCP_PORT) || config.MCP_PORT <= 0 || config.MCP_PORT > 65535);
        transitionTo('failed_preflight');
        return {
          ok: false,
          state,
          errorCode: isTypeInvalid ? 'INVALID_CONFIG' : 'PRECHECK_FAILED',
          message: isTypeInvalid
            ? 'Invalid runtime preflight: MCP_PORT must be an integer in range 1..65535'
            : 'Runtime preflight failed: missing required runtime configuration',
          transitions,
          cleanupCalls,
        };
      }

      try {
        transitionTo('dependencies');
        for (const dependency of dependencies) {
          initDependency?.(dependency);
        }
        transitionTo('ready');

        return {
          ok: true,
          state,
          transitions,
          cleanupCalls,
        };
      } catch (error) {
        try {
          transitionTo('failed_dependencies');
        } catch (transitionError) {
          return {
            ok: false,
            state,
            errorCode: toInitErrorCode(transitionError, 'INIT_CONTRACT_VIOLATION'),
            message: toInitMessage(transitionError, 'Runtime init contract violation while handling dependency failure'),
            transitions,
            cleanupCalls,
          };
        }

        runCleanup();

        return {
          ok: false,
          state,
          errorCode: toInitErrorCode(error, 'DEPENDENCY_INIT_FAILED'),
          message: toInitMessage(error, 'Runtime dependency initialization failed'),
          transitions,
          cleanupCalls,
        };
      }
    },
  };
};

export const createRuntime = (): RuntimeDeps => {
  const config = loadRuntimeConfig();
  return createRuntimeFromConfig(config);
};

const createRuntimeFromConfig = (config: RuntimeConfig): RuntimeDeps => {

  const bootstrapResult = createRuntimeBootstrapRunner().run({
    config,
    dependencies: ['runtime-dependencies'],
    initDependency: () => undefined,
  });

  if (!bootstrapResult.ok) {
    throw new RuntimeInitError(
      bootstrapResult.errorCode ?? 'PRECHECK_FAILED',
      bootstrapResult.message ?? 'Runtime bootstrap failed',
      { state: bootstrapResult.state, transitions: bootstrapResult.transitions },
    );
  }

  const logger = createLogger(config.LOG_LEVEL);
  const dbConfig = resolveDbConfig(config);
  const db = createDbConnectionFactory().open(dbConfig.dbPath);

  const taskRepo = new TaskRepo(db);
  const taskLogRepo = new TaskLogRepo(db);
  const gitRunner = new LocalGitRunner(undefined, config.NEXUS_EFFECTIVE_CWD);
  const taskService = new TaskService({ db, taskRepo, taskLogRepo, gitRunner });
  const dbBootstrapService = new BootstrapService({ NEXUS_DB_PATH: dbConfig.dbPath });

  return { config, logger, taskService, dbBootstrapService };
};

export const createRuntimeForRoot = (activeRoot: string): RuntimeDeps => {
  const config = loadRuntimeConfigForRoot(activeRoot, process.env);
  return createRuntimeFromConfig(config);
};

export const getRuntime = (): RuntimeDeps => {
  if (runtimeSingleton) {
    return runtimeSingleton;
  }

  runtimeSingleton = createRuntime();
  return runtimeSingleton;
};

export const getRuntimeForRoot = (activeRoot: string): RuntimeDeps => {
  const key = path.resolve(activeRoot);
  const cached = runtimeByRoot.get(key);
  if (cached) {
    return cached;
  }

  const runtime = createRuntimeForRoot(key);
  runtimeByRoot.set(key, runtime);
  return runtime;
};

export const getMcpRuntimeDeps = (): Pick<RuntimeDeps, 'config' | 'logger' | 'taskService' | 'dbBootstrapService'> => {
  const runtime = getRuntime();
  return {
    config: runtime.config,
    logger: runtime.logger,
    taskService: runtime.taskService,
    dbBootstrapService: runtime.dbBootstrapService,
  };
};

export const getMcpRuntimeDepsForRoot = (
  activeRoot: string,
): Pick<RuntimeDeps, 'config' | 'logger' | 'taskService' | 'dbBootstrapService'> => {
  const runtime = getRuntimeForRoot(activeRoot);
  return {
    config: runtime.config,
    logger: runtime.logger,
    taskService: runtime.taskService,
    dbBootstrapService: runtime.dbBootstrapService,
  };
};

export const resetRuntimeForTests = (): void => {
  runtimeSingleton = null;
  runtimeByRoot.clear();
};

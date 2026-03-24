#!/usr/bin/env node

import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getRuntime } from '../runtime/index.js';
import { createLifecycleController, resolveTerminalDecision } from '../runtime/index.js';
import {
  toCanonicalError,
  toCanonicalTask,
  toCanonicalTaskCompletion,
  toCanonicalTaskList,
} from '../contracts/step2.js';
import { startMcpServer } from '../mcp/server.js';
import { setupOpencode } from './setup.js';
import { DomainError } from '../tasks/types.js';
import type { LifecyclePhase } from '../runtime/index.js';
import {
  getSubcommandHelp,
  invalidTaskIdMessage,
  missingAddArgsMessage,
  ROOT_HELP_TEXT,
  unknownCommandMessage,
  unsupportedMcpModeMessage,
} from './messages.js';

const parseTaskId = (value: string | undefined): number => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new DomainError('VALIDATION_ERROR', invalidTaskIdMessage(value));
  }
  return parsed;
};

const printJson = (payload: unknown): void => {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
};

const printHelp = (): void => {
  process.stdout.write(ROOT_HELP_TEXT);
};

const writeDomainError = (error: DomainError): void => {
  process.stderr.write(`${JSON.stringify(toCanonicalError(error))}\n`);
};

export interface RunCliOptions {
  onLifecyclePhaseChange?: (phase: LifecyclePhase) => void;
}

export const runCli = (argv: string[] = process.argv.slice(2), options: RunCliOptions = {}): number => {
  const lifecycle = createLifecycleController(options.onLifecyclePhaseChange);

  let signalHandled = false;

  const cleanupSignalHandlers = (): void => {
    process.off('SIGINT', onSigInt);
    process.off('SIGTERM', onSigTerm);
  };

  const handleSignal = (signal: NodeJS.Signals): void => {
    if (signalHandled) return;
    signalHandled = true;

    const decision = resolveTerminalDecision({ signal });
    process.exitCode = decision.exitCode;
    lifecycle.transitionToShutdown();
    lifecycle.transitionToTerminated();
    cleanupSignalHandlers();
  };

  const onSigInt = (): void => handleSignal('SIGINT');
  const onSigTerm = (): void => handleSignal('SIGTERM');

  process.on('SIGINT', onSigInt);
  process.on('SIGTERM', onSigTerm);

  const finish = (decision: ReturnType<typeof resolveTerminalDecision>): number => {
    cleanupSignalHandlers();
    lifecycle.transitionToShutdown();
    lifecycle.transitionToTerminated();
    return decision.exitCode;
  };

  const writeTerminalMessage = (decision: ReturnType<typeof resolveTerminalDecision>, message: string): void => {
    if (decision.stream === 'stderr') {
      process.stderr.write(`${message}\n`);
      return;
    }
    process.stdout.write(`${message}\n`);
  };

  try {
    if (argv.length === 0) {
      lifecycle.transitionToRunning();
      printHelp();
      return finish(resolveTerminalDecision({ success: true }));
    }

    const [command, ...args] = argv;

    if (command === '--help') {
      lifecycle.transitionToRunning();
      printHelp();
      return finish(resolveTerminalDecision({ success: true }));
    }

    if (args.includes('--help')) {
      lifecycle.transitionToRunning();
      const subcommandHelp = getSubcommandHelp(command);
      if (subcommandHelp) {
        process.stdout.write(`${subcommandHelp}\n`);
        return finish(resolveTerminalDecision({ success: true }));
      }

      const decision = resolveTerminalDecision({ category: 'usage' });
      writeTerminalMessage(decision, unknownCommandMessage(command));
      return finish(decision);
    }

    // Ensure runtime wiring is initialized for CLI command execution
    const runtime = getRuntime();
    lifecycle.transitionToRunning();

    const ensureTaskServiceReady = (): void => {
      runtime.taskService.init();
    };

    switch (command) {
      case 'init': {
        const result = runtime.dbBootstrapService.init();
        runtime.taskService.init();
        printJson(result);
        return finish(resolveTerminalDecision({ success: true }));
      }
      case 'check': {
        const result = runtime.dbBootstrapService.check();
        printJson(result);
        return finish(resolveTerminalDecision({ success: true }));
      }
      case 'add': {
        ensureTaskServiceReady();
        const [type, ...titleParts] = args;
        if (!type || titleParts.length === 0) {
          throw new DomainError('VALIDATION_ERROR', missingAddArgsMessage());
        }
        const task = runtime.taskService.create({
          type: type as 'feat' | 'fix' | 'chore' | 'refactor' | 'docs',
          title: titleParts.join(' '),
        });
        printJson(toCanonicalTask(task));
        return finish(resolveTerminalDecision({ success: true }));
      }
      case 'board': {
        ensureTaskServiceReady();
        const tasks = runtime.taskService.listPending();
        printJson(toCanonicalTaskList(tasks));
        return finish(resolveTerminalDecision({ success: true }));
      }
      case 'complete': {
        ensureTaskServiceReady();
        const taskId = parseTaskId(args[0]);
        try {
          runtime.taskService.start(taskId);
        } catch (error) {
          if (error instanceof DomainError) {
            if (error.code === 'ALREADY_COMPLETED') {
              throw error;
            }

            if (error.code !== 'INVALID_TRANSITION') {
              throw error;
            }
          } else {
            throw error;
          }
        }
        const result = runtime.taskService.complete(taskId);
        printJson(toCanonicalTaskCompletion(result));
        return finish(resolveTerminalDecision({ success: true }));
      }
      case 'mcp': {
        const mcpSubcommand = args[0] ?? 'stdio';

        if (mcpSubcommand === 'setup') {
          const target = args[1];
          if (target !== 'opencode') {
            throw new DomainError('VALIDATION_ERROR', `Unsupported setup target '${String(target)}'. Expected 'opencode'.`);
          }
          const result = setupOpencode();
          printJson(result);
          return finish(resolveTerminalDecision({ success: true }));
        }

        if (mcpSubcommand !== 'stdio') {
          throw new DomainError('VALIDATION_ERROR', unsupportedMcpModeMessage(mcpSubcommand));
        }

        void startMcpServer({ mode: 'stdio' });
        return finish(resolveTerminalDecision({ success: true }));
      }
      default: {
        const decision = resolveTerminalDecision({ category: 'usage' });
        writeTerminalMessage(decision, unknownCommandMessage(command));
        return finish(decision);
      }
    }
  } catch (error) {
    if (error instanceof DomainError) {
      writeDomainError(error);
      return finish(resolveTerminalDecision({ error }));
    }

    const decision = resolveTerminalDecision({ error });
    writeTerminalMessage(decision, error instanceof Error ? error.message : String(error));
    return finish(decision);
  }
};

const isDirectCliExecution = (): boolean => {
  const entryArg = process.argv[1];
  if (!entryArg) return false;

  const modulePath = fileURLToPath(import.meta.url);
  const entryPath = resolve(entryArg);

  try {
    return realpathSync(modulePath) === realpathSync(entryPath);
  } catch {
    return modulePath === entryPath;
  }
};

if (isDirectCliExecution()) {
  const code = runCli();
  process.exitCode = code;
}

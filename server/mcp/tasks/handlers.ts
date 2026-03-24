import {
  TaskLifecycleMachine,
  type TaskEvent,
  type TaskState,
  type TransitionInput,
  type TransitionResult,
} from './lifecycle.js';
import { serializeLifecycleError } from './errors.js';
import type { TaskEventRepository, TaskRepository, TaskTransitionAudit } from './repository.js';

type LifecycleCommand = Exclude<TaskEvent, 'create'>;

export interface LifecycleHandlerDeps {
  lifecycleMachine: TaskLifecycleMachine;
  taskRepository: TaskRepository;
  eventRepository: TaskEventRepository;
  now?: () => string;
  isEnforced?: () => boolean;
}

export interface LifecycleSuccessResponse {
  ok: true;
  transition: TransitionResult;
  warning?: ReturnType<typeof serializeLifecycleError>;
}

export interface LifecycleErrorResponse {
  ok: false;
  error: ReturnType<typeof serializeLifecycleError> | { code: 'TASK_NOT_FOUND'; message: string };
}

export type LifecycleResponse = LifecycleSuccessResponse | LifecycleErrorResponse;

const parseEnforced = (): boolean => {
  const raw = process.env.TASK_LIFECYCLE_ENFORCED;
  return raw === '1' || raw === 'true';
};

const eventFallbackState: Record<TaskEvent, TaskState> = {
  create: 'todo',
  start: 'in_progress',
  block: 'blocked',
  unblock: 'in_progress',
  complete: 'done',
  cancel: 'cancelled',
  reopen: 'in_progress',
};

const persistTransition = async (
  deps: LifecycleHandlerDeps,
  taskId: string,
  transition: TransitionResult,
  actor: string,
  timestamp: string,
): Promise<void> => {
  await deps.taskRepository.saveState(taskId, transition.to, timestamp);

  const audit: TaskTransitionAudit = {
    task_id: taskId,
    from: transition.from,
    to: transition.to,
    event: transition.event,
    actor,
    timestamp,
  };

  await deps.eventRepository.append(audit);
};

const legacyTransition = (state: TaskState, event: TaskEvent): TransitionResult => ({
  from: state,
  to: eventFallbackState[event],
  event,
  allowedEvents: [],
});

const executeTransition = async (
  deps: LifecycleHandlerDeps,
  input: TransitionInput,
): Promise<LifecycleResponse> => {
  const enforced = (deps.isEnforced ?? parseEnforced)();

  try {
    const transition = deps.lifecycleMachine.transition(input);
    await persistTransition(deps, input.taskId, transition, input.actor, input.at);

    return {
      ok: true,
      transition,
    };
  } catch (error) {
    const serialized = serializeLifecycleError(error);

    if (enforced) {
      return {
        ok: false,
        error: serialized,
      };
    }

    const fallback = legacyTransition(input.currentState as TaskState, input.event as TaskEvent);
    await persistTransition(deps, input.taskId, fallback, input.actor, input.at);

    return {
      ok: true,
      transition: fallback,
      warning: serialized,
    };
  }
};

const executeLifecycleCommand = async (
  deps: LifecycleHandlerDeps,
  event: LifecycleCommand,
  taskId: string,
  actor: string,
): Promise<LifecycleResponse> => {
  const task = await deps.taskRepository.getById(taskId);

  if (!task) {
    return {
      ok: false,
      error: {
        code: 'TASK_NOT_FOUND',
        message: `Task '${taskId}' not found`,
      },
    };
  }

  return executeTransition(deps, {
    taskId,
    currentState: task.state,
    event,
    actor,
    at: (deps.now ?? (() => new Date().toISOString()))(),
  });
};

export const createTask = async (
  deps: LifecycleHandlerDeps,
  taskId: string,
  actor: string,
): Promise<LifecycleResponse> => {
  const now = (deps.now ?? (() => new Date().toISOString()))();

  try {
    const transition = deps.lifecycleMachine.transition({
      taskId,
      event: 'create',
      actor,
      at: now,
    });

    await deps.taskRepository.create(taskId, transition.to, now);

    const audit: TaskTransitionAudit = {
      task_id: taskId,
      from: transition.from,
      to: transition.to,
      event: transition.event,
      actor,
      timestamp: now,
    };
    await deps.eventRepository.append(audit);

    return { ok: true, transition };
  } catch (error) {
    return {
      ok: false,
      error: serializeLifecycleError(error),
    };
  }
};

export const startTask = (deps: LifecycleHandlerDeps, taskId: string, actor: string): Promise<LifecycleResponse> =>
  executeLifecycleCommand(deps, 'start', taskId, actor);

export const blockTask = (deps: LifecycleHandlerDeps, taskId: string, actor: string): Promise<LifecycleResponse> =>
  executeLifecycleCommand(deps, 'block', taskId, actor);

export const unblockTask = (deps: LifecycleHandlerDeps, taskId: string, actor: string): Promise<LifecycleResponse> =>
  executeLifecycleCommand(deps, 'unblock', taskId, actor);

export const completeTask = (deps: LifecycleHandlerDeps, taskId: string, actor: string): Promise<LifecycleResponse> =>
  executeLifecycleCommand(deps, 'complete', taskId, actor);

export const cancelTask = (deps: LifecycleHandlerDeps, taskId: string, actor: string): Promise<LifecycleResponse> =>
  executeLifecycleCommand(deps, 'cancel', taskId, actor);

export const reopenTask = (deps: LifecycleHandlerDeps, taskId: string, actor: string): Promise<LifecycleResponse> =>
  executeLifecycleCommand(deps, 'reopen', taskId, actor);

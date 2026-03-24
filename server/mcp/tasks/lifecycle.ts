import { InvalidStateError, InvalidTransitionError } from './errors.js';

export const TASK_STATES = ['todo', 'in_progress', 'blocked', 'done', 'cancelled'] as const;
export type TaskState = (typeof TASK_STATES)[number];

export const TASK_EVENTS = ['create', 'start', 'block', 'unblock', 'complete', 'cancel', 'reopen'] as const;
export type TaskEvent = (typeof TASK_EVENTS)[number];

type TransitionKey = `${TaskState}:${TaskEvent}`;

export interface TransitionInput {
  taskId: string;
  currentState?: string;
  event: string;
  actor: string;
  at: string;
}

export interface TransitionResult {
  from: TaskState | null;
  to: TaskState;
  event: TaskEvent;
  allowedEvents: TaskEvent[];
}

export type TransitionValidationResult =
  | { ok: true; to: TaskState }
  | { ok: false; allowedEvents: TaskEvent[] };

const createTransitionTable = (): Partial<Record<TransitionKey, TaskState>> => ({
  'todo:start': 'in_progress',
  'todo:cancel': 'cancelled',
  'in_progress:block': 'blocked',
  'in_progress:complete': 'done',
  'in_progress:cancel': 'cancelled',
  'blocked:unblock': 'in_progress',
  'blocked:cancel': 'cancelled',
  'done:reopen': 'in_progress',
  'cancelled:reopen': 'todo',
});

export const TASK_TRANSITIONS: Readonly<Partial<Record<TransitionKey, TaskState>>> = createTransitionTable();

const ALLOWED_EVENTS_BY_STATE: Readonly<Record<TaskState, TaskEvent[]>> = {
  todo: ['start', 'cancel'],
  in_progress: ['block', 'complete', 'cancel'],
  blocked: ['unblock', 'cancel'],
  done: ['reopen'],
  cancelled: ['reopen'],
};

export const getAllowedEvents = (state: TaskState): TaskEvent[] => [...ALLOWED_EVENTS_BY_STATE[state]];

export const isCanonicalTaskState = (value: string): value is TaskState =>
  (TASK_STATES as readonly string[]).includes(value);

export const isCanonicalTaskEvent = (value: string): value is TaskEvent =>
  (TASK_EVENTS as readonly string[]).includes(value);

export const validateTransition = (currentState: TaskState, event: TaskEvent): TransitionValidationResult => {
  const key = `${currentState}:${event}` as TransitionKey;
  const to = TASK_TRANSITIONS[key];

  if (!to) {
    return { ok: false, allowedEvents: getAllowedEvents(currentState) };
  }

  return { ok: true, to };
};

const assertCanonicalState = (value: string): TaskState => {
  if (!isCanonicalTaskState(value)) {
    throw new InvalidStateError('state', value);
  }
  return value;
};

export class TaskLifecycleMachine {
  transition(input: TransitionInput): TransitionResult {
    if (!isCanonicalTaskEvent(input.event)) {
      throw new InvalidStateError('event', input.event);
    }

    if (input.currentState && !isCanonicalTaskState(input.currentState)) {
      throw new InvalidStateError('state', input.currentState);
    }

    if (input.event === 'create') {
      return {
        from: null,
        to: 'todo',
        event: 'create',
        allowedEvents: [],
      };
    }

    const from = input.currentState;

    if (!from) {
      throw new InvalidStateError('state', 'undefined');
    }

    const canonicalFrom = assertCanonicalState(from);
    const validation = validateTransition(canonicalFrom, input.event);

    if (!validation.ok) {
      throw new InvalidTransitionError(canonicalFrom, input.event, validation.allowedEvents);
    }

    return {
      from: canonicalFrom,
      to: validation.to,
      event: input.event,
      allowedEvents: getAllowedEvents(canonicalFrom),
    };
  }
}

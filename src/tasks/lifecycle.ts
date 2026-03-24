import { DomainError, type TaskState } from './types.js';

export interface TransitionResult {
  from: TaskState;
  to: TaskState;
}

const VALID_TRANSITIONS: Readonly<Record<TaskState, TaskState[]>> = {
  pending: ['in_progress'],
  in_progress: ['done'],
  done: [],
};

export const ensureTransition = (from: TaskState, to: TaskState): TransitionResult => {
  if (from === 'done') {
    throw new DomainError('ALREADY_COMPLETED', 'Task is already completed', {
      from,
      to,
      allowed: [],
    });
  }

  const allowed = VALID_TRANSITIONS[from];

  if (!allowed.includes(to)) {
    throw new DomainError('INVALID_TRANSITION', `Cannot transition task from '${from}' to '${to}'`, {
      from,
      to,
      allowed,
    });
  }

  return { from, to };
};

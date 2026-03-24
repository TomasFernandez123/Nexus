import type { TaskEvent, TaskState } from './lifecycle.js';

export type LifecycleErrorCode = 'INVALID_STATE' | 'INVALID_TRANSITION';

export interface LifecycleErrorPayload {
  code: LifecycleErrorCode;
  message: string;
  current_state?: TaskState;
  event?: TaskEvent | string;
  allowed_events?: TaskEvent[];
}

abstract class LifecycleError extends Error {
  abstract readonly code: LifecycleErrorCode;
  abstract toPayload(): LifecycleErrorPayload;
}

export class InvalidStateError extends LifecycleError {
  readonly code = 'INVALID_STATE' as const;

  constructor(public readonly kind: 'state' | 'event', public readonly value: string) {
    super(`${kind === 'state' ? 'State' : 'Event'} '${value}' is not canonical`);
    this.name = 'InvalidStateError';
  }

  toPayload(): LifecycleErrorPayload {
    return {
      code: this.code,
      message: this.message,
    };
  }
}

export class InvalidTransitionError extends LifecycleError {
  readonly code = 'INVALID_TRANSITION' as const;

  constructor(
    public readonly currentState: TaskState,
    public readonly event: TaskEvent,
    public readonly allowedEvents: TaskEvent[],
  ) {
    super(`Event '${event}' is not allowed from state '${currentState}'`);
    this.name = 'InvalidTransitionError';
  }

  toPayload(): LifecycleErrorPayload {
    return {
      code: this.code,
      message: this.message,
      current_state: this.currentState,
      event: this.event,
      allowed_events: this.allowedEvents,
    };
  }
}

export const isLifecycleError = (error: unknown): error is LifecycleError =>
  Boolean(error) && error instanceof Error && 'toPayload' in error && 'code' in error;

export const serializeLifecycleError = (error: unknown): LifecycleErrorPayload => {
  if (isLifecycleError(error)) {
    return error.toPayload();
  }

  return {
    code: 'INVALID_TRANSITION',
    message: error instanceof Error ? error.message : 'Unknown lifecycle error',
  };
};

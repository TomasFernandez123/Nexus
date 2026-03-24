export const TASK_STATES = ['pending', 'in_progress', 'done'] as const;
export type TaskState = (typeof TASK_STATES)[number];

export const TASK_TYPES = ['feat', 'fix', 'chore', 'refactor', 'docs'] as const;
export type TaskType = (typeof TASK_TYPES)[number];

export type DomainErrorCode =
  | 'TASK_NOT_FOUND'
  | 'ALREADY_COMPLETED'
  | 'INVALID_TRANSITION'
  | 'INVALID_TASK_TYPE'
  | 'TITLE_REQUIRED'
  | 'VALIDATION_ERROR'
  | 'GIT_NOT_INITIALIZED'
  | 'GIT_NOTHING_TO_COMMIT'
  | 'GIT_ERROR'
  | 'DB_NOT_INITIALIZED'
  | 'DB_CONFIG_INVALID'
  | 'DB_CONNECTION_FAILED'
  | 'MIGRATION_FAILED';

export interface DomainErrorPayload {
  code: DomainErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

export class DomainError extends Error {
  constructor(
    public readonly code: DomainErrorCode,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'DomainError';
  }

  toPayload(): DomainErrorPayload {
    return {
      code: this.code,
      message: this.message,
      ...(this.details ? { details: this.details } : {}),
    };
  }
}

export interface TaskEntity {
  id: number;
  title: string;
  description: string | null;
  type: TaskType;
  state: TaskState;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  commitHash: string | null;
  commitMessage: string | null;
}

export interface TaskLogEntity {
  id: number;
  taskId: number;
  text: string;
  createdAt: string;
}

export interface GitCommitResult {
  hash: string;
  message: string;
}

import type { TaskEvent, TaskState } from './lifecycle.js';

export interface TaskRecord {
  id: string;
  state: TaskState;
}

export interface TaskTransitionAudit {
  task_id: string;
  from: TaskState | null;
  to: TaskState;
  event: TaskEvent;
  actor: string;
  timestamp: string;
}

export interface TaskRepository {
  getById(taskId: string): Promise<TaskRecord | null>;
  create(taskId: string, initialState: TaskState, at: string): Promise<void>;
  saveState(taskId: string, state: TaskState, at: string): Promise<void>;
}

export interface TaskEventRepository {
  append(event: TaskTransitionAudit): Promise<void>;
}

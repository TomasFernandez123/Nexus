import type { TaskLogRecord, TaskRecord } from '../runtime/types.js';
import type { DomainError } from '../tasks/types.js';

const toCanonicalStatus = (state: TaskRecord['state']): 'todo' | 'in_progress' | 'done' => {
  if (state === 'pending') return 'todo';
  return state;
};

export interface CanonicalError {
  error: string;
  code: string;
}

export interface CanonicalTask {
  id: number;
  type: TaskRecord['type'];
  title: string;
  status: 'todo' | 'in_progress' | 'done';
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  commit_hash: string | null;
  commit_message: string | null;
}

export interface CanonicalTaskLog {
  id: number;
  task_id: number;
  text: string;
  created_at: string;
}

export interface CanonicalGitCommitResult {
  hash: string;
  message: string;
}

export interface CanonicalTaskCompletion {
  task: CanonicalTask;
  commit: CanonicalGitCommitResult;
}

export const toCanonicalError = (error: DomainError): CanonicalError => ({
  error: error.message,
  code: error.code,
});

export const toCanonicalTask = (task: TaskRecord): CanonicalTask => ({
  id: task.id,
  type: task.type,
  title: task.title,
  status: toCanonicalStatus(task.state),
  created_at: task.createdAt,
  updated_at: task.updatedAt,
  completed_at: task.completedAt,
  commit_hash: task.commitHash,
  commit_message: task.commitMessage,
});

export const toCanonicalTaskList = (tasks: TaskRecord[]): CanonicalTask[] => tasks.map(toCanonicalTask);

export const toCanonicalTaskLog = (taskLog: TaskLogRecord): CanonicalTaskLog => ({
  id: taskLog.id,
  task_id: taskLog.taskId,
  text: taskLog.text,
  created_at: taskLog.createdAt,
});

export const toCanonicalTaskCompletion = (input: {
  task: TaskRecord;
  commit: { hash: string; message: string };
}): CanonicalTaskCompletion => ({
  task: toCanonicalTask(input.task),
  commit: {
    hash: input.commit.hash,
    message: input.commit.message,
  },
});

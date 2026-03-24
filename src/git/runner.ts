import { spawnSync } from 'node:child_process';
import { DomainError, type GitCommitResult } from '../tasks/types.js';

export type GitCommand = (args: string[]) => { ok: true; out: string } | { ok: false; message: string };

export const createGitCommand = (
  run: typeof spawnSync = spawnSync,
  cwd?: string,
): GitCommand =>
  (args: string[]): { ok: true; out: string } | { ok: false; message: string } => {
    const result = run('git', args, {
      encoding: 'utf8',
      cwd,
    });

    if (result.status !== 0) {
      const message = result.stderr?.trim() || result.stdout?.trim() || `git ${args.join(' ')} failed`;
      return { ok: false, message };
    }

    return { ok: true, out: result.stdout?.trim() ?? '' };
  };

export const buildCommitMessage = (type: string, title: string, taskId: number): string =>
  `${type}: ${title} (Closes #${taskId})`;

const classifyGitError = (
  message: string,
): { code: 'GIT_NOT_INITIALIZED' | 'GIT_NOTHING_TO_COMMIT' | 'GIT_ERROR'; message: string } => {
  const normalized = message.toLowerCase();

  if (
    normalized.includes('not a git repository') ||
    normalized.includes('fatal: not a git repository') ||
    normalized.includes('cannot find .git')
  ) {
    return {
      code: 'GIT_NOT_INITIALIZED',
      message: 'Git repository not initialized. Run: git init',
    };
  }

  if (normalized.includes('nothing to commit') || normalized.includes('no changes added to commit')) {
    return {
      code: 'GIT_NOTHING_TO_COMMIT',
      message: 'Nothing to commit. Did you save your changes?',
    };
  }

  return {
    code: 'GIT_ERROR',
    message: 'Failed to create commit for completed task',
  };
};

export interface GitRunner {
  commitForTask(input: {
    taskId: number;
    title: string;
    type: 'feat' | 'fix' | 'chore' | 'refactor' | 'docs';
  }): GitCommitResult;
}

export class LocalGitRunner implements GitRunner {
  private readonly runGit: GitCommand;

  constructor(runGit?: GitCommand, cwd?: string, run: typeof spawnSync = spawnSync) {
    this.runGit = runGit ?? createGitCommand(run, cwd);
  }

  commitForTask(input: {
    taskId: number;
    title: string;
    type: 'feat' | 'fix' | 'chore' | 'refactor' | 'docs';
  }): GitCommitResult {
    const message = buildCommitMessage(input.type, input.title, input.taskId);

    const add = this.runGit(['add', '-A']);
    if (!add.ok) {
      const classified = classifyGitError(add.message);
      if (classified.code !== 'GIT_ERROR') {
        throw new DomainError(classified.code, classified.message, { cause: add.message });
      }
      throw new DomainError('GIT_ERROR', 'Failed to stage changes for task completion', { cause: add.message });
    }

    const commit = this.runGit(['commit', '-m', message]);
    if (!commit.ok) {
      const classified = classifyGitError(commit.message);
      throw new DomainError(classified.code, classified.message, { cause: commit.message });
    }

    const rev = this.runGit(['rev-parse', '--short', 'HEAD']);
    if (!rev.ok) {
      throw new DomainError('GIT_ERROR', 'Failed to resolve commit hash after completion', { cause: rev.message });
    }

    return {
      hash: rev.out,
      message,
    };
  }
}

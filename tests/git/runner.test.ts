import { describe, expect, it } from 'vitest';
import { LocalGitRunner, buildCommitMessage, createGitCommand } from '../../src/git/runner.js';
import { DomainError } from '../../src/tasks/types.js';

describe('git runner', () => {
  it('builds commit message with required format', () => {
    expect(buildCommitMessage('feat', 'Implement runtime', 42)).toBe('feat: Implement runtime (Closes #42)');
  });

  it('maps unknown git commit failures to controlled GIT_ERROR', () => {
    const fakeRunGit = ((args: string[]) => {
      if (args[0] === 'add') return { ok: true as const, out: '' };
      if (args[0] === 'commit') return { ok: false as const, message: 'forced generic commit failure' };
      return { ok: true as const, out: 'abc123' };
    }) as ConstructorParameters<typeof LocalGitRunner>[0];

    const runner = new LocalGitRunner(fakeRunGit);

    expect(() => runner.commitForTask({ taskId: 1, title: 'T', type: 'feat' })).toThrowError(
      /Failed to create commit for completed task/,
    );
  });

  it('maps non-git-repo failures to GIT_NOT_INITIALIZED', () => {
    const fakeRunGit = ((args: string[]) => {
      if (args[0] === 'add') {
        return { ok: false as const, message: 'fatal: not a git repository (or any of the parent directories): .git' };
      }
      return { ok: true as const, out: '' };
    }) as ConstructorParameters<typeof LocalGitRunner>[0];

    const runner = new LocalGitRunner(fakeRunGit);

    try {
      runner.commitForTask({ taskId: 1, title: 'T', type: 'feat' });
      throw new Error('Expected commitForTask to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe('GIT_NOT_INITIALIZED');
    }
  });

  it('maps no-change commit failures to GIT_NOTHING_TO_COMMIT', () => {
    const fakeRunGit = ((args: string[]) => {
      if (args[0] === 'add') return { ok: true as const, out: '' };
      if (args[0] === 'commit') return { ok: false as const, message: 'nothing to commit, working tree clean' };
      return { ok: true as const, out: '' };
    }) as ConstructorParameters<typeof LocalGitRunner>[0];

    const runner = new LocalGitRunner(fakeRunGit);

    try {
      runner.commitForTask({ taskId: 1, title: 'T', type: 'feat' });
      throw new Error('Expected commitForTask to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe('GIT_NOTHING_TO_COMMIT');
    }
  });

  it('runs git commands in the effective repo root cwd', () => {
    const calls: Array<{ args: string[]; cwd?: string }> = [];
    const run = ((
      _command: string,
      args: readonly string[],
      options?: { cwd?: string },
    ) => {
      calls.push({ args: [...args], cwd: options?.cwd });

      if (args[0] === 'add' || args[0] === 'commit') {
        return { status: 0, stdout: '', stderr: '' };
      }

      return { status: 0, stdout: 'abc123', stderr: '' };
    }) as unknown as typeof import('node:child_process').spawnSync;

    const runner = new LocalGitRunner(undefined, '/tmp/project-root', run);

    const result = runner.commitForTask({ taskId: 7, title: 'Scoped repo commit', type: 'fix' });

    expect(result.hash).toBe('abc123');
    expect(calls).toEqual([
      { args: ['add', '-A'], cwd: '/tmp/project-root' },
      { args: ['commit', '-m', 'fix: Scoped repo commit (Closes #7)'], cwd: '/tmp/project-root' },
      { args: ['rev-parse', '--short', 'HEAD'], cwd: '/tmp/project-root' },
    ]);

    const command = createGitCommand(run, '/tmp/project-root');
    command(['status']);
    expect(calls.at(-1)).toEqual({ args: ['status'], cwd: '/tmp/project-root' });
  });
});

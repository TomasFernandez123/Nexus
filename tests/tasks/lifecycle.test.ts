import { describe, expect, it } from 'vitest';
import { ensureTransition } from '../../src/tasks/lifecycle.js';
import { DomainError } from '../../src/tasks/types.js';

describe('tasks lifecycle', () => {
  it('allows pending -> in_progress and in_progress -> done', () => {
    expect(ensureTransition('pending', 'in_progress')).toEqual({ from: 'pending', to: 'in_progress' });
    expect(ensureTransition('in_progress', 'done')).toEqual({ from: 'in_progress', to: 'done' });
  });

  it('rejects invalid transitions with INVALID_TRANSITION', () => {
    expect(() => ensureTransition('pending', 'done')).toThrowError(/Cannot transition task from 'pending' to 'done'/);
  });

  it('returns ALREADY_COMPLETED for transitions from done', () => {
    try {
      ensureTransition('done', 'in_progress');
      throw new Error('Expected ensureTransition to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe('ALREADY_COMPLETED');
    }
  });
});

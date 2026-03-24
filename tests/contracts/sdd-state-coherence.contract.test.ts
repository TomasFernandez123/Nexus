import { describe, expect, it } from 'vitest';

type SddState = {
  current_phase: string;
  completed_phases: string[];
  next_recommended: string;
};

type VerifyArchiveEvidence = {
  verify_pass_final: boolean;
  has_archive_report: boolean;
};

const validateSddStateCoherence = (state: SddState, evidence: VerifyArchiveEvidence): string[] => {
  const errors: string[] = [];

  if (state.current_phase === 'archive') {
    if (!state.completed_phases.includes('verify')) {
      errors.push('SDD_STATE_COHERENCE_FAIL:archive_requires_verify_completed');
    }
    if (!state.completed_phases.includes('archive')) {
      errors.push('SDD_STATE_COHERENCE_FAIL:archive_requires_archive_completed');
    }
    if (state.next_recommended !== 'none') {
      errors.push('SDD_STATE_COHERENCE_FAIL:archive_requires_next_none');
    }
  }

  if (evidence.verify_pass_final && state.current_phase !== 'archive' && !evidence.has_archive_report) {
    errors.push('SDD_STATE_COHERENCE_FAIL:verify_pass_without_archive_phase');
  }

  return errors;
};

describe('SDD state coherence contract', () => {
  it('Requirement: Coherencia administrativa de estado SDD / Scenario: Estado coherente tras verify/archive', () => {
    const state: SddState = {
      current_phase: 'archive',
      completed_phases: ['explore', 'proposal', 'spec', 'design', 'tasks', 'apply', 'verify', 'archive'],
      next_recommended: 'none',
    };

    const evidence: VerifyArchiveEvidence = {
      verify_pass_final: true,
      has_archive_report: true,
    };

    const errors = validateSddStateCoherence(state, evidence);
    expect(errors).toHaveLength(0);
  });

  it('Requirement: Coherencia administrativa de estado SDD / Scenario: Estado inconsistente', () => {
    const state: SddState = {
      current_phase: 'archive',
      completed_phases: ['explore', 'proposal', 'spec', 'design', 'tasks', 'apply'],
      next_recommended: 'sdd-verify',
    };

    const evidence: VerifyArchiveEvidence = {
      verify_pass_final: true,
      has_archive_report: false,
    };

    const errors = validateSddStateCoherence(state, evidence);

    expect(errors).toContain('SDD_STATE_COHERENCE_FAIL:archive_requires_verify_completed');
    expect(errors).toContain('SDD_STATE_COHERENCE_FAIL:archive_requires_archive_completed');
    expect(errors).toContain('SDD_STATE_COHERENCE_FAIL:archive_requires_next_none');
  });
});

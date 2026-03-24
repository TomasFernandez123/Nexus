import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

type PackageJson = {
  scripts?: Record<string, string>;
};

describe('Release gate technical baseline contract', () => {
  it('Requirement: Release gate técnico mínimo y determinístico / Scenario: Gate exitoso', () => {
    const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as PackageJson;
    const scripts = packageJson.scripts ?? {};

    expect(scripts.build).toBeTypeOf('string');
    expect(scripts.typecheck).toBeTypeOf('string');
    expect(scripts.test).toBeTypeOf('string');
    expect(scripts['release:gate']).toBeTypeOf('string');

    expect(scripts['release:gate']).toContain('npm run build');
    expect(scripts['release:gate']).toContain('npm run typecheck');
    expect(scripts['release:gate']).toContain('npm run test');

    const normalized = scripts['release:gate']?.replace(/\s+/g, ' ').trim() ?? '';
    expect(normalized).toBe('npm run build && npm run typecheck && npm run test');
  });

  it('Requirement: Release gate técnico mínimo y determinístico / Scenario: Falla por script faltante o check fallido', () => {
    const validateGateScripts = (scripts: Record<string, string | undefined>): string[] => {
      const errors: string[] = [];
      for (const script of ['build', 'typecheck', 'test']) {
        if (!scripts[script]) {
          errors.push(`RELEASE_GATE_MISSING_SCRIPT:${script}`);
        }
      }
      if (!scripts['release:gate']) {
        errors.push('RELEASE_GATE_MISSING_SCRIPT:release:gate');
      }
      return errors;
    };

    const errors = validateGateScripts({
      build: 'tsc -p tsconfig.json',
      typecheck: undefined,
      test: 'vitest run',
      'release:gate': 'npm run build && npm run typecheck && npm run test',
    });

    expect(errors).toContain('RELEASE_GATE_MISSING_SCRIPT:typecheck');
  });
});

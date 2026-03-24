import { describe, expect, it } from 'vitest';
import { RuntimeInitError } from '../../src/runtime/errors.js';
import {
  assertRuntimeInitTransition,
  RuntimeInitContractError,
  type RuntimeInitState,
} from '../../src/runtime/state.js';
import { createRuntimeBootstrapRunner } from '../../src/runtime/index.js';
import { invalidPortConfig, missingDbPathConfig, validInitConfig } from './fixtures/init-fixtures.js';

describe('runtime init contract', () => {
  it('Requirement: Deterministic bootstrap contract / Scenario: Successful startup emits ordered phases', () => {
    const { run } = createRuntimeBootstrapRunner();

    const result = run({
      config: validInitConfig({ MCP_PORT: 6150 }),
      initDependency: () => ({ name: 'sqlite' }),
    });

    expect(result.ok).toBe(true);
    expect(result.state).toBe('ready');
    expect(result.transitions).toEqual(['preflight', 'dependencies', 'ready']);
  });

  it('Requirement: Deterministic bootstrap contract / Scenario: Startup order violation is rejected', () => {
    expect(() => assertRuntimeInitTransition('preflight', 'ready')).toThrowError(RuntimeInitContractError);

    try {
      assertRuntimeInitTransition('preflight', 'ready');
    } catch (error) {
      expect(error).toBeInstanceOf(RuntimeInitContractError);
      if (!(error instanceof RuntimeInitContractError)) {
        throw error;
      }

      expect(error.from).toBe('preflight');
      expect(error.to).toBe('ready');
    }
  });

  it('Requirement: Preflight validation gate / Scenario: Missing required config fails in preflight', () => {
    const { run } = createRuntimeBootstrapRunner();

    const result = run({
      config: missingDbPathConfig(),
      initDependency: () => ({ name: 'sqlite' }),
    });

    expect(result).toMatchObject({
      ok: false,
      state: 'failed_preflight',
      errorCode: 'PRECHECK_FAILED',
    });
  });

  it('Requirement: Preflight validation gate / Scenario: Invalid config type blocks bootstrap', () => {
    const { run } = createRuntimeBootstrapRunner();

    const result = run({
      config: invalidPortConfig(),
      initDependency: () => ({ name: 'sqlite' }),
    });

    expect(result).toMatchObject({
      ok: false,
      state: 'failed_preflight',
      errorCode: 'INVALID_CONFIG',
    });
  });

  it('Requirement: Dependency initialization resilience / Scenario: Dependency init timeout triggers controlled failure', () => {
    const { run } = createRuntimeBootstrapRunner();

    const result = run({
      config: validInitConfig({ MCP_PORT: 6152 }),
      initDependency: () => {
        throw new RuntimeInitError('DEPENDENCY_TIMEOUT', 'Dependency timed out', { dependency: 'sqlite' });
      },
    });

    expect(result).toMatchObject({
      ok: false,
      state: 'failed_dependencies',
      errorCode: 'DEPENDENCY_TIMEOUT',
    });
    expect(result.cleanupCalls).toBe(1);
  });

  it('Requirement: Dependency initialization resilience / Scenario: Partial dependency init performs cleanup', () => {
    const { run } = createRuntimeBootstrapRunner();

    const result = run({
      config: validInitConfig({ MCP_PORT: 6153 }),
      initDependency: (name) => {
        if (name === 'first') return { name };
        throw new Error('second dependency failed');
      },
      dependencies: ['first', 'second'],
    });

    expect(result).toMatchObject({
      ok: false,
      state: 'failed_dependencies',
      errorCode: 'DEPENDENCY_INIT_FAILED',
    });
    expect(result.cleanupCalls).toBe(1);
  });

  it('Requirement: Observable init outcomes / Scenario: Success path is test-verifiable', () => {
    const { run } = createRuntimeBootstrapRunner();

    const result = run({
      config: validInitConfig({ MCP_PORT: 6154 }),
      initDependency: () => ({ name: 'sqlite' }),
    });

    expect(result.ok).toBe(true);
    expect(result.state).toBe('ready');
  });

  it('Requirement: Observable init outcomes / Scenario: Failure paths are test-verifiable', () => {
    const { run } = createRuntimeBootstrapRunner();

    const scenarios: Array<{
      state: RuntimeInitState;
      errorCode: 'PRECHECK_FAILED' | 'DEPENDENCY_INIT_FAILED';
      run: () => ReturnType<typeof run>;
    }> = [
      {
        state: 'failed_preflight',
        errorCode: 'PRECHECK_FAILED',
        run: () =>
          run({
            config: {
              ...missingDbPathConfig(),
              MCP_PORT: 6155,
            },
            initDependency: () => ({ name: 'sqlite' }),
          }),
      },
      {
        state: 'failed_dependencies',
        errorCode: 'DEPENDENCY_INIT_FAILED',
        run: () =>
          run({
            config: {
              ...validInitConfig(),
              MCP_PORT: 6156,
            },
            initDependency: () => {
              throw new Error('dependency exploded');
            },
          }),
      },
    ];

    for (const scenario of scenarios) {
      const result = scenario.run();
      expect(result).toMatchObject({
        ok: false,
        state: scenario.state,
        errorCode: scenario.errorCode,
      });
    }
  });
});

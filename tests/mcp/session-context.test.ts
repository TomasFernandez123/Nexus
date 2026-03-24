import { describe, expect, it, afterEach } from 'vitest';
import { SessionContextResolver } from '../../src/mcp/session-context.js';

describe('session context resolver', () => {
  afterEach(() => {
    delete process.env.NEXUS_WORKSPACE;
  });

  it('uses NEXUS_WORKSPACE env var as highest priority', () => {
    process.env.NEXUS_WORKSPACE = '/env/workspace';
    const resolver = new SessionContextResolver(() => '/process/fallback');

    resolver.registerInitialize({
      capabilities: { roots: {} },
      roots: [{ path: '/workspace/project-a' }],
      cwd: '/workspace/client-project',
    });

    expect(resolver.resolve()).toEqual({
      activeRoot: '/env/workspace',
      resolutionSource: 'env',
    });
  });

  it('uses roots first when initialize provides roots capability and roots list', () => {
    const resolver = new SessionContextResolver(() => '/process/fallback');

    resolver.registerInitialize({
      capabilities: { roots: {} },
      roots: [{ path: '/workspace/project-a' }],
    });

    expect(resolver.resolve()).toEqual({
      activeRoot: '/workspace/project-a',
      resolutionSource: 'roots',
    });
  });

  it('invalidates and resolves new root when roots list changes', () => {
    const resolver = new SessionContextResolver(() => '/process/fallback');

    resolver.registerInitialize({
      capabilities: { roots: {} },
      roots: [{ path: '/workspace/project-a' }],
    });
    expect(resolver.resolve().activeRoot).toBe('/workspace/project-a');

    resolver.registerRootsListChanged({
      roots: [{ path: '/workspace/project-b' }],
    });

    expect(resolver.resolve()).toEqual({
      activeRoot: '/workspace/project-b',
      resolutionSource: 'roots',
    });
  });

  it('falls back to process cwd when roots capability is unavailable', () => {
    const resolver = new SessionContextResolver(() => '/process/fallback');

    resolver.registerInitialize({ capabilities: { tools: {} } });

    expect(resolver.resolve()).toEqual({
      activeRoot: '/process/fallback',
      resolutionSource: 'process',
    });
  });

  it('uses client cwd when initialize provides no roots', () => {
    const resolver = new SessionContextResolver(() => '/process/fallback');

    resolver.registerInitialize({
      capabilities: { tools: {} },
      cwd: '/workspace/client-project',
    });

    expect(resolver.resolve()).toEqual({
      activeRoot: '/workspace/client-project',
      resolutionSource: 'client',
    });
  });

  it('prioritizes roots over client cwd when both are provided', () => {
    const resolver = new SessionContextResolver(() => '/process/fallback');

    resolver.registerInitialize({
      capabilities: { roots: {} },
      cwd: '/workspace/client-project',
      roots: [{ path: '/workspace/project-a' }],
    });

    expect(resolver.resolve()).toEqual({
      activeRoot: '/workspace/project-a',
      resolutionSource: 'roots',
    });
  });
});

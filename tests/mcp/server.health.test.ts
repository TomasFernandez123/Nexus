import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startMcpServer } from '../../src/mcp/server.js';
import { resetRuntimeForTests } from '../../src/runtime/index.js';

const originalEnv = process.env;

describe('mcp server health endpoint', () => {
  beforeEach(() => {
    resetRuntimeForTests();
    process.env = {
      ...originalEnv,
      NODE_ENV: 'test',
      MCP_PORT: '5077',
      LOG_LEVEL: 'error',
    };
  });

  afterEach(() => {
    resetRuntimeForTests();
    process.env = originalEnv;
  });

  it('responds 200 with ready payload', async () => {
    const handle = await startMcpServer();

    try {
      const response = await fetch('http://127.0.0.1:5077/health');
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toEqual({ ready: true });
    } finally {
      await handle.stop();
    }
  });
});

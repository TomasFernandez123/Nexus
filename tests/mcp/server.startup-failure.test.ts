import { afterEach, describe, expect, it } from 'vitest';
import { startMcpServer } from '../../src/mcp/server.js';
import { resetRuntimeForTests } from '../../src/runtime/index.js';

const originalEnv = process.env;

describe('mcp startup failure', () => {
  afterEach(() => {
    resetRuntimeForTests();
    process.env = originalEnv;
  });

  it('fails startup with descriptive missing env keys and does not start server', async () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: 'test',
    };

    await expect(startMcpServer()).rejects.toThrowError(/Missing required runtime env vars: MCP_PORT, LOG_LEVEL/);
  });
});

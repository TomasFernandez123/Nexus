import type { RuntimeConfig } from '../../../src/runtime/types.js';

export const validInitConfig = (overrides: Partial<RuntimeConfig> = {}): RuntimeConfig => ({
  NODE_ENV: 'test',
  MCP_PORT: 6150,
  LOG_LEVEL: 'error',
  NEXUS_DB_PATH: '.nexus.init.contract.test.db',
  NEXUS_EFFECTIVE_CWD: process.cwd(),
  NEXUS_PROJECT_NAMESPACE: 'nexus.init.contract.test-0000000000000000',
  NEXUS_READ_TOOL_TIMEOUT_MS: 15000,
  ...overrides,
});

export const missingDbPathConfig = (): RuntimeConfig =>
  validInitConfig({
    NEXUS_DB_PATH: '',
  });

export const invalidPortConfig = (): RuntimeConfig =>
  validInitConfig({
    MCP_PORT: Number.NaN,
  });

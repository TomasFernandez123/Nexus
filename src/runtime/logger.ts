import type { Logger, RuntimeConfig } from './types.js';

const LEVEL_ORDER: Record<RuntimeConfig['LOG_LEVEL'], number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const shouldLog = (current: RuntimeConfig['LOG_LEVEL'], level: RuntimeConfig['LOG_LEVEL']): boolean =>
  LEVEL_ORDER[level] >= LEVEL_ORDER[current];

const serializeMeta = (meta?: Record<string, unknown>): string => (meta ? ` ${JSON.stringify(meta)}` : '');

export const createLogger = (level: RuntimeConfig['LOG_LEVEL']): Logger => ({
  debug(msg: string, meta?: Record<string, unknown>) {
    if (shouldLog(level, 'debug')) {
      // eslint-disable-next-line no-console
      console.debug(`[debug] ${msg}${serializeMeta(meta)}`);
    }
  },
  info(msg: string, meta?: Record<string, unknown>) {
    if (shouldLog(level, 'info')) {
      // eslint-disable-next-line no-console
      console.info(`[info] ${msg}${serializeMeta(meta)}`);
    }
  },
  warn(msg: string, meta?: Record<string, unknown>) {
    if (shouldLog(level, 'warn')) {
      // eslint-disable-next-line no-console
      console.warn(`[warn] ${msg}${serializeMeta(meta)}`);
    }
  },
  error(msg: string, meta?: Record<string, unknown>) {
    if (shouldLog(level, 'error')) {
      // eslint-disable-next-line no-console
      console.error(`[error] ${msg}${serializeMeta(meta)}`);
    }
  },
});

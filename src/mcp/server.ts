import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import type { Readable, Writable } from 'node:stream';
import path from 'node:path';
import { getMcpRuntimeDepsForRoot } from '../runtime/index.js';
import { createLifecycleController, resolveTerminalDecision } from '../runtime/index.js';
import type { LifecyclePhase } from '../runtime/index.js';
import { SessionContextResolver, type EffectiveSessionContext } from './session-context.js';
import {
  toCanonicalError,
  toCanonicalTask,
  toCanonicalTaskCompletion,
  toCanonicalTaskList,
  toCanonicalTaskLog,
} from '../contracts/step2.js';
import { DomainError } from '../tasks/types.js';
import { positiveIntegerFieldMessage } from '../cli/messages.js';

export interface MpcServerHandle {
  server: http.Server;
  stop: () => Promise<void>;
}

export interface StartMcpServerOptions {
  mode?: 'http' | 'stdio';
  input?: Readable;
  output?: Writable;
  onLifecyclePhaseChange?: (phase: LifecyclePhase) => void;
}

const healthPayload = JSON.stringify({ ready: true });

const MCP_STDIO_HANDSHAKE = {
  protocolVersion: '2024-11-05',
  capabilities: { tools: {} },
  serverInfo: { name: 'nexuscli', version: '0.1.0' },
};

const MCP_TOOL_DEFINITIONS = [
  {
    name: 'task_list_pending',
    description: "Returns all tasks with status 'todo' or 'in_progress'",
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Page size (default 100, max 500)' },
        cursor: {
          oneOf: [{ type: 'string' }, { type: 'number' }],
          description: 'Cursor from previous page (task id)',
        },
      },
    },
  },
  {
    name: 'task_start',
    description: "Changes task status to 'in_progress'",
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'number', description: 'Task ID' } },
      required: ['id'],
    },
  },
  {
    name: 'task_add_log',
    description: 'Adds a technical log entry to a task',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'number', description: 'Task ID' },
        message: { type: 'string', description: 'Log content' },
      },
      required: ['id', 'message'],
    },
  },
  {
    name: 'task_complete',
    description: "Marks task as 'done' and triggers local git commit",
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'number', description: 'Task ID' } },
      required: ['id'],
    },
  },
  {
    name: 'task_create',
    description: 'Creates a new task in the backlog',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['feat', 'fix', 'chore', 'refactor', 'docs'] },
        title: { type: 'string' },
      },
      required: ['type', 'title'],
    },
  },
  {
    name: 'runtime_info',
    description: 'Returns effective MCP runtime diagnostics',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'db_init',
    description: 'Initializes local database schema',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'db_check',
    description: 'Checks local database readiness',
    inputSchema: { type: 'object', properties: {} },
  },
] as const;

const readJsonBody = async (req: IncomingMessage): Promise<Record<string, unknown>> => {
  const chunks: Buffer[] = [];

  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }

  if (chunks.length === 0) return {};

  const raw = Buffer.concat(chunks).toString('utf8');
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new DomainError('VALIDATION_ERROR', 'Invalid JSON body');
  }
};

const success = (data: unknown): string => JSON.stringify(data);
const failure = (error: { error: string; code: string }): string => JSON.stringify(error);

const parseTaskId = (value: unknown, fieldName = 'id'): number => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new DomainError('VALIDATION_ERROR', positiveIntegerFieldMessage(fieldName, value));
  }
  return parsed;
};

const parseCanonicalId = (input: Record<string, unknown>): number => {
  const value = input.id ?? input.taskId;
  const fieldName = input.id !== undefined ? 'id' : 'taskId';
  return parseTaskId(value, fieldName);
};

const parseText = (value: unknown): string => {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new DomainError('VALIDATION_ERROR', 'text must be a non-empty string');
  }
  return value.trim();
};

const DEFAULT_PENDING_PAGE_LIMIT = 100;
const MAX_PENDING_PAGE_LIMIT = 500;

const hasOwn = (input: Record<string, unknown>, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(input, key);

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const toStructuredContentRecord = (payload: unknown): Record<string, unknown> => {
  if (isPlainRecord(payload)) {
    return payload;
  }

  if (Array.isArray(payload)) {
    return { items: payload };
  }

  return { value: payload ?? null };
};

const parsePendingLimit = (value: unknown): number => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new DomainError('VALIDATION_ERROR', 'limit must be a positive integer');
  }

  if (parsed > MAX_PENDING_PAGE_LIMIT) {
    throw new DomainError('VALIDATION_ERROR', `limit must be <= ${MAX_PENDING_PAGE_LIMIT}`);
  }

  return parsed;
};

const parsePendingCursor = (value: unknown): string => {
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new DomainError('VALIDATION_ERROR', 'cursor must be a positive integer');
  }

  const normalized = String(value).trim();
  const parsed = Number(normalized);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new DomainError('VALIDATION_ERROR', 'cursor must be a positive integer');
  }

  return normalized;
};

type McpRuntime = ReturnType<typeof getMcpRuntimeDepsForRoot>;

const resolveProcessFallbackRoot = (): string => {
  const legacyClientCwd = process.env.NEXUS_CLIENT_CWD?.trim();
  return path.resolve(legacyClientCwd && legacyClientCwd.length > 0 ? legacyClientCwd : process.cwd());
};

const nowMs = (): number => Date.now();

const elapsedMs = (start: number): number => Date.now() - start;

const traceTaskListPending = (
  runtime: McpRuntime,
  stage: 'start' | 'db_open' | 'query' | 'scan' | 'return' | 'end' | 'error',
  meta?: Record<string, unknown>,
): void => {
  runtime.logger.debug(`mcp.task_list_pending.${stage}`, meta);
};

const withTimeout = async <T>(
  operation: () => Promise<T> | T,
  timeoutMs: number,
  message: string,
): Promise<T> => {
  let timer: NodeJS.Timeout | null = null;
  try {
    return await Promise.race([
      Promise.resolve().then(operation),
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(message));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
};

const ensureMcpRuntimeReady = (runtime: McpRuntime): void => {
  runtime.dbBootstrapService.init();
  runtime.taskService.init();
};

const TOOLS_REQUIRING_AUTO_INIT = new Set([
  'task_create',
  'task_list_pending',
  'task_start',
  'task_add_log',
  'task_complete',
]);

const handleToolCall = async (
  runtime: McpRuntime,
  sessionContext: EffectiveSessionContext,
  body: Record<string, unknown>,
): Promise<{ status: number; payload: unknown }> => {
  const tool = body.tool;
  const input = (body.input ?? {}) as Record<string, unknown>;

  if (typeof tool !== 'string' || tool.trim() === '') {
    throw new DomainError('VALIDATION_ERROR', 'tool is required');
  }

  if (TOOLS_REQUIRING_AUTO_INIT.has(tool)) {
    ensureMcpRuntimeReady(runtime);
  }

  switch (tool) {
    case 'task_create': {
      const title = input.title;
      const type = input.type;
      if (typeof title !== 'string' || title.trim() === '') {
        throw new DomainError('TITLE_REQUIRED', 'Task title is required');
      }
      if (typeof type !== 'string') {
        throw new DomainError('INVALID_TASK_TYPE', `Invalid task type '${String(type)}'.`, {
          allowed: ['feat', 'fix', 'chore', 'refactor', 'docs'],
        });
      }
      const task = runtime.taskService.create({ title: title.trim(), type: type as never });
      const payload = toCanonicalTask(task);
      return { status: 200, payload };
    }
    case 'task_list_pending': {
      const opStart = nowMs();
      const dbOpenMs = 0;
      let queryMs = 0;
      let scanMs = 0;

      const limit = hasOwn(input, 'limit') ? parsePendingLimit(input.limit) : DEFAULT_PENDING_PAGE_LIMIT;
      const cursor = hasOwn(input, 'cursor') ? parsePendingCursor(input.cursor) : undefined;

        traceTaskListPending(runtime, 'start', {
          paginated: true,
          limit,
          cursor: cursor ?? null,
          timeout_ms: runtime.config.NEXUS_READ_TOOL_TIMEOUT_MS,
      });

      try {
        traceTaskListPending(runtime, 'db_open', { duration_ms: dbOpenMs, reused_connection: true });

        const queryStart = nowMs();
        const page = await withTimeout(
          () => runtime.taskService.listPendingPage({ limit, cursor }),
          runtime.config.NEXUS_READ_TOOL_TIMEOUT_MS,
          `task_list_pending timeout after ${runtime.config.NEXUS_READ_TOOL_TIMEOUT_MS}ms`,
        );
        queryMs = elapsedMs(queryStart);
        traceTaskListPending(runtime, 'query', {
          duration_ms: queryMs,
          limit,
          cursor: cursor ?? null,
          next_cursor: page.nextCursor,
        });

        const scanStart = nowMs();
        const canonicalTasks = toCanonicalTaskList(page.items);
        scanMs = elapsedMs(scanStart);
        traceTaskListPending(runtime, 'scan', { duration_ms: scanMs, count: canonicalTasks.length });

        const totalMs = elapsedMs(opStart);
        traceTaskListPending(runtime, 'return', {
          duration_ms: totalMs,
          db_open_ms: dbOpenMs,
          query_ms: queryMs,
          scan_ms: scanMs,
          count: canonicalTasks.length,
          next_cursor: page.nextCursor,
        });
        traceTaskListPending(runtime, 'end', { duration_ms: totalMs });

        return {
          status: 200,
          payload: {
            items: canonicalTasks,
            next_cursor: page.nextCursor,
          },
        };
      } catch (error) {
        traceTaskListPending(runtime, 'error', {
          duration_ms: elapsedMs(opStart),
          db_open_ms: dbOpenMs,
          query_ms: queryMs,
          scan_ms: scanMs,
          error: error instanceof Error ? error.message : String(error),
        });

        throw error;
      }
    }
    case 'task_start': {
      const task = runtime.taskService.start(parseCanonicalId(input));
      return { status: 200, payload: toCanonicalTask(task) };
    }
    case 'task_add_log': {
      const textInput = input.text ?? input.message;
      const log = runtime.taskService.addLog(parseCanonicalId(input), parseText(textInput));
      return { status: 200, payload: toCanonicalTaskLog(log) };
    }
    case 'task_complete': {
      const result = runtime.taskService.complete(parseCanonicalId(input));
      return { status: 200, payload: toCanonicalTaskCompletion(result) };
    }
    case 'runtime_info': {
      return {
        status: 200,
        payload: {
          cwd: runtime.config.NEXUS_EFFECTIVE_CWD,
          dbPath: runtime.config.NEXUS_DB_PATH,
          projectNamespace: runtime.config.NEXUS_PROJECT_NAMESPACE,
          resolutionSource: sessionContext.resolutionSource,
          nodeVersion: process.version,
          runtime: 'node',
          serverVersion: MCP_STDIO_HANDSHAKE.serverInfo.version,
        },
      };
    }
    case 'db_init': {
      const result = runtime.dbBootstrapService.init();
      runtime.taskService.init();
      return { status: 200, payload: result };
    }
    case 'db_check': {
      const result = await withTimeout(
        () => runtime.dbBootstrapService.check(),
        runtime.config.NEXUS_READ_TOOL_TIMEOUT_MS,
        `db_check timeout after ${runtime.config.NEXUS_READ_TOOL_TIMEOUT_MS}ms`,
      );
      return { status: 200, payload: result };
    }
    default:
      throw new DomainError('VALIDATION_ERROR', `Unsupported tool '${tool}'`);
  }
};

const requestHandler = (contextResolver: SessionContextResolver) => async (
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> => {
  if (req.url === '/health' && req.method === 'GET') {
    res.statusCode = 200;
    res.setHeader('content-type', 'application/json');
    res.end(healthPayload);
    return;
  }

  if (req.url === '/tools/call' && req.method === 'POST') {
    res.setHeader('content-type', 'application/json');

    try {
      const body = await readJsonBody(req);
      const sessionContext = contextResolver.resolve();
      const runtime = getMcpRuntimeDepsForRoot(sessionContext.activeRoot);
      const result = await handleToolCall(runtime, sessionContext, body);
      res.statusCode = result.status;
      res.end(success(result.payload));
      return;
    } catch (error) {
      if (error instanceof DomainError) {
        res.statusCode = 400;
        res.end(failure(toCanonicalError(error)));
        return;
      }

      res.statusCode = 500;
      res.end(
        failure({
          error: error instanceof Error ? error.message : String(error),
          code: 'VALIDATION_ERROR',
        }),
      );
      return;
    }
  }

  res.statusCode = 404;
  res.end('Not found');
};

type StdioMessageKind =
  | { kind: 'initialize'; id?: unknown; params: Record<string, unknown> }
  | { kind: 'initialized'; id?: unknown }
  | { kind: 'roots/list'; id?: unknown; params: Record<string, unknown> }
  | { kind: 'roots/list_changed'; id?: unknown; params: Record<string, unknown> }
  | { kind: 'ping'; id?: unknown }
  | { kind: 'tools/list'; id?: unknown }
  | { kind: 'tools/call'; id?: unknown; payload: Record<string, unknown> };

type McpCallToolContentText = { type: 'text'; text: string };

type McpCallToolResult = {
  content: McpCallToolContentText[];
  structuredContent: Record<string, unknown>;
  isError?: boolean;
};

const toMcpCallToolResult = (payload: unknown, isError = false): McpCallToolResult => {
  const result: McpCallToolResult = {
    content: [{ type: 'text', text: JSON.stringify(payload) }],
    structuredContent: toStructuredContentRecord(payload),
  };

  if (isError) {
    result.isError = true;
  }

  return result;
};

const isToolCallRequestPayload = (payload: Record<string, unknown> | null): boolean => {
  if (!payload) return false;

  const method = payload.method;
  const type = payload.type;
  const tool = payload.tool;

  return method === 'tools/call' || type === 'tools/call' || typeof tool === 'string';
};

const parseStdioMessage = (line: string): StdioMessageKind => {
  let parsed: Record<string, unknown>;

  try {
    parsed = JSON.parse(line) as Record<string, unknown>;
  } catch {
    throw new DomainError('VALIDATION_ERROR', 'Invalid JSON line in MCP stdio stream');
  }

  const id = parsed.id;
  const method = parsed.method;
  const type = parsed.type;
  const params = (parsed.params ?? {}) as Record<string, unknown>;

  if (method === 'initialize' || type === 'initialize') {
    return { kind: 'initialize', id, params };
  }

  if (method === 'notifications/initialized' || type === 'notifications/initialized') {
    return { kind: 'initialized', id };
  }

  if (method === 'roots/list' || type === 'roots/list') {
    return { kind: 'roots/list', id, params };
  }

  if (method === 'notifications/roots/list_changed' || type === 'notifications/roots/list_changed') {
    return { kind: 'roots/list_changed', id, params };
  }

  if (method === 'ping' || type === 'ping') {
    return { kind: 'ping', id };
  }

  if (method === 'tools/list' || type === 'tools/list') {
    return { kind: 'tools/list', id };
  }

  if (method === 'tools/call' || type === 'tools/call') {
    return {
      kind: 'tools/call',
      id,
      payload: {
        tool: params.name ?? params.tool,
        input: (params.arguments ?? params.input ?? {}) as Record<string, unknown>,
      },
    };
  }

  if (typeof parsed.tool === 'string') {
    return {
      kind: 'tools/call',
      id,
      payload: {
        tool: parsed.tool,
        input: (parsed.input ?? {}) as Record<string, unknown>,
      },
    };
  }

  throw new DomainError('VALIDATION_ERROR', 'Unsupported MCP stdio request');
};

const withId = (id: unknown, payload: unknown, key: 'result' | 'error' = 'result'): Record<string, unknown> => {
  const envelope: Record<string, unknown> = { jsonrpc: '2.0', [key]: payload };
  if (id !== undefined) {
    envelope.id = id;
  }
  return envelope;
};

type StdioTransportMode = 'line' | 'framed';

const CONTENT_LENGTH_HEADER = 'content-length:';
const HEADER_SEPARATOR = Buffer.from('\r\n\r\n', 'utf8');

const extractContentLength = (headers: string): number | null => {
  const contentLengthLine = headers
    .split('\r\n')
    .find((line) => line.toLowerCase().startsWith(CONTENT_LENGTH_HEADER));

  if (!contentLengthLine) return null;

  const rawValue = contentLengthLine.slice(CONTENT_LENGTH_HEADER.length).trim();
  const value = Number(rawValue);
  if (!Number.isInteger(value) || value < 0) return null;

  return value;
};

const nextStdioPayload = (
  buffer: Buffer,
): { mode: StdioTransportMode; payload: string; rest: Buffer } | null => {
  const preview = buffer.toString('utf8', 0, Math.min(buffer.length, 64)).trimStart().toLowerCase();
  const couldBeFramed = preview.startsWith(CONTENT_LENGTH_HEADER);

  if (couldBeFramed) {
    const headerEnd = buffer.indexOf(HEADER_SEPARATOR);
    if (headerEnd === -1) {
      return null;
    }

    const headers = buffer.slice(0, headerEnd).toString('utf8');
    const contentLength = extractContentLength(headers);
    if (contentLength === null) {
      throw new DomainError('VALIDATION_ERROR', 'Invalid MCP stdio Content-Length header');
    }

    const bodyStart = headerEnd + HEADER_SEPARATOR.length;
    const bodyEnd = bodyStart + contentLength;
    if (buffer.length < bodyEnd) {
      return null;
    }

    return {
      mode: 'framed',
      payload: buffer.slice(bodyStart, bodyEnd).toString('utf8'),
      rest: buffer.slice(bodyEnd),
    };
  }

  const newlineIndex = buffer.indexOf(0x0a);
  if (newlineIndex === -1) {
    return null;
  }

  const line = buffer
    .slice(0, newlineIndex)
    .toString('utf8')
    .trim();

  return {
    mode: 'line',
    payload: line,
    rest: buffer.slice(newlineIndex + 1),
  };
};

const writeStdioLine = (output: Writable, payload: unknown, mode: StdioTransportMode): void => {
  const body = JSON.stringify(payload);
  if (mode === 'framed') {
    output.write(`Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n${body}`);
    return;
  }

  output.write(`${body}\n`);
};

const startStdioServer = async (options: StartMcpServerOptions = {}): Promise<MpcServerHandle> => {
  const contextResolver = new SessionContextResolver(resolveProcessFallbackRoot);
  const lifecycle = createLifecycleController(options.onLifecyclePhaseChange);
  const input = options.input ?? process.stdin;
  const output = options.output ?? process.stdout;
  const server = http.createServer();

  lifecycle.transitionToRunning();

  let stopped = false;
  let transportMode: StdioTransportMode = 'line';

  const stop = async (signal?: NodeJS.Signals): Promise<void> => {
    if (stopped) return;
    stopped = true;
    lifecycle.transitionToShutdown();
    process.off('SIGINT', onSigInt);
    process.off('SIGTERM', onSigTerm);
    if (signal) {
      const decision = resolveTerminalDecision({ signal });
      process.exitCode = decision.exitCode;
    }
    lifecycle.transitionToTerminated();
  };

  const onSigInt = (): void => {
    void stop('SIGINT');
  };

  const onSigTerm = (): void => {
    void stop('SIGTERM');
  };

  process.on('SIGINT', onSigInt);
  process.on('SIGTERM', onSigTerm);

  void (async () => {
    let buffer: Buffer = Buffer.alloc(0) as Buffer;

    try {
      for await (const chunk of input) {
        if (stopped) break;
        const chunkBuffer = typeof chunk === 'string' ? Buffer.from(chunk) : Buffer.from(chunk);
        buffer = Buffer.concat([buffer, chunkBuffer]) as Buffer;

        while (!stopped) {
          const next = nextStdioPayload(buffer as Buffer);
          if (!next) break;

          buffer = next.rest as Buffer;
          if (next.payload.length === 0) continue;
          transportMode = next.mode;

          let parsedForId: Record<string, unknown> | null = null;
          try {
            parsedForId = JSON.parse(next.payload) as Record<string, unknown>;
          } catch {
            parsedForId = null;
          }

          const isToolCallRequest = isToolCallRequestPayload(parsedForId);

          try {
            const message = parseStdioMessage(next.payload);

            if (message.kind === 'initialized') {
              continue;
            }

            if (message.kind === 'ping') {
              writeStdioLine(output, withId(message.id, {}), transportMode);
              continue;
            }

            if (message.kind === 'initialize') {
              contextResolver.registerInitialize(message.params);
              writeStdioLine(output, withId(message.id, MCP_STDIO_HANDSHAKE), transportMode);
              continue;
            }

            if (message.kind === 'roots/list') {
              contextResolver.registerRootsListChanged(message.params);
              writeStdioLine(output, withId(message.id, {}), transportMode);
              continue;
            }

            if (message.kind === 'roots/list_changed') {
              contextResolver.registerRootsListChanged(message.params);
              if (message.id !== undefined) {
                writeStdioLine(output, withId(message.id, {}), transportMode);
              }
              continue;
            }

            if (message.kind === 'tools/list') {
              writeStdioLine(output, withId(message.id, { tools: MCP_TOOL_DEFINITIONS }), transportMode);
              continue;
            }

            if (message.kind === 'tools/call') {
              const sessionContext = contextResolver.resolve();
              const runtime = getMcpRuntimeDepsForRoot(sessionContext.activeRoot);
              const result = await handleToolCall(runtime, sessionContext, message.payload);
              writeStdioLine(output, withId(message.id, toMcpCallToolResult(result.payload)), transportMode);
            }
          } catch (error) {
            const requestId = parsedForId?.id;
            if (isToolCallRequest) {
              if (error instanceof DomainError) {
                writeStdioLine(
                  output,
                  withId(requestId, toMcpCallToolResult(toCanonicalError(error), true)),
                  transportMode,
                );
                continue;
              }

              const decision = resolveTerminalDecision({ error });
              writeStdioLine(
                output,
                withId(
                  requestId,
                  toMcpCallToolResult(
                    {
                      code: decision.category === 'infrastructure' ? 'INFRASTRUCTURE_ERROR' : 'VALIDATION_ERROR',
                      error: error instanceof Error ? error.message : String(error),
                    },
                    true,
                  ),
                ),
                transportMode,
              );
              continue;
            }

            if (error instanceof DomainError) {
              writeStdioLine(output, withId(requestId, toCanonicalError(error), 'error'), transportMode);
              continue;
            }

            const decision = resolveTerminalDecision({ error });
            writeStdioLine(
              output,
              withId(
                requestId,
                {
                  code: decision.category === 'infrastructure' ? 'INFRASTRUCTURE_ERROR' : 'VALIDATION_ERROR',
                  error: error instanceof Error ? error.message : String(error),
                },
                'error',
              ),
              transportMode,
            );
          }
        }
      }
    } finally {
      await stop();
    }
  })();

  return { server, stop };
};

export const startMcpServer = async (options: StartMcpServerOptions = {}): Promise<MpcServerHandle> => {
  if (options.mode === 'stdio') {
    return startStdioServer(options);
  }

  const contextResolver = new SessionContextResolver(resolveProcessFallbackRoot);
  const runtime = getMcpRuntimeDepsForRoot(resolveProcessFallbackRoot());
  const port = runtime.config.MCP_PORT;
  if (port === undefined) {
    throw new Error('MCP_PORT is required only for HTTP mode. Set MCP_PORT to start the HTTP MCP server.');
  }
  const lifecycle = createLifecycleController(options.onLifecyclePhaseChange);
  const server = http.createServer(requestHandler(contextResolver));
  lifecycle.transitionToRunning();

  let stopped = false;
  let stopPromise: Promise<void> | null = null;

  const stop = (): Promise<void> => {
    if (stopPromise) return stopPromise;
    stopPromise = new Promise<void>((resolve, reject) => {
      if (stopped) {
        resolve();
        return;
      }

      stopped = true;
      lifecycle.transitionToShutdown();
      process.off('SIGINT', onSigInt);
      process.off('SIGTERM', onSigTerm);
      server.close((error) => {
        lifecycle.transitionToTerminated();
        if (error) reject(error);
        else resolve();
      });
    });

    return stopPromise;
  };

  const onSigInt = (): void => {
    const decision = resolveTerminalDecision({ signal: 'SIGINT' });
    process.exitCode = decision.exitCode;
    void stop();
  };

  const onSigTerm = (): void => {
    const decision = resolveTerminalDecision({ signal: 'SIGTERM' });
    process.exitCode = decision.exitCode;
    void stop();
  };

  await new Promise<void>((resolve) => {
    server.listen(port, resolve);
  });

  process.on('SIGINT', onSigInt);
  process.on('SIGTERM', onSigTerm);

  runtime.logger.info('MCP server started', { port });

  return {
    server,
    stop,
  };
};

if (import.meta.url === `file://${process.argv[1]}`) {
  startMcpServer().catch((error) => {
    // eslint-disable-next-line no-console
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

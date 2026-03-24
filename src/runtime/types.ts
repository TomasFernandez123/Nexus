export interface RuntimeConfig {
  NODE_ENV: 'development' | 'test' | 'production';
  MCP_PORT?: number;
  LOG_LEVEL: 'debug' | 'info' | 'warn' | 'error';
  NEXUS_DB_PATH: string;
  NEXUS_EFFECTIVE_CWD: string;
  NEXUS_PROJECT_NAMESPACE: string;
  NEXUS_READ_TOOL_TIMEOUT_MS: number;
}

export type RuntimeInitState =
  | 'idle'
  | 'preflight'
  | 'dependencies'
  | 'ready'
  | 'failed_preflight'
  | 'failed_dependencies';

export type RuntimeInitErrorCode =
  | 'PRECHECK_FAILED'
  | 'INVALID_CONFIG'
  | 'DEPENDENCY_TIMEOUT'
  | 'DEPENDENCY_INIT_FAILED'
  | 'INIT_CONTRACT_VIOLATION';

export interface RuntimeInitResult {
  state: RuntimeInitState;
  ok: boolean;
  errorCode?: RuntimeInitErrorCode;
  message?: string;
}

export interface Logger {
  info(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  debug(msg: string, meta?: Record<string, unknown>): void;
}

export interface TaskRecord {
  id: number;
  title: string;
  description: string | null;
  type: 'feat' | 'fix' | 'chore' | 'refactor' | 'docs';
  state: 'pending' | 'in_progress' | 'done';
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  commitHash: string | null;
  commitMessage: string | null;
}

export interface TaskLogRecord {
  id: number;
  taskId: number;
  text: string;
  createdAt: string;
}

export interface GitCommitResult {
  hash: string;
  message: string;
}

export interface TaskService {
  init(): void;
  create(input: { title: string; description?: string; type: 'feat' | 'fix' | 'chore' | 'refactor' | 'docs' }): TaskRecord;
  listPending(): TaskRecord[];
  listPendingPage(input: { limit: number; cursor?: string | number }): {
    items: TaskRecord[];
    nextCursor: string | null;
  };
  start(taskId: number): TaskRecord;
  addLog(taskId: number, text: string): TaskLogRecord;
  complete(taskId: number): { task: TaskRecord; commit: GitCommitResult };
}

export interface DbBootstrapService {
  init(): { status: 'initialized' | 'already_initialized'; dbPath: string; schemaVersion: string };
  check(): { status: 'ready'; dbPath: string; schemaVersion: string };
}

export interface RuntimeDeps {
  config: RuntimeConfig;
  logger: Logger;
  taskService: TaskService;
  dbBootstrapService: DbBootstrapService;
}

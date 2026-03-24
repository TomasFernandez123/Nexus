export type RuntimeInitErrorCode =
  | 'PRECHECK_FAILED'
  | 'INVALID_CONFIG'
  | 'DEPENDENCY_TIMEOUT'
  | 'DEPENDENCY_INIT_FAILED'
  | 'INIT_CONTRACT_VIOLATION';

export class RuntimeInitError extends Error {
  constructor(
    public readonly code: RuntimeInitErrorCode,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'RuntimeInitError';
  }
}

export type RuntimeInitState =
  | 'idle'
  | 'preflight'
  | 'dependencies'
  | 'ready'
  | 'failed_preflight'
  | 'failed_dependencies';

const ALLOWED_TRANSITIONS: Record<RuntimeInitState, ReadonlyArray<RuntimeInitState>> = {
  idle: ['preflight'],
  preflight: ['dependencies', 'failed_preflight'],
  dependencies: ['ready', 'failed_dependencies'],
  ready: [],
  failed_preflight: [],
  failed_dependencies: [],
};

export class RuntimeInitContractError extends Error {
  constructor(
    public readonly from: RuntimeInitState,
    public readonly to: RuntimeInitState,
  ) {
    super(`Invalid runtime init transition: '${from}' -> '${to}'`);
    this.name = 'RuntimeInitContractError';
  }
}

export const assertRuntimeInitTransition = (from: RuntimeInitState, to: RuntimeInitState): void => {
  if (!ALLOWED_TRANSITIONS[from].includes(to)) {
    throw new RuntimeInitContractError(from, to);
  }
};

import path from 'node:path';
import { fileURLToPath } from 'node:url';

export type ResolutionSource = 'env' | 'roots' | 'client' | 'process';

export interface EffectiveSessionContext {
  activeRoot: string;
  resolutionSource: ResolutionSource;
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

const asRootPath = (entry: unknown): string | null => {
  if (typeof entry === 'string' && entry.trim() !== '') {
    const normalized = entry.trim();
    if (normalized.startsWith('file://')) {
      try {
        return path.resolve(fileURLToPath(new URL(normalized)));
      } catch {
        return null;
      }
    }

    return path.resolve(normalized);
  }

  const record = asRecord(entry);
  if (!record) return null;

  if (typeof record.path === 'string' && record.path.trim() !== '') {
    return path.resolve(record.path.trim());
  }

  if (typeof record.uri === 'string' && record.uri.trim() !== '') {
    try {
      const parsed = new URL(record.uri);
      if (parsed.protocol === 'file:') {
        return path.resolve(fileURLToPath(parsed));
      }
    } catch {
      return null;
    }
  }

  return null;
};

const extractClientRoot = (payload: unknown): string | null => {
  const record = asRecord(payload);
  if (!record) return null;

  const clientInfo = asRecord(record.clientInfo);
  const candidates: unknown[] = [
    record.cwd,
    record.clientCwd,
    record.rootPath,
    record.rootUri,
    clientInfo?.cwd,
    clientInfo?.rootPath,
    clientInfo?.rootUri,
  ];

  for (const candidate of candidates) {
    const resolved = asRootPath(candidate);
    if (resolved) {
      return resolved;
    }
  }

  return null;
};

const extractRoots = (payload: unknown): string[] => {
  const record = asRecord(payload);
  if (!record) return [];

  const rootsValue = Array.isArray(record.roots)
    ? record.roots
    : Array.isArray(asRecord(record.result)?.roots)
      ? (asRecord(record.result)?.roots as unknown[])
      : [];

  const roots = rootsValue
    .map((entry) => asRootPath(entry))
    .filter((entry): entry is string => typeof entry === 'string');

  return [...new Set(roots)];
};

const hasRootsCapability = (payload: unknown): boolean => {
  const record = asRecord(payload);
  if (!record) return false;

  const capabilities = asRecord(record.capabilities);
  if (!capabilities) return false;
  return asRecord(capabilities.roots) !== null;
};

export class SessionContextResolver {
  private rootsCapability = false;
  private knownRoots: string[] = [];
  private clientRoot: string | null = null;
  private cache: EffectiveSessionContext | null = null;
  private rootsVersion = 0;
  private resolvedVersion = -1;

  constructor(private readonly processRoot: () => string = () => path.resolve(process.cwd())) {}

  registerInitialize(params: Record<string, unknown>): void {
    this.rootsCapability = hasRootsCapability(params);
    this.knownRoots = extractRoots(params);
    this.clientRoot = extractClientRoot(params);
    this.invalidate();
  }

  registerRootsListChanged(params: Record<string, unknown>): void {
    this.rootsCapability = true;
    this.knownRoots = extractRoots(params);
    this.invalidate();
  }

  resolve(): EffectiveSessionContext {
    if (this.cache && this.resolvedVersion === this.rootsVersion) {
      return this.cache;
    }

    const next = this.resolveFresh();
    this.cache = next;
    this.resolvedVersion = this.rootsVersion;
    return next;
  }

  private resolveFresh(): EffectiveSessionContext {
    const envWorkspace = process.env.NEXUS_WORKSPACE?.trim();
    if (envWorkspace) {
      return {
        activeRoot: path.resolve(envWorkspace),
        resolutionSource: 'env',
      };
    }

    if (this.rootsCapability && this.knownRoots.length > 0) {
      return {
        activeRoot: this.knownRoots[0],
        resolutionSource: 'roots',
      };
    }

    if (this.clientRoot) {
      return {
        activeRoot: this.clientRoot,
        resolutionSource: 'client',
      };
    }

    return {
      activeRoot: this.processRoot(),
      resolutionSource: 'process',
    };
  }

  private invalidate(): void {
    this.cache = null;
    this.rootsVersion += 1;
  }
}

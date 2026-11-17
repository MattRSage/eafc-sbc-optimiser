export type InventorySource = 'club' | 'sbc-storage';
export type Coverage = 'not-started' | 'partial' | 'complete' | 'not-implemented';
export type ImportStatus = 'idle' | 'running' | 'cancelled' | 'partial' | 'complete' | 'failed';
export type ImportProblem = 'authentication' | 'rate-limit' | 'service' | 'malformed' | 'repeated-page' | 'request-limit' | 'timeout' | 'conflicting-instance';

export interface OwnedInstance {
  instanceId: string;
  definitionId: string;
  name: string | null;
  rating: number | null;
  position: string | null;
  tradeable: boolean | null;
  provenance: { kind: 'synthetic-service' | 'internal-inventory-service'; source: InventorySource };
}

export interface ImportSnapshot {
  status: ImportStatus;
  items: OwnedInstance[];
  coverage: Record<InventorySource, Coverage>;
  requests: number;
  pages: number;
  problem: ImportProblem | null;
}

/** Adapter results are untrusted. Only normalized inventory fields cross this boundary. */
export interface InventoryService {
  readonly evidence: OwnedInstance['provenance']['kind'];
  readClubPage(request: { cursor: string | null; signal: AbortSignal }): Promise<unknown>;
}

export class InventoryServiceError extends Error {
  constructor(readonly code: 'authentication' | 'rate-limit' | 'service') {
    super(code);
  }
}

export function idleImport(): ImportSnapshot {
  return { status: 'idle', items: [], coverage: { club: 'not-started', 'sbc-storage': 'not-implemented' }, requests: 0, pages: 0, problem: null };
}

type Page = { items: Omit<OwnedInstance, 'provenance'>[]; nextCursor: string | null };
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const id = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
function parsePage(value: unknown): Page {
  if (!record(value) || !Array.isArray(value.items) || !(value.nextCursor === null || id(value.nextCursor))) throw new Error('malformed');
  const items = value.items.map((item): Page['items'][number] => {
    if (!record(item) || !id(item.instanceId) || !id(item.definitionId)) throw new Error('malformed');
    if (item.name != null && !id(item.name)) throw new Error('malformed');
    if (item.position != null && !id(item.position)) throw new Error('malformed');
    if (item.rating != null && (typeof item.rating !== 'number' || !Number.isInteger(item.rating) || item.rating < 0 || item.rating > 99)) throw new Error('malformed');
    if (item.tradeable != null && typeof item.tradeable !== 'boolean') throw new Error('malformed');
    return {
      instanceId: item.instanceId,
      definitionId: item.definitionId,
      name: item.name ?? null,
      position: item.position ?? null,
      rating: item.rating ?? null,
      tradeable: item.tradeable ?? null,
    };
  });
  return { items, nextCursor: value.nextCursor };
}

export interface ImportOptions {
  signal?: AbortSignal;
  maxRequests?: number;
  requestTimeoutMs?: number;
  onProgress?: (snapshot: ImportSnapshot) => void;
}

/** Invoke only from a deliberate import start action; nothing runs on construction. */
export async function importClub(service: InventoryService, options: ImportOptions = {}): Promise<ImportSnapshot> {
  const maxRequests = options.maxRequests ?? 100;
  const timeout = options.requestTimeoutMs ?? 15_000;
  if (!Number.isSafeInteger(maxRequests) || maxRequests < 1 || !Number.isSafeInteger(timeout) || timeout < 1 || timeout > 2_147_483_647) throw new RangeError('Invalid import bounds');
  const state = idleImport();
  const items = new Map<string, OwnedInstance>();
  const cursors = new Set<string>();
  const pages = new Set<string>();
  const snapshot = (): ImportSnapshot => structuredClone({ ...state, items: [...items.values()] });
  const publish = () => { options.onProgress?.(snapshot()); };
  const stop = (problem: ImportProblem): ImportSnapshot => {
    state.problem = problem;
    state.status = state.pages > 0 ? 'partial' : 'failed';
    publish();
    return snapshot();
  };
  const cancel = (): ImportSnapshot => { state.status = 'cancelled'; publish(); return snapshot(); };
  if (options.signal?.aborted) return cancel();
  state.status = 'running';
  state.coverage.club = 'partial';
  publish();
  let cursor: string | null = null;
  while (true) {
    if (options.signal?.aborted) return cancel();
    if (state.requests >= maxRequests) return stop('request-limit');
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let abort = () => {};
    let raw: unknown;
    let timedOut = false;
    state.requests++;
    try {
      const interrupted = new Promise<never>((_, reject) => {
        abort = () => { reject(new Error('cancelled')); controller.abort(); };
        options.signal?.addEventListener('abort', abort, { once: true });
        timer = setTimeout(() => { timedOut = true; reject(new Error('timeout')); controller.abort(); }, timeout);
      });
      raw = await Promise.race([interrupted, service.readClubPage({ cursor, signal: controller.signal })]);
    } catch (error) {
      if (options.signal?.aborted) return cancel();
      return stop(error instanceof InventoryServiceError ? error.code : timedOut ? 'timeout' : 'service');
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', abort);
    }
    if (options.signal?.aborted) return cancel();
    let page: Page;
    try { page = parsePage(raw); } catch { return stop('malformed'); }
    const fingerprint = JSON.stringify(page.items.map(item => item.instanceId).sort());
    if (pages.has(fingerprint) || (page.nextCursor !== null && (page.nextCursor === cursor || cursors.has(page.nextCursor)))) return stop('repeated-page');
    const staged = new Map(items);
    for (const item of page.items) {
      const previous = staged.get(item.instanceId);
      if (previous && previous.definitionId !== item.definitionId) return stop('conflicting-instance');
      if (!previous) staged.set(item.instanceId, { ...item, provenance: { kind: service.evidence, source: 'club' } });
    }
    for (const [key, item] of staged) items.set(key, item);
    pages.add(fingerprint);
    state.pages++;
    if (page.nextCursor === null) {
      state.coverage.club = 'complete';
      state.status = 'complete';
      publish();
      return snapshot();
    }
    cursors.add(page.nextCursor);
    cursor = page.nextCursor;
    publish();
  }
}

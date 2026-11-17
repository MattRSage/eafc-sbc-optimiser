import type { ImportSnapshot, OwnedInstance } from './import';
import { parseSnapshot } from './protocol';

export const verification = 'Live ownership, identity and coverage unverified. Missing records do not imply sale or submission.';
export type Corrections = Partial<Pick<OwnedInstance, 'name' | 'rating' | 'position' | 'tradeable'>>;
export interface SavedItem {
  reported: OwnedInstance;
  protected: boolean;
  corrections: Corrections;
  correctedAt: string | null;
  lastSeen: string;
  freshness: 'seen' | 'missing-unconfirmed' | 'not-rechecked';
}
export interface Profile {
  id: string;
  label: string;
  items: SavedItem[];
  latest: Omit<ImportSnapshot, 'items'> & { savedAt: string } | null;
}
export interface InventoryState { version: 1; profiles: Profile[] }
export const emptyState = (): InventoryState => ({ version: 1, profiles: [] });

export function parseCorrections(value: unknown): Corrections {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Enter a corrections object.');
  const input = value as Record<string, unknown>;
  const result: Corrections = {};
  for (const key of Object.keys(input)) {
    const v = input[key];
    if (key === 'name' || key === 'position') {
      if (v !== null && (typeof v !== 'string' || !v.trim() || v.length > 100)) throw new Error('Text must be 1–100 characters or null.');
      result[key] = v as string | null;
    } else if (key === 'rating') {
      if (v !== null && (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > 99)) throw new Error('Rating must be 1–99 or null.');
      result.rating = v as number | null;
    } else if (key === 'tradeable') {
      if (v !== null && typeof v !== 'boolean') throw new Error('Tradeable must be true, false or null.');
      result.tradeable = v as boolean | null;
    } else throw new Error('Only name, rating, position and tradeable can be corrected.');
  }
  return result;
}

export function reconcile(profile: Profile, raw: unknown, now = new Date().toISOString()): Profile {
  const snapshot = parseSnapshot(raw);
  if (!snapshot || snapshot.status === 'idle' || snapshot.status === 'running') throw new Error('Review a stopped, valid import first.');
  const incoming = new Map<string, OwnedInstance>();
  for (const item of snapshot.items) {
    if (incoming.has(item.instanceId)) throw new Error('Duplicate instance identity in import.');
    incoming.set(item.instanceId, item);
  }
  const items = profile.items.map(previous => {
    const item = incoming.get(previous.reported.instanceId);
    if (!item) return { ...previous, freshness: snapshot.coverage[previous.reported.provenance.source] === 'complete' ? 'missing-unconfirmed' as const : 'not-rechecked' as const };
    if (item.definitionId !== previous.reported.definitionId) throw new Error('Instance definition changed. Check the selected club profile. Nothing was saved.');
    incoming.delete(item.instanceId);
    return { ...previous, reported: item, lastSeen: now, freshness: 'seen' as const };
  });
  for (const item of incoming.values()) items.push({ reported: item, protected: false, corrections: {}, correctedAt: null, lastSeen: now, freshness: 'seen' });
  const { items: _, ...summary } = snapshot;
  return { ...profile, items, latest: { ...summary, savedAt: now } };
}

export const exportFields = ['instanceId', 'definitionId', 'name', 'rating', 'position', 'tradeable', 'nationId', 'leagueId', 'clubId', 'rarityId', 'provenance', 'protected', 'corrections', 'correctedAt', 'lastSeen', 'freshness'] as const;
export type ExportField = typeof exportFields[number];
export function reviewedExport(profile: Profile, fields: readonly ExportField[]) {
  return {
    format: 'sbc-local-inventory-v1', verification,
    latestImport: profile.latest,
    items: profile.items.map(item => {
      const values = { ...item.reported, ...item.corrections, protected: item.protected, corrections: Object.fromEntries(Object.entries(item.corrections).filter(([key]) => fields.includes(key as ExportField))), correctedAt: item.correctedAt, lastSeen: item.lastSeen, freshness: item.freshness };
      return Object.fromEntries(exportFields.filter(key => fields.includes(key)).map(key => [key, values[key] ?? null]));
    }),
  };
}

// One IndexedDB transaction reads and replaces the document, including its import receipt.
// Concurrent popups serialize here; aborts leave the previous document intact.
export async function transact(update?: (state: InventoryState) => InventoryState): Promise<InventoryState> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('sbc-local-inventory', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('inventory');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('Cannot open local inventory.'));
  });
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('inventory', update ? 'readwrite' : 'readonly');
    const store = transaction.objectStore('inventory');
    let result: InventoryState;
    let failure: unknown;
    const request = store.get('state');
    request.onsuccess = () => {
      try {
        const state = request.result ?? emptyState();
        if (state.version !== 1 || !Array.isArray(state.profiles)) throw new Error('Unsupported inventory data; clear local inventory to reset.');
        result = update ? update(state) : state;
        if (update) store.put(result, 'state');
      } catch (error) { failure = error; transaction.abort(); }
    };
    transaction.oncomplete = () => { db.close(); resolve(result); };
    transaction.onabort = transaction.onerror = () => { db.close(); reject(failure ?? new Error('Local save failed. Previous inventory was retained.')); };
  });
}

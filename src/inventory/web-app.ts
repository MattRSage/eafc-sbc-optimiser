import { InventoryServiceError, type InventorySource } from './import';

export const PAGE_SIZE = 100;
const MAX_STORAGE_ITEMS = 10_000;
export const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const identifier = (value: unknown, field: 'instance-id' | 'definition-id'): string => {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) return String(value);
  if (typeof value === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(value) && value !== '0') return value;
  throw new InventoryServiceError(`malformed-${field}`);
};

const positiveId = (value: unknown): number | null => typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null;
const namePart = (value: unknown): string | null => typeof value === 'string' && value.trim().length > 0 && value.length <= 100 ? value.trim() : null;

function playerName(item: Record<string, unknown>): string | null {
  if (typeof item.getStaticData !== 'function') return null;
  const data: unknown = item.getStaticData();
  if (!isRecord(data)) return null;
  const knownAs = namePart(data.knownAs);
  if (knownAs) return knownAs;
  const parts = [namePart(data.firstName), namePart(data.lastName)].filter(Boolean);
  return namePart(parts.join(' '));
}

function inventoryBlocker(item: Record<string, unknown>): { sbcBlocker?: 'loan' | 'evolution' } {
  if (typeof item.isLimitedUse === 'function' && item.isLimitedUse() === true) return { sbcBlocker: 'loan' };
  if (typeof item.isEnrolledInAcademy === 'function' && item.isEnrolledInAcademy() === true) return { sbcBlocker: 'evolution' };
  return {};
}

export function normalizeResponse(value: unknown, source: InventorySource, offset: number) {
  if (!isRecord(value) || typeof value.success !== 'boolean') throw new InventoryServiceError('malformed-envelope');
  if (!value.success) {
    throw new InventoryServiceError(value.status === 401 || value.status === 403 ? 'authentication' : value.status === 429 ? 'rate-limit' : 'service');
  }
  const response = value.response;
  const endKey = source === 'club' ? 'retrievedAll' : 'endOfList';
  if (!isRecord(response)) throw new InventoryServiceError('malformed-response');
  if (!Array.isArray(response.items)) throw new InventoryServiceError('malformed-items');
  if (response.items.length > (source === 'club' ? PAGE_SIZE : MAX_STORAGE_ITEMS)) throw new InventoryServiceError('malformed-page-size');
  if (typeof response[endKey] !== 'boolean') throw new InventoryServiceError('malformed-end-marker');
  if (source === 'sbc-storage' && response[endKey] !== true) throw new InventoryServiceError('malformed-end-marker');
  if (!response[endKey] && response.items.length === 0) throw new InventoryServiceError('malformed-empty-page');
  const items = response.items.map((item: unknown) => {
    if (!isRecord(item)) throw new InventoryServiceError('malformed-item');
    if (item.concept === true) throw new InventoryServiceError('malformed-concept');
    const rating = item.rating;
    if (rating != null && (typeof rating !== 'number' || !Number.isInteger(rating) || rating < 0 || rating > 99)) throw new InventoryServiceError('malformed-rating');
    return {
      instanceId: identifier(item.id, 'instance-id'), definitionId: identifier(item.definitionId, 'definition-id'),
      name: playerName(item), position: null, rating: rating === 0 ? null : rating ?? null,
      // The factory can synthesize tradable=true; only the positive untradeable count disambiguates false.
      tradeable: item.tradable === false && item.untradeableCount === 1 ? false : null,
      nationId: positiveId(item.nationId), leagueId: positiveId(item.leagueId), clubId: positiveId(item.teamId),
      rarityId: positiveId(item.rareflag),
      ...inventoryBlocker(item),
    };
  });
  return { items, nextCursor: response[endKey] ? null : String(offset + PAGE_SIZE) };
}

interface Observable {
  observe(owner: object, callback: (sender: unknown, response: unknown) => void): void;
  unobserve(owner: object): void;
}

export function readWebAppPage(root: unknown, source: InventorySource, cursor: string | null, signal: AbortSignal): Promise<unknown> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new InventoryServiceError('service')); return; }
    const offset = cursor === null ? 0 : Number(cursor);
    if (!Number.isSafeInteger(offset) || offset < 0 || offset % PAGE_SIZE !== 0 || offset >= 10_000) { reject(new InventoryServiceError('malformed')); return; }
    let observable: Observable | undefined;
    let settled = false;
    const owner = {};
    const finish = (value: unknown, error = false) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', abort);
      try { observable?.unobserve(owner); } catch { /* Cleanup must not prevent cancellation. */ }
      if (error) reject(value); else resolve(value);
    };
    const abort = () => finish(new InventoryServiceError('service'), true);
    try {
      if (!isRecord(root) || !isRecord(root.services) || typeof root.UTSearchCriteriaDTO !== 'function' || !isRecord(root.SearchType) || !['string', 'number'].includes(typeof root.SearchType.PLAYER)) throw new InventoryServiceError('unsupported-service');
      const service = source === 'club' ? root.services.Club : root.services.Item;
      const method = source === 'club' ? 'search' : 'searchStorageItems';
      if (!isRecord(service) || typeof service[method] !== 'function') throw new InventoryServiceError('unsupported-service');
      const Criteria = root.UTSearchCriteriaDTO as new () => Record<string, unknown>;
      const criteria = new Criteria();
      criteria.type = root.SearchType.PLAYER;
      criteria.offset = offset;
      criteria.count = source === 'club' ? PAGE_SIZE : MAX_STORAGE_ITEMS;
      if (source === 'club') Object.defineProperty(criteria, 'cacheable', { value: false });
      const result: unknown = service[method].call(service, criteria);
      if (!isRecord(result) || typeof result.observe !== 'function' || typeof result.unobserve !== 'function') throw new InventoryServiceError('malformed-observable');
      observable = result as unknown as Observable;
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) { abort(); return; }
      observable.observe(owner, (_sender, value) => {
        if (settled) return;
        try { finish(normalizeResponse(value, source, offset)); }
        catch (error) { finish(error instanceof InventoryServiceError ? error : new InventoryServiceError('malformed'), true); }
      });
    } catch (error) { finish(error instanceof InventoryServiceError ? error : new InventoryServiceError('service'), true); }
  });
}

import { describe, expect, it, vi } from 'vitest';
import { normalizeResponse, readWebAppPage } from '../src/inventory/web-app';
import { importInventory } from '../src/inventory/import';
import { parseSnapshot } from '../src/inventory/protocol';

const response = (items: unknown[], end = true) => ({ success: true, response: { items, retrievedAll: end, endOfList: end } });
const card = (id = 'invented-copy-a') => ({ id, definitionId: 'invented-definition-a', rating: 84, name: 'must not cross', privateExtra: 'must not cross' });

describe('Web App inventory boundary', () => {
  it('retains only allowlisted evidence; defaults and absent fields stay unknown', () => {
    expect(normalizeResponse(response([card()]), 'club', 0)).toEqual({ items: [{ instanceId: 'invented-copy-a', definitionId: 'invented-definition-a', rating: 84, name: null, position: null, tradeable: null, nationId: null, leagueId: null, clubId: null, rarityId: null }], nextCursor: null });
    expect(normalizeResponse(response([{ ...card(), rating: 0 }]), 'club', 0).items[0]?.rating).toBeNull();
  });
  it('requires the source-specific explicit end marker', () => {
    expect(normalizeResponse(response([card()], false), 'club', 0).nextCursor).toBe('100');
    expect(() => normalizeResponse({ success: true, response: { items: [], retrievedAll: true } }, 'sbc-storage', 0)).toThrow('malformed');
    expect(() => normalizeResponse(response([], false), 'club', 0)).toThrow('malformed');
  });
  it.each([401, 403, 429, 500])('maps status %s without exposing errors', status => {
    expect(() => normalizeResponse({ success: false, status, error: 'private' }, 'club', 0)).toThrow(status === 429 ? 'rate-limit' : status === 500 ? 'service' : 'authentication');
  });
  it.each([{ id: 0 }, { definitionId: undefined }, { rating: 100 }, { concept: true }])('rejects malformed identities or fields %j', extra => {
    expect(() => normalizeResponse(response([{ ...card(), ...extra }]), 'club', 0)).toThrow('malformed');
  });
  it('fails closed when the service is unavailable', async () => {
    await expect(readWebAppPage({}, 'club', null, new AbortController().signal)).rejects.toThrow('unsupported-service');
  });
  it('calls only the selected service and detaches on cancellation, ignoring late callbacks', async () => {
    let callback: (sender: unknown, value: unknown) => void = () => {};
    const unobserve = vi.fn();
    const search = vi.fn(() => ({ observe: (_owner: object, cb: typeof callback) => { callback = cb; }, unobserve }));
    const searchStorageItems = vi.fn();
    const root = { services: { Club: { search }, Item: { searchStorageItems } }, SearchType: { PLAYER: 'player' }, UTSearchCriteriaDTO: class {} };
    const controller = new AbortController();
    const pending = readWebAppPage(root, 'club', '100', controller.signal);
    expect(search).toHaveBeenCalledWith({ type: 'player', count: 100, offset: 100 });
    expect(searchStorageItems).not.toHaveBeenCalled();
    controller.abort();
    await expect(pending).rejects.toThrow('service');
    callback({}, response([card()]));
    expect(unobserve).toHaveBeenCalledTimes(1);
  });
});

it('imports both sources sequentially with separate coverage and no interim complete result', async () => {
  const order: string[] = [];
  const progress: string[] = [];
  const result = await importInventory({ evidence: 'synthetic-service',
    readClubPage: async () => { order.push('club'); return { items: [{ instanceId: 'a', definitionId: 'same' }], nextCursor: null }; },
    readStoragePage: async () => { order.push('storage'); return { items: [{ instanceId: 'b', definitionId: 'same' }], nextCursor: null }; },
  }, { onProgress: state => progress.push(state.status) });
  expect(order).toEqual(['club', 'storage']);
  expect(result.status).toBe('complete');
  expect(result.items.map(item => item.provenance.source)).toEqual(['club', 'sbc-storage']);
  expect(result.coverage).toEqual({ club: 'complete', 'sbc-storage': 'complete' });
  expect(progress.filter(status => status === 'complete')).toHaveLength(1);
});
it('preserves club results when storage is unsupported', async () => {
  const result = await importInventory({ evidence: 'synthetic-service', readClubPage: async () => ({ items: [{ instanceId: 'a', definitionId: 'b' }], nextCursor: null }) });
  expect(result.status).toBe('partial');
  expect(result.problem).toBe('unsupported-service');
  expect(result.items).toHaveLength(1);
  expect(result.coverage).toEqual({ club: 'complete', 'sbc-storage': 'partial' });
});
it('does not count the same instance twice across sources or call it complete', async () => {
  const read = async () => ({ items: [{ instanceId: 'a', definitionId: 'b' }], nextCursor: null });
  const result = await importInventory({ evidence: 'synthetic-service', readClubPage: read, readStoragePage: read });
  expect(result.status).toBe('partial');
  expect(result.problem).toBe('conflicting-instance');
  expect(result.items).toHaveLength(1);
});
it('rejects incomplete coverage masquerading as a complete bridge result', () => {
  expect(parseSnapshot({ status: 'complete', items: [], coverage: { club: 'complete', 'sbc-storage': 'partial' }, pages: 1, requests: 1, problem: null })).toBeNull();
  expect(parseSnapshot({ status: 'running', items: [], coverage: { club: 'partial', 'sbc-storage': 'not-started' }, pages: 0, requests: Infinity, problem: null })).toBeNull();
});
it('stops on a cross-source conflict before requesting another storage page', async () => {
  const storage = vi.fn(async () => ({ items: [{ instanceId: 'a', definitionId: 'b' }], nextCursor: 'next' }));
  const result = await importInventory({ evidence: 'synthetic-service',
    readClubPage: async () => ({ items: [{ instanceId: 'a', definitionId: 'b' }], nextCursor: null }),
    readStoragePage: storage,
  });
  expect(storage).toHaveBeenCalledTimes(1);
  expect(result.problem).toBe('conflicting-instance');
  expect(result.status).toBe('partial');
});
it('does not start storage or report completion when cancelled between sources', async () => {
  const controller = new AbortController();
  const storage = vi.fn();
  const result = await importInventory({ evidence: 'synthetic-service',
    readClubPage: async () => ({ items: [], nextCursor: null }), readStoragePage: storage,
  }, { signal: controller.signal, onProgress: state => { if (state.coverage.club === 'complete') controller.abort(); } });
  expect(storage).not.toHaveBeenCalled();
  expect(result.status).toBe('cancelled');
  expect(result.coverage['sbc-storage']).toBe('not-started');
});

it.each([
  [null, 'malformed-envelope'],
  [{ success: true }, 'malformed-response'],
  [{ success: true, response: { items: {} } }, 'malformed-items'],
  [response(Array.from({ length: 101 }, () => card())), 'malformed-page-size'],
  [{ success: true, response: { items: [] } }, 'malformed-end-marker'],
  [response([], false), 'malformed-empty-page'],
  [response([null]), 'malformed-item'],
  [response([{ ...card(), concept: true }]), 'malformed-concept'],
  [response([{ ...card(), rating: 'private-value' }]), 'malformed-rating'],
  [response([{ ...card(), id: 'private value' }]), 'malformed-instance-id'],
  [response([{ ...card(), definitionId: null }]), 'malformed-definition-id'],
])('reports only a fixed validation code through the engine and bridge', async (raw, code) => {
  const result = await importInventory({ evidence: 'synthetic-service', readClubPage: async () => normalizeResponse(raw, 'club', 0) });
  expect(result).toMatchObject({ status: 'failed', items: [], pages: 0, requests: 1, problem: code });
  expect(parseSnapshot(result)?.problem).toBe(code);
  expect(JSON.stringify(result)).not.toContain('private');
});

it('rejects arbitrary diagnostic strings at the bridge', () => {
  expect(parseSnapshot({ status: 'failed', items: [], coverage: { club: 'partial', 'sbc-storage': 'not-started' }, pages: 0, requests: 1, problem: 'malformed-private-value' })).toBeNull();
});


it('imports fresh club batches despite a growing or prepopulated service cache', async () => {
  const cards = Array.from({ length: 205 }, (_, i) => card(`synthetic-copy-${i}`));
  let cache = [card('synthetic-stale-copy')];
  const offsets: number[] = [];
  class Criteria { get cacheable() { return true; } }
  const root = {
    UTSearchCriteriaDTO: Criteria, SearchType: { PLAYER: 'player' },
    services: { Club: { search(criteria: { offset: number; count: number; cacheable: boolean }) {
      expect(criteria.cacheable).toBe(false);
      offsets.push(criteria.offset);
      const batch = cards.slice(criteria.offset, criteria.offset + criteria.count);
      cache = [...cache, ...batch];
      return { unobserve() {}, observe(owner: object, cb: (sender: object, value: unknown) => void) {
        cb(owner, response(criteria.cacheable ? cache : batch, batch.length < criteria.count));
      } };
    } } },
  };
  for (let run = 0; run < 2; run++) {
    const result = await importInventory({ evidence: 'synthetic-service',
      readClubPage: ({ cursor, signal }) => readWebAppPage(root, 'club', cursor, signal),
      readStoragePage: async () => ({ items: [], nextCursor: null }),
    });
    expect(result.status).toBe('complete');
    expect(result.items.map(item => item.instanceId)).toEqual(cards.map(item => item.id));
  }
  expect(offsets).toEqual([0, 100, 200, 0, 100, 200]);
});

it('accepts complete storage collections beyond the club page size but keeps bounds', () => {
  const cards = Array.from({ length: 200 }, (_, i) => card(`storage-copy-${i}`));
  expect(normalizeResponse(response(cards), 'sbc-storage', 0).items).toHaveLength(200);
  expect(() => normalizeResponse(response(cards, false), 'sbc-storage', 0)).toThrow('malformed-end-marker');
  expect(() => normalizeResponse(response(Array(10_001).fill(card())), 'sbc-storage', 0)).toThrow('malformed-page-size');
});

it('maps attached names and positive category IDs without accepting entity defaults', () => {
  const normalize = (extra: object) => normalizeResponse(response([{ ...card(), ...extra }]), 'club', 0).items[0]!;
  expect(normalize({ getStaticData: () => ({ knownAs: 'Synthetic Alias', firstName: 'Alex', lastName: 'Example' }), nationId: 12, leagueId: 34, teamId: 56, rareflag: 1, tradable: false, untradeableCount: 1 })).toMatchObject({ name: 'Synthetic Alias', nationId: 12, leagueId: 34, clubId: 56, rarityId: 1, tradeable: false });
  expect(normalize({ getStaticData: () => ({ firstName: 'Alex', lastName: 'Example' }) }).name).toBe('Alex Example');
  for (const tradable of [true, false, undefined]) {
    expect(normalize({ getStaticData: () => ({ knownAs: '', firstName: '', lastName: '' }), preferredPosition: 0, tradable, untradeableCount: 0, nationId: -1, leagueId: 0, teamId: '56', rareflag: 0 })).toMatchObject({ name: null, position: null, tradeable: null, nationId: null, leagueId: null, clubId: null, rarityId: null });
  }
  expect(normalize({ getStaticData: () => ({ knownAs: 'x'.repeat(101) }), rareflag: -1 }).name).toBeNull();
});

it('preserves enriched evidence, corrections and protection through bridge and repeat save', async () => {
  const { reconcile, reviewedExport } = await import('../src/inventory/store');
  const run = async (name: string) => importInventory({ evidence: 'internal-inventory-service',
    readClubPage: async () => normalizeResponse(response([{ ...card(), getStaticData: () => ({ knownAs: name }), nationId: 12, leagueId: 34, teamId: 56, rareflag: 1 }]), 'club', 0),
    readStoragePage: async () => ({ items: [], nextCursor: null }),
  });
  const first = reconcile({ id: 'synthetic-profile', label: 'Example', items: [], latest: null }, parseSnapshot(await run('First')));
  first.items[0]!.protected = true;
  first.items[0]!.corrections = { name: 'Manual name', position: 'ST' };
  const second = reconcile(first, parseSnapshot(await run('Second')));
  expect(second.items).toHaveLength(1);
  expect(second.items[0]).toMatchObject({ protected: true, corrections: { name: 'Manual name', position: 'ST' }, reported: { name: 'Second', nationId: 12, leagueId: 34, clubId: 56, rarityId: 1, provenance: { kind: 'internal-inventory-service', source: 'club' } } });
  expect(reviewedExport(second, ['name', 'nationId', 'clubId']).items).toEqual([{ name: 'Manual name', nationId: 12, clubId: 56 }]);
  const raw = await run('Third');
  for (const field of ['nationId', 'leagueId', 'clubId', 'rarityId']) {
    expect(parseSnapshot({ ...raw, items: [{ ...raw.items[0], [field]: 'invalid' }] })).toBeNull();
  }
});

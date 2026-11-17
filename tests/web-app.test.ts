import { describe, expect, it, vi } from 'vitest';
import { normalizeResponse, readWebAppPage } from '../src/inventory/web-app';
import { importInventory } from '../src/inventory/import';
import { parseSnapshot } from '../src/inventory/protocol';

const response = (items: unknown[], end = true) => ({ success: true, response: { items, retrievedAll: end, endOfList: end } });
const card = (id = 'invented-copy-a') => ({ id, definitionId: 'invented-definition-a', rating: 84, name: 'must not cross', privateExtra: 'must not cross' });

describe('Web App inventory boundary', () => {
  it('retains only allowlisted evidence; defaults and absent fields stay unknown', () => {
    expect(normalizeResponse(response([card()]), 'club', 0)).toEqual({ items: [{ instanceId: 'invented-copy-a', definitionId: 'invented-definition-a', rating: 84, name: null, position: null, tradeable: null }], nextCursor: null });
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

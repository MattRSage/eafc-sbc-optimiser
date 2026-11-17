import { describe, expect, it, vi } from 'vitest';
import { idleImport, importClub, InventoryServiceError, type InventoryService } from '../src/inventory/import';

const card = (instanceId = 'synthetic-instance-a', definitionId = 'synthetic-definition-a') => ({ instanceId, definitionId });
const page = (items = [card()], nextCursor: string | null = null) => ({ items, nextCursor });
function fixture(...responses: unknown[]): InventoryService & { readClubPage: ReturnType<typeof vi.fn> } {
  let index = 0;
  return { evidence: 'synthetic-service', readClubPage: vi.fn(async () => {
    const response = responses[index++];
    if (response instanceof Error) throw response;
    return response;
  }) };
}

describe('synthetic club import', () => {
  it('is idle until explicitly called and terminates on the final page', async () => {
    const service = fixture(page([card()], 'synthetic-next'), page([card('synthetic-instance-b')]));
    expect(idleImport().status).toBe('idle');
    expect(service.readClubPage).not.toHaveBeenCalled();
    const progress = vi.fn();
    const result = await importClub(service, { onProgress: progress });
    expect(result).toMatchObject({ status: 'complete', pages: 2, requests: 2, coverage: { club: 'complete', 'sbc-storage': 'not-implemented' } });
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toMatchObject({ name: null, rating: null, position: null, tradeable: null, provenance: { kind: 'synthetic-service', source: 'club' } });
    expect(service.readClubPage.mock.calls.map(args => args[0].cursor)).toEqual([null, 'synthetic-next']);
    expect(progress.mock.calls.map(args => args[0].status)).toEqual(['running', 'running', 'complete']);
  });

  it('accepts an explicitly empty final page', async () => {
    expect(await importClub(fixture(page([])))).toMatchObject({ status: 'complete', items: [] });
  });

  it('deduplicates overlapping instances while preserving two copies of a definition', async () => {
    const result = await importClub(fixture(page([card()], 'synthetic-next'), page([card(), card('synthetic-instance-b')])));
    expect(result.status).toBe('complete');
    expect(result.items.map(item => item.instanceId)).toEqual(['synthetic-instance-a', 'synthetic-instance-b']);
  });

  it('does not fabricate removals across independent imports', async () => {
    const earlier = await importClub(fixture(page([card()])));
    const later = await importClub(fixture(page([])));
    expect(earlier.items).toHaveLength(1);
    expect(later.items).toEqual([]);
    expect(earlier.items[0]).not.toHaveProperty('sold');
  });

  it('cancels before the first request and before another request', async () => {
    const controller = new AbortController();
    controller.abort();
    const service = fixture(page());
    expect((await importClub(service, { signal: controller.signal })).status).toBe('cancelled');
    expect(service.readClubPage).not.toHaveBeenCalled();
    const active = new AbortController();
    const paginated = fixture(page([card()], 'synthetic-next'), page([]));
    const result = await importClub(paginated, { signal: active.signal, onProgress: state => { if (state.pages === 1) active.abort(); } });
    expect(result).toMatchObject({ status: 'cancelled', pages: 1, coverage: { club: 'partial' } });
    expect(result.items).toHaveLength(1);
    expect(paginated.readClubPage).toHaveBeenCalledTimes(1);
  });

  it('cancels an in-flight service that ignores abort', async () => {
    const controller = new AbortController();
    const service: InventoryService = { evidence: 'synthetic-service', readClubPage: () => new Promise(() => {}) };
    const pending = importClub(service, { signal: controller.signal });
    controller.abort();
    expect((await pending).status).toBe('cancelled');
  });

  it('bounds requests and preserves partial results', async () => {
    const service = fixture(page([card()], 'synthetic-next'));
    const result = await importClub(service, { maxRequests: 1 });
    expect(result).toMatchObject({ status: 'partial', problem: 'request-limit', requests: 1 });
    expect(result.items).toHaveLength(1);
    expect(service.readClubPage).toHaveBeenCalledTimes(1);
  });

  it('bounds a stalled request even when the service ignores abort', async () => {
    vi.useFakeTimers();
    try {
      const service: InventoryService = { evidence: 'synthetic-service', readClubPage: () => new Promise(() => {}) };
      const pending = importClub(service, { requestTimeoutMs: 10 });
      await vi.advanceTimersByTimeAsync(10);
      expect(await pending).toMatchObject({ status: 'failed', problem: 'timeout' });
    } finally { vi.useRealTimers(); }
  });

  it('detects repeated pages even when order or cursor changes', async () => {
    const result = await importClub(fixture(page([card(), card('synthetic-instance-b')], 'synthetic-next'), page([card('synthetic-instance-b'), card()], 'synthetic-other')));
    expect(result).toMatchObject({ status: 'partial', problem: 'repeated-page', pages: 1 });
    expect(result.items).toHaveLength(2);
  });

  it('detects a repeated cursor with different items', async () => {
    expect(await importClub(fixture(page([card()], 'synthetic-next'), page([card('synthetic-instance-b')], 'synthetic-next')))).toMatchObject({ status: 'partial', problem: 'repeated-page', pages: 1 });
  });

  it.each([null, {}, { items: [] }, { items: [], nextCursor: 3 }, page([{ ...card(), rating: '90' } as never]), page([{ ...card(), tradeable: 'yes' } as never]), page([{ instanceId: 'synthetic-only' } as never])])('rejects malformed responses atomically: %j', async malformed => {
    expect(await importClub(fixture(malformed))).toMatchObject({ status: 'failed', problem: 'malformed', items: [] });
    const partial = await importClub(fixture(page([card()], 'synthetic-next'), malformed));
    expect(partial).toMatchObject({ status: 'partial', problem: 'malformed', pages: 1 });
    expect(partial.items).toHaveLength(1);
  });

  it.each(['authentication', 'rate-limit', 'service'] as const)('stops on %s without retries or leaking error text', async code => {
    expect(await importClub(fixture(new InventoryServiceError(code)))).toMatchObject({ status: 'failed', problem: code, requests: 1 });
    const result = await importClub(fixture(page([card()], 'synthetic-next'), new InventoryServiceError(code)));
    expect(result).toMatchObject({ status: 'partial', problem: code, requests: 2 });
    expect(result.items).toHaveLength(1);
    expect(JSON.stringify(await importClub(fixture(new Error('synthetic-unapproved-detail'))))).not.toContain('synthetic-unapproved-detail');
  });

  it('rejects conflicting identity without accepting any part of that page', async () => {
    const result = await importClub(fixture(page([card()], 'synthetic-next'), page([card('synthetic-instance-b'), card('synthetic-instance-a', 'synthetic-definition-other')])));
    expect(result).toMatchObject({ status: 'partial', problem: 'conflicting-instance' });
    expect(result.items).toHaveLength(1);
  });

  it('allowlists fields and isolates progress snapshots', async () => {
    const result = await importClub(fixture(page([{ ...card(), name: 'Invented Player', rating: 80, position: 'GK', tradeable: false, unrelated: 'discard' } as never])), { onProgress: state => { state.items.length = 0; state.coverage.club = 'not-started'; } });
    expect(result.items[0]).toMatchObject({ name: 'Invented Player', rating: 80, position: 'GK', tradeable: false });
    expect(result.items[0]).not.toHaveProperty('unrelated');
    expect(result.coverage.club).toBe('complete');
  });

  it('rejects invalid bounds before requesting data', async () => {
    const service = fixture(page());
    await expect(importClub(service, { maxRequests: 0 })).rejects.toThrow(RangeError);
    await expect(importClub(service, { requestTimeoutMs: Infinity })).rejects.toThrow(RangeError);
    expect(service.readClubPage).not.toHaveBeenCalled();
  });
});

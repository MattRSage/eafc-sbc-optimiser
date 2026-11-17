import { isRecord } from './web-app';
import { parsePage, type ImportSnapshot } from './import';
export const CHANNEL = 'sbc-inventory-v1';
export const validRun = (id: unknown): id is string => typeof id === 'string' && /^[0-9a-f-]{36}$/.test(id);

export function parseSnapshot(value: unknown): ImportSnapshot | null {
  if (!isRecord(value) || !['idle', 'running', 'cancelled', 'partial', 'complete', 'failed'].includes(String(value.status)) || !isRecord(value.coverage)) return null;
  if (![value.requests, value.pages].every(n => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0 && n <= 200)) return null;
  if (![value.coverage.club, value.coverage['sbc-storage']].every(v => ['not-started', 'partial', 'complete', 'not-implemented'].includes(String(v)))) return null;
  if (value.problem !== null && !['authentication', 'rate-limit', 'service', 'malformed', 'repeated-page', 'request-limit', 'timeout', 'conflicting-instance', 'unsupported-service'].includes(String(value.problem))) return null;
  if (!Array.isArray(value.items) || value.items.length > 20_000) return null;
  try {
    const items = value.items.map(item => {
      if (!isRecord(item) || !isRecord(item.provenance) || item.provenance.kind !== 'internal-inventory-service' || !['club', 'sbc-storage'].includes(String(item.provenance.source))) throw new Error();
      const normalized = parsePage({ items: [item], nextCursor: null }).items[0];
      if (!normalized) throw new Error();
      return { ...normalized, provenance: { kind: 'internal-inventory-service' as const, source: item.provenance.source as 'club' | 'sbc-storage' } };
    });
    if (value.status === 'complete' && (value.coverage.club !== 'complete' || value.coverage['sbc-storage'] !== 'complete')) return null;
    return { status: value.status as ImportSnapshot['status'], items, coverage: { club: value.coverage.club, 'sbc-storage': value.coverage['sbc-storage'] } as ImportSnapshot['coverage'], requests: value.requests as number, pages: value.pages as number, problem: value.problem as ImportSnapshot['problem'] };
  } catch { return null; }
}

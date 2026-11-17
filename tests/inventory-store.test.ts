import { describe, expect, it } from 'vitest';
import { parseCorrections, reconcile, reviewedExport, type Profile } from '../src/inventory/store';
import { idleImport, type ImportSnapshot, type OwnedInstance } from '../src/inventory/import';
const item = (instanceId: string, source: 'club' | 'sbc-storage' = 'club'): OwnedInstance => ({ instanceId, definitionId: 'invented-definition', name: null, rating: 84, position: null, tradeable: null, provenance: { kind: 'internal-inventory-service', source } });
const snapshot = (items = [item('invented-a'), item('invented-b')]): ImportSnapshot => ({ ...idleImport(), status: 'complete', coverage: { club: 'complete', 'sbc-storage': 'complete' }, items });
const profile = (): Profile => ({ id: 'invented-profile', label: 'Synthetic club', items: [], latest: null });
describe('local inventory reconciliation', () => {
  it('preserves distinct copies without inflating repeated imports', () => {
    const first = reconcile(profile(), snapshot(), 'first');
    const again = reconcile(first, snapshot(), 'second');
    expect(again.items).toHaveLength(2);
    expect(again.items.map(i => i.lastSeen)).toEqual(['second', 'second']);
  });
  it('preserves protection and explicit manual overrides while updating reported evidence', () => {
    const first = reconcile(profile(), snapshot());
    first.items[0]!.protected = true;
    first.items[0]!.corrections = { rating: 90, name: 'Manual example' };
    first.items[0]!.correctedAt = 'manual-time';
    const next = snapshot(); next.items[0]!.rating = 85;
    const again = reconcile(first, next);
    expect(again.items[0]!).toMatchObject({ protected: true, corrections: { rating: 90 }, correctedAt: 'manual-time', reported: { rating: 85 } });
  });
  it('retains missing cards and distinguishes uncovered sources in partial imports', () => {
    const first = reconcile(profile(), snapshot([item('invented-a'), item('invented-storage', 'sbc-storage')]));
    const next = { ...snapshot([]), status: 'partial', coverage: { club: 'complete', 'sbc-storage': 'partial' } };
    const again = reconcile(first, next);
    expect(again.items.map(i => i.freshness)).toEqual(['missing-unconfirmed', 'not-rechecked']);
    expect(again.latest?.status).toBe('partial');
  });
  it('never deletes inventory on a failed or cancelled import', () => {
    const first = reconcile(profile(), snapshot());
    for (const status of ['failed', 'cancelled']) {
      const next = reconcile(first, { ...idleImport(), status });
      expect(next.items).toHaveLength(2);
      expect(next.items.every(i => i.freshness === 'not-rechecked')).toBe(true);
    }
  });
  it('updates a moved source without duplicating the instance', () => {
    const next = reconcile(reconcile(profile(), snapshot([item('invented-a')])), snapshot([item('invented-a', 'sbc-storage')]));
    expect(next.items).toHaveLength(1);
    expect(next.items[0]!.reported.provenance.source).toBe('sbc-storage');
  });
  it('rejects conflicting definitions, duplicate instances and unfinished snapshots atomically', () => {
    const first = reconcile(profile(), snapshot());
    const before = JSON.stringify(first);
    expect(() => reconcile(first, snapshot([{ ...item('invented-a'), definitionId: 'different' }]))).toThrow(/definition/);
    expect(() => reconcile(first, snapshot([item('invented-a'), item('invented-a')]))).toThrow(/Duplicate/);
    expect(() => reconcile(first, { ...snapshot(), status: 'running' })).toThrow();
    expect(JSON.stringify(first)).toBe(before);
  });
  it('does not combine separate profile inventories', () => {
    const a = reconcile(profile(), snapshot());
    const b = reconcile({ ...profile(), id: 'another-profile' }, snapshot([item('invented-a')]));
    expect(a.items).toHaveLength(2); expect(b.items).toHaveLength(1);
    expect(b.items[0]!.protected).toBe(false);
  });
  it('exports only selected fields without profile labels or extraneous input', () => {
    const raw = { ...snapshot(), privateContext: 'must-discard' };
    Object.assign(raw.items[0]!, { privateContext: 'must-discard' });
    const saved = reconcile(profile(), raw);
    const output = reviewedExport(saved, ['rating', 'freshness']);
    expect(output.items[0]!).toEqual({ rating: 84, freshness: 'seen' });
    expect(JSON.stringify(output)).not.toMatch(/must-discard|Synthetic club|invented-a/);
    expect(output.verification).toMatch(/unverified/);
  });
  it('redacts deselected fields from nested manual corrections too', () => {
    const saved = reconcile(profile(), snapshot());
    saved.items[0]!.corrections = { name: 'Private corrected name', rating: 91 };
    const output = reviewedExport(saved, ['rating', 'corrections']);
    expect(output.items[0]!).toEqual({ rating: 91, corrections: { rating: 91 } });
    expect(JSON.stringify(output)).not.toContain('Private corrected name');
  });
  it('validates manual corrections and allows explicit unknowns or clearing', () => {
    expect(parseCorrections({ rating: null, tradeable: false })).toEqual({ rating: null, tradeable: false });
    expect(parseCorrections({})).toEqual({});
    for (const value of [{ rating: 100 }, { name: '' }, { instanceId: 'change' }, { tradeable: 'yes' }, []]) expect(() => parseCorrections(value)).toThrow();
  });
});

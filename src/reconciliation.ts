import type { Profile } from './capture';

export const fields = ['name', 'rating', 'position', 'club', 'league', 'nation', 'cardType', 'tradeable', 'sbcStorage', 'visibleId'] as const;
export type Field = typeof fields[number];
export type Card = Record<Field, string | null>;

export type Location = 'main-club' | 'sbc-storage' | 'unknown';
export interface RawObservation {
  id: number;
  correlation: number;
  source: Profile['source'];
  view: 'main' | 'bio' | 'partial';
  values: Card;
}
export interface CardCandidate {
  id: number;
  values: Card;
  provenance: Record<Field, { observations: number[]; confidence: 'observed' | 'unknown' }>;
  location: Location;
  confirmation: 'unconfirmed';
  review: ('identity-unverified' | 'incomplete' | 'same-name' | 'conflict' | 'user-review')[];
}
// Only an explicit confirmation can supply an exact version; DOM correlation IDs cannot.
export interface InventoryItem {
  confirmation: 'user-confirmed';
  candidateId: number;
  verifiedVersion: string | null;
  location: Location;
}
export function confirmInventory(items: readonly InventoryItem[], item: InventoryItem):
  { accepted: true; items: InventoryItem[] } | { accepted: false; reason: 'same-version-main-club' | 'already-confirmed' } {
  if (items.some(existing => existing.candidateId === item.candidateId)) return { accepted: false, reason: 'already-confirmed' };
  if (item.location === 'main-club' && item.verifiedVersion && items.some(existing =>
    existing.location === 'main-club' && existing.verifiedVersion === item.verifiedVersion)) {
    return { accepted: false, reason: 'same-version-main-club' };
  }
  return { accepted: true, items: [...items, item] };
}
export function reconcile(raw: readonly RawObservation[]): CardCandidate[] {
  const candidates = new Map<number, CardCandidate>();
  for (const observation of raw) {
    let candidate = candidates.get(observation.correlation);
    if (!candidate) {
      candidate = {
        id: observation.correlation, values: Object.fromEntries(fields.map(field => [field, null])) as Card,
        provenance: Object.fromEntries(fields.map(field => [field, { observations: [] as number[], confidence: 'unknown' }])) as CardCandidate['provenance'],
        location: 'unknown', confirmation: 'unconfirmed', review: ['identity-unverified'],
      };
      candidates.set(candidate.id, candidate);
    }
    for (const field of fields) {
      const value = observation.values[field];
      if (value === null) continue;
      candidate.values[field] = value;
      candidate.provenance[field].observations.push(observation.id);
      candidate.provenance[field].confidence = 'observed';
    }
  }
  const result = [...candidates.values()];
  for (const candidate of result) {
    if (fields.some(field => candidate.values[field] === null)) candidate.review.push('incomplete');
    if (candidate.values.name && result.some(other => other !== candidate && other.values.name === candidate.values.name)) candidate.review.push('same-name');
  }
  return result;
}

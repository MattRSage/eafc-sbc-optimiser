import { describe, expect, it } from 'vitest';
import type { SavedItem } from '../src/inventory/store';
import { parseRequirements, prepare, solve, squadRating, validateSquad, type Reviews } from '../src/planner/solver';

const requirements = { size: 11 as const, minRating: 84, otherConstraints: false as const };
function fixture(ratings: number[]) {
  const items: SavedItem[] = ratings.map((rating, i) => ({ reported: { instanceId: `copy-${i}`, definitionId: `definition-${i}`, name: `Player ${i}`, rating, position: null, tradeable: null, provenance: { kind: 'synthetic-service', source: 'club' } }, protected: false, corrections: {}, correctedAt: null, lastSeen: '2026-11-18T00:00:00Z', freshness: 'seen' }));
  const reviews: Reviews = Object.fromEntries(items.map((item, i) => [item.reported.instanceId, { eligible: true, playerKey: `person-${i}` }]));
  return { items, reviews };
}
const repeat = (n: number, r: number) => Array<number>(n).fill(r);

describe('provisional rating model', () => {
  it('uses a correction and rounds the total before division', () => {
    expect(squadRating(repeat(11, 84))).toBe(84);
    expect(squadRating([...repeat(9, 84), 83, 83])).toBe(84);
    expect(squadRating([...repeat(8, 84), 83, 83, 83])).toBe(83);
    expect(squadRating([...repeat(8, 85), 87, 87, 88])).toBe(86);
    expect(squadRating([...repeat(6, 84), ...repeat(4, 83), 85])).toBe(84);
    expect(() => squadRating([84])).toThrow();
    expect(() => squadRating([...repeat(10, 84), NaN])).toThrow();
  });
  it('rejects unsupported constraints and malformed requirements', () => {
    for (const other of [{ chemistry: 0 }, { size: 10 }, { otherConstraints: true }, { minRating: 84.5 }, { minRating: NaN }, { minRating: 100 }]) expect(() => parseRequirements({ ...requirements, ...other })).toThrow();
  });
});

describe('FUTBIN rating evidence', () => {
  // Displayed 86-rated combinations on 2026-11-18; columns are counts for ratings 81–89.
  // https://www.futbin.com/27/squad-building-challenges/rating-combinations?rating=86
  const combinations = [
    [0,0,0,6,0,1,4,0,0], [0,0,1,4,1,1,4,0,0], [0,0,0,3,3,2,3,0,0],
    [0,0,0,1,6,1,3,0,0], [0,0,2,5,0,0,2,2,0], [0,0,0,6,0,3,0,2,0],
    [0,0,0,0,6,3,2,0,0], [0,0,0,1,6,2,1,1,0], [0,0,0,2,6,1,0,2,0],
    [0,0,0,1,3,6,1,0,0], [0,0,0,0,9,0,0,2,0], [4,0,0,0,0,2,5,0,0],
    [0,0,0,0,6,4,0,1,0], [0,0,0,3,3,4,0,0,1], [0,0,0,2,7,0,0,1,1],
    [3,2,0,0,0,0,5,1,0], [0,0,0,1,6,3,0,0,1], [0,0,1,0,8,0,0,1,1],
    [0,4,1,0,1,0,4,0,1], [0,0,0,0,2,9,0,0,0], [1,0,0,0,0,10,0,0,0],
  ];
  it.each(combinations.map((counts, index) => ({ counts, row: index + 1 })))('matches displayed row $row', ({ counts }) => {
    const ratings = counts.flatMap((count, index) => repeat(count, 81 + index));
    expect(ratings).toHaveLength(11);
    expect(squadRating(ratings)).toBe(86);
    const { items, reviews } = fixture(ratings);
    expect(validateSquad(items, reviews, { ...requirements, minRating: 86 }, items.map(item => item.reported.instanceId))).toBe(true);
  });
  it('matches the FAQ rounding-boundary example', () => {
    expect(squadRating([...repeat(9, 84), 83, 83])).toBe(84);
  });
});

describe('local search', () => {
  it.each(['loan', 'evolution'] as const)('excludes %s even when manually confirmed eligible', blocker => {
    const { items, reviews } = fixture(repeat(12, 84));
    items[0]!.reported.sbcBlocker = blocker;
    const result = solve(items, reviews, requirements);
    expect(result.squad?.some(card => card.instanceId === 'copy-0')).toBe(false);
    expect(result.squad).toHaveLength(11);
    expect(validateSquad(items, reviews, requirements, items.slice(0, 11).map(item => item.reported.instanceId))).toBe(false);
  });
  it('excludes protection, staleness, storage, unknown ratings and unreviewed eligibility', () => {
    const { items, reviews } = fixture(repeat(17, 84));
    items[0]!.protected = true;
    items[1]!.freshness = 'missing-unconfirmed';
    items[2]!.freshness = 'not-rechecked';
    items[3]!.reported.provenance.source = 'sbc-storage';
    items[4]!.reported.rating = null;
    reviews['copy-5']!.eligible = false; // Loan/concept/ineligible or not reviewed.
    const result = solve(items, reviews, requirements);
    expect(result.status).toBe('optimal');
    expect(result.excluded).toHaveLength(6);
    expect(result.squad?.map(c => c.instanceId).sort()).toEqual(items.slice(6).map(i => i.reported.instanceId).sort());
    expect(prepare(items, {}).candidates).toHaveLength(0);
  });
  it('uses corrections, preserves explicit unknown and accepts irrelevant unknowns', () => {
    const { items, reviews } = fixture(repeat(11, 83));
    for (const item of items) item.corrections.rating = 84;
    expect(solve(items, reviews, requirements).rating).toBe(84);
    items[0]!.corrections.rating = null;
    expect(solve(items, reviews, requirements).status).toBe('no-solution');
  });
  it('rejects duplicate instances, definitions and versions of a player', () => {
    const { items, reviews } = fixture(repeat(12, 84));
    items[1]!.reported.definitionId = items[0]!.reported.definitionId;
    reviews['copy-1']!.playerKey = 'person-0';
    reviews['copy-2']!.playerKey = ' PERSON-0 ';
    expect(solve(items, reviews, requirements).status).toBe('no-solution');
    expect(validateSquad(items, reviews, requirements, items.slice(0, 11).map(i => i.reported.instanceId))).toBe(false);
    const duplicated = [...items, items[0]!];
    expect(prepare(duplicated, reviews).excluded.filter(e => e.reason === 'Duplicate instance identity')).toHaveLength(2);
    expect(validateSquad(items, reviews, requirements, repeat(11, 0).map(() => 'copy-0'))).toBe(false);
  });
  it('distinguishes no solution from incomplete search with or without an incumbent', () => {
    const { items, reviews } = fixture(repeat(12, 84));
    expect(solve(items.slice(0, 10), reviews, requirements).status).toBe('no-solution');
    expect(solve(items, reviews, { ...requirements, minRating: 99 }).status).toBe('no-solution');
    expect(solve(items, reviews, requirements, 1)).toMatchObject({ status: 'incomplete', squad: null });
    expect(solve(items, reviews, requirements, 11)).toMatchObject({ status: 'incomplete', rating: 84 });
    expect(solve(items, reviews, requirements).status).toBe('optimal');
  });
  it('independently checks every returned squad against source records', () => {
    const { items, reviews } = fixture(repeat(12, 84));
    const result = solve(items, reviews, requirements);
    const ids = result.squad!.map(c => c.instanceId);
    expect(validateSquad(items, reviews, requirements, ids)).toBe(true);
    items.find(i => i.reported.instanceId === ids[0])!.protected = true;
    expect(validateSquad(items, reviews, requirements, ids)).toBe(false);
  });
  it('bounds a full-size inventory and rejects larger input without truncation', () => {
    const { items, reviews } = fixture(Array.from({ length: 2000 }, (_, i) => 80 + i % 11));
    const result = solve(items, reviews, { ...requirements, minRating: 88 });
    expect(result.visited).toBeLessThanOrEqual(250_000);
    expect(result.status).toBe('incomplete');
    expect(() => solve([...items, items[0]!], reviews, requirements)).toThrow('2,000');
  });
  it('matches independent exhaustive search on small fixtures', () => {
    for (let seed = 0; seed < 12; seed++) {
      const { items, reviews } = fixture(Array.from({ length: 14 }, (_, i) => 81 + (seed * 7 + i * 3) % 7));
      if (seed % 2) reviews['copy-1']!.playerKey = 'person-0';
      let best = Infinity;
      for (let mask = 0; mask < 2 ** items.length; mask++) {
        const chosen = items.filter((_, i) => (mask & (1 << i)) !== 0);
        if (chosen.length !== 11) continue;
        const ids = chosen.map(i => i.reported.instanceId);
        if (validateSquad(items, reviews, requirements, ids)) best = Math.min(best, chosen.reduce((cost, i) => cost + i.reported.rating! ** 2, 0));
      }
      const result = solve(items, reviews, requirements);
      expect(result.status).toBe(best === Infinity ? 'no-solution' : 'optimal');
      expect(result.cost).toBe(best === Infinity ? null : best);
    }
  });
});

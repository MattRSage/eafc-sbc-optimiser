import type { SavedItem } from '../inventory/store';

export interface Requirements { size: 11; minRating: number; otherConstraints: false }
export interface Review { eligible: boolean; playerKey: string }
export type Reviews = Record<string, Review>;
export interface Candidate { instanceId: string; definitionId: string; name: string | null; rating: number; playerKey: string; corrected: boolean }
export interface Exclusion { instanceId: string; reason: string }
export interface Result {
  status: 'optimal' | 'no-solution' | 'incomplete';
  squad: Candidate[] | null;
  rating: number | null;
  cost: number | null;
  visited: number;
  excluded: Exclusion[];
}
export const maxNodes = 250_000;

export function parseRequirements(value: unknown): Requirements {
  if (!value || typeof value !== 'object') throw new Error('Enter challenge requirements.');
  const r = value as Record<string, unknown>;
  if (Object.keys(r).some(k => !['size', 'minRating', 'otherConstraints'].includes(k)) || r.size !== 11 || r.otherConstraints !== false) {
    throw new Error('Unsupported challenge: only 11 players and minimum squad rating are supported. No chemistry, quality, rarity, nation, league, club, position or Item Score constraints.');
  }
  if (typeof r.minRating !== 'number' || !Number.isInteger(r.minRating) || r.minRating < 1 || r.minRating > 99) throw new Error('Minimum rating must be an integer from 1 to 99.');
  return { size: 11, minRating: r.minRating, otherConstraints: false };
}

// Provisional community model: round the corrected total, then floor / 11.
export function squadRating(ratings: readonly number[]): number {
  if (ratings.length !== 11 || ratings.some(r => !Number.isInteger(r) || r < 1 || r > 99)) throw new Error('Rating requires 11 known integer ratings from 1 to 99.');
  const sum = ratings.reduce((a, b) => a + b, 0);
  const numerator = 11 * sum + ratings.reduce((bonus, r) => bonus + Math.max(0, 11 * r - sum), 0);
  return Math.floor(Math.floor((2 * numerator + 11) / 22) / 11);
}

export function prepare(items: readonly SavedItem[], reviews: Reviews): { candidates: Candidate[]; excluded: Exclusion[] } {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(item.reported.instanceId, (counts.get(item.reported.instanceId) ?? 0) + 1);
  const candidates: Candidate[] = [];
  const excluded: Exclusion[] = [];
  for (const item of items) {
    const card = { ...item.reported, ...item.corrections };
    const review = Object.hasOwn(reviews, card.instanceId) ? reviews[card.instanceId] : undefined;
    const key = review?.playerKey.trim().toLowerCase();
    const reason = counts.get(card.instanceId) !== 1 ? 'Duplicate instance identity'
      : item.reported.sbcBlocker === 'loan' ? 'Loan or limited-use card'
      : item.reported.sbcBlocker === 'evolution' ? 'Enrolled in an Evolution'
      : item.protected ? 'Protected'
      : item.freshness !== 'seen' ? 'Missing or not rechecked'
      : card.provenance.source !== 'club' ? 'SBC storage unsupported in this spike'
      : !Number.isInteger(card.rating) || card.rating === null || card.rating < 1 || card.rating > 99 ? 'Unknown or invalid rating'
      : !review?.eligible || !key || key.length > 100 ? 'Eligibility or player identity not reviewed'
      : null;
    if (reason) excluded.push({ instanceId: card.instanceId, reason });
    else candidates.push({ instanceId: card.instanceId, definitionId: card.definitionId, name: card.name, rating: card.rating!, playerKey: key!, corrected: 'rating' in item.corrections });
  }
  return { candidates, excluded };
}

export function solve(items: readonly SavedItem[], reviews: Reviews, input: unknown, nodeLimit = maxNodes): Result {
  const requirements = parseRequirements(input);
  if (!Number.isInteger(nodeLimit) || nodeLimit < 1 || nodeLimit > maxNodes) throw new Error('Invalid search budget.');
  if (items.length > 2000) throw new Error('This spike supports at most 2,000 saved records.');
  const { candidates, excluded } = prepare(items, reviews);
  candidates.sort((a, b) => a.rating - b.rating || a.instanceId.localeCompare(b.instanceId));
  let best: Candidate[] | null = null;
  let bestCost = Infinity;
  let visited = 0;
  let exhausted = false;
  const chosen: Candidate[] = [];
  const players = new Set<string>();
  const definitions = new Set<string>();
  const search = (start: number, cost: number) => {
    if (chosen.length === 11) {
      if (cost < bestCost && squadRating(chosen.map(c => c.rating)) >= requirements.minRating) { best = [...chosen]; bestCost = cost; }
      return;
    }
    const needed = 11 - chosen.length;
    if (candidates.length - start < needed) return;
    const lowerBound = candidates.slice(start, start + needed).reduce((total, c) => total + c.rating ** 2, cost);
    if (lowerBound >= bestCost) return;
    const highest = candidates.slice(-needed);
    if (squadRating([...chosen, ...highest].map(c => c.rating)) < requirements.minRating) return;
    for (let i = start; i <= candidates.length - needed; i++) {
      if (visited >= nodeLimit) { exhausted = true; return; }
      visited++;
      const card = candidates[i]!;
      if (players.has(card.playerKey) || definitions.has(card.definitionId)) continue;
      chosen.push(card); players.add(card.playerKey); definitions.add(card.definitionId);
      search(i + 1, cost + card.rating ** 2);
      chosen.pop(); players.delete(card.playerKey); definitions.delete(card.definitionId);
      if (exhausted) return;
    }
  };
  search(0, 0);
  const squad = best as Candidate[] | null;
  if (squad && !validateSquad(items, reviews, requirements, squad.map(c => c.instanceId))) throw new Error('Independent squad validation failed.');
  return { status: exhausted ? 'incomplete' : squad ? 'optimal' : 'no-solution', squad, cost: squad ? bestCost : null, rating: squad ? squadRating(squad.map(c => c.rating)) : null, visited, excluded };
}

// Re-read source records and review evidence; do not trust search candidates or totals.
export function validateSquad(items: readonly SavedItem[], reviews: Reviews, requirements: Requirements, ids: readonly string[]): boolean {
  parseRequirements(requirements);
  if (ids.length !== 11 || new Set(ids).size !== 11) return false;
  const ratings: number[] = [];
  const players = new Set<string>();
  const definitions = new Set<string>();
  for (const id of ids) {
    const matches = items.filter(item => item.reported.instanceId === id);
    if (matches.length !== 1) return false;
    const item = matches[0]!;
    const review = Object.hasOwn(reviews, id) ? reviews[id] : undefined;
    const player = review?.playerKey.trim().toLowerCase();
    const rating = Object.hasOwn(item.corrections, 'rating') ? item.corrections.rating : item.reported.rating;
    if (item.reported.sbcBlocker != null || item.protected || item.freshness !== 'seen' || item.reported.provenance.source !== 'club' || !review?.eligible || !player || player.length > 100 || players.has(player) || definitions.has(item.reported.definitionId)) return false;
    if (typeof rating !== 'number' || !Number.isInteger(rating) || rating < 1 || rating > 99) return false;
    players.add(player); definitions.add(item.reported.definitionId); ratings.push(rating);
  }
  const sum = ratings.reduce((a, b) => a + b, 0);
  const mean = sum / 11;
  const corrected = sum + ratings.reduce((a, b) => a + Math.max(0, b - mean), 0);
  return Math.floor(Math.round(corrected) / 11) >= requirements.minRating;
}

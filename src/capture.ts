import { fields, reconcile, type Card, type Field, type RawObservation, type CardCandidate, type InventoryItem } from './reconciliation';
export { fields, type Card, type Field } from './reconciliation';
export interface Profile { source: 'synthetic' | 'live-sample'; candidate: string; fields: Partial<Record<Field, string>> }
// These selectors describe our synthetic fixture only. No EA selectors are claimed.
export const fixtureProfile: Profile = {
  source: 'synthetic',
  candidate: '[data-fixture-card]',
  fields: Object.fromEntries(fields.map(field => [field, `[data-field="${field}"]`])),
};
// The supplied bio layout has a position header followed by exactly three rows.
const bio = ':scope > .player.item > .ut-item-view--bio:has(> .ut-item-view--positions-header:first-child + .ut-item-row + .ut-item-row + .ut-item-row:last-child)';
export const liveProfile: Profile = {
  source: 'live-sample',
  candidate: 'li.listFUTItem > .rowContent > .entityContainer:has(> .player.item)',
  fields: {
    name: ':scope > .name',
    rating: ':scope > .player.item > .ut-item-view--main > .playerOverview > .rating',
    position: ':scope > .player.item > .ut-item-view--main > .playerOverview > .position, :scope > .player.item > .ut-item-view--bio > .ut-item-view--positions-header > .currentPosition',
    nation: `${bio} > .ut-item-row:nth-child(2) > .ut-item-row-label--left`,
    league: `${bio} > .ut-item-row:nth-child(3) > .ut-item-row-label--left`,
    club: `${bio} > .ut-item-row:nth-child(4) > .ut-item-row-label--left`,
  },
};

export function visible(element: Element): boolean {
  const view = element.ownerDocument.defaultView;
  if (!view || element.ownerDocument.visibilityState === 'hidden' || !element.isConnected || element.closest('[hidden], [inert], [aria-hidden="true"]')) return false;
  for (let node: Element | null = element; node; node = node.parentElement) {
    const style = view.getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse' || parseFloat(style.opacity) === 0) return false;
  }
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0 && rect.top < view.innerHeight && rect.left < view.innerWidth;
}

export function parseCard(element: Element, profile: Profile): Card {
  return Object.fromEntries(fields.map(field => {
    const selector = profile.fields[field];
    const node = selector ? [...element.querySelectorAll(selector)].find(visible) : undefined;
    // Read rendered text only, never attributes, image URLs, IDs, or hidden descendants.
    const parts: string[] = [];
    if (node && visible(node)) {
      const walker = node.ownerDocument.createTreeWalker(node, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const parent = walker.currentNode.parentElement;
        if (parent && visible(parent) && !parent.closest('script, style, template')) {
          parts.push(walker.currentNode.textContent ?? '');
        }
      }
    }
    const text = parts.join(' ').replace(/\s+/g, ' ').trim();
    const safe = text.length <= 80 && !/[\u0000-\u001f]|https?:|www\.|@|token|cookie|bearer|password|session|[?&=]/i.test(text);
    return [field, text && safe && (field !== 'rating' || /^(?:[1-9]\d?|100)$/.test(text)) ? text : null];
  })) as Card;
}

export interface Snapshot {
  active: boolean;
  source: Profile['source'] | 'live-unverified';
  candidates: number;
  sightings: number;
  capped: boolean;
  observations: Card[];
  coverage: Record<Field, number>;
  rawObservations: RawObservation[];
  reconciled: CardCandidate[];
  confirmed: InventoryItem[];
}
export class Capture {
  private active = false;
  private observer?: MutationObserver;
  private timer?: ReturnType<typeof setTimeout>;
  private current = new Map<Element, string>();
  private observations = new Map<string, Card>();
  private raw: RawObservation[] = [];
  private generations = new Map<Element, { id: number; values: Card; due: number }>();
  private published = new Set<number>();
  private conflicts = new Set<number>();
  private flagged = new Set<number>();
  private nextGeneration = 1;
  private settling?: ReturnType<typeof setTimeout>;
  private sightings = 0;
  private capped = false;
  private readonly schedule = () => {
    if (this.timer || !this.active) return;
    this.timer = setTimeout(() => { this.timer = undefined; this.scan(); }, 0);
  };
  constructor(private root: HTMLElement, private profile: Profile | null, private settleMs = 250) {}
  start() {
    if (this.active) return;
    this.active = true;
    this.observer = new MutationObserver(records => {
      // Detach/reinsert in one delivery still breaks continuity.
      for (const record of records) for (const removed of record.removedNodes) {
        for (const element of this.generations.keys()) if (removed === element || removed.contains(element)) this.closeGeneration(element);
      }
      const affected = new Set<Element>();
      let broad = false;
      for (const record of records) {
        const container = [...this.current.keys()].find(element => element.contains(record.target));
        if (container && record.target !== container) affected.add(container);
        else broad = true;
        if (record.type === 'attributes' && ['hidden', 'style', 'class', 'aria-hidden', 'inert'].includes(record.attributeName ?? '')) {
          for (const element of this.generations.keys()) if (record.target === element || record.target.contains(element)) this.closeGeneration(element);
        }
      }
      this.scan(broad ? undefined : affected);
    });
    this.observer.observe(this.root, { subtree: true, childList: true, characterData: true, attributes: true });
    window.addEventListener('scroll', this.schedule, true);
    window.addEventListener('resize', this.schedule);
    document.addEventListener('visibilitychange', this.schedule);
    this.scan();
  }
  stop() {
    this.active = false;
    this.observer?.disconnect();
    clearTimeout(this.settling);
    this.settling = undefined;
    this.generations.clear();
    clearTimeout(this.timer);
    this.timer = undefined;
    window.removeEventListener('scroll', this.schedule, true);
    window.removeEventListener('resize', this.schedule);
    document.removeEventListener('visibilitychange', this.schedule);
  }
  clear() {
    this.stop();
    this.current.clear();
    this.raw = [];
    this.published.clear();
    this.conflicts.clear();
    this.flagged.clear();
    this.nextGeneration = 1;
    this.observations.clear();
    this.sightings = 0;
    this.capped = false;
  }
  private closeGeneration(element: Element) {
    const generation = this.generations.get(element);
    if (generation) this.published.add(generation.id);
    this.generations.delete(element);
  }
  private publishSettled() {
    clearTimeout(this.settling);
    if (!this.active) return;
    const now = Date.now();
    let next = Infinity;
    for (const generation of this.generations.values()) {
      if (generation.due <= now) this.published.add(generation.id);
      else next = Math.min(next, generation.due);
    }
    if (next !== Infinity) this.settling = setTimeout(() => this.publishSettled(), next - now);
  }
  private scan(affected?: Set<Element>) {
    if (!this.active || !this.profile) return;
    const next = affected ? new Map(this.current) : new Map<Element, string>();
    for (const element of affected ?? this.root.querySelectorAll(this.profile.candidate)) {
      next.delete(element);
      if (!element.matches(this.profile.candidate) || !visible(element)) continue;
      const card = parseCard(element, this.profile);
      const key = JSON.stringify(card);
      // Empty recycled placeholders are candidates, but provide no observation.
      if (fields.every(field => card[field] === null)) {
        this.closeGeneration(element);
        next.set(element, '');
        continue;
      }
      if (this.current.get(element) !== key) this.sightings++;
      let generation = this.generations.get(element);
      if (generation && generation.values.name !== null && card.name === null) {
        this.closeGeneration(element);
        generation = undefined;
      }
      const conflict = generation && fields.some(field => card[field] !== null && generation!.values[field] !== null && card[field] !== generation!.values[field]);
      if (conflict && generation) {
        this.conflicts.add(generation.id);
        this.closeGeneration(element);
        generation = undefined;
      }
      if (!generation) {
        generation = { id: this.nextGeneration++, values: { ...card }, due: Date.now() + this.settleMs };
        this.generations.set(element, generation);
        if (conflict) this.conflicts.add(generation.id);
      }
      if (this.current.get(element) !== key || !this.raw.some(observation => observation.correlation === generation!.id)) {
        if (this.raw.length < 500) {
          let view: RawObservation['view'] = 'partial';
          if (this.profile.source === 'live-sample') {
            if ([...element.querySelectorAll('.ut-item-view--main')].some(visible)) view = 'main';
            else if ([...element.querySelectorAll('.ut-item-view--bio')].some(visible)) view = 'bio';
          }
          this.raw.push({ id: this.raw.length + 1, correlation: generation.id, source: this.profile.source, view, values: { ...card } });
          for (const field of fields) if (card[field] !== null) generation.values[field] = card[field];
          generation.due = Date.now() + this.settleMs;
        } else this.capped = true;
      }
      next.set(element, key);
      if (this.observations.has(key)) continue;
      if (this.observations.size >= 500) { this.capped = true; continue; }
      this.observations.set(key, card);
    }
    for (const element of this.generations.keys()) if (!next.has(element)) this.closeGeneration(element);
    this.current = next;
    this.publishSettled();
  }
  markForReview(id: number) {
    if (this.published.has(id)) this.flagged.add(id);
  }
  snapshot(): Snapshot {
    const observations = [...this.observations.values()];
    const reconciled = reconcile(this.raw.filter(observation => this.published.has(observation.correlation)));
    for (const candidate of reconciled) {
      if (this.conflicts.has(candidate.id)) candidate.review.push('conflict');
      if (this.flagged.has(candidate.id)) candidate.review.push('user-review');
    }
    return {
      rawObservations: structuredClone(this.raw), reconciled, confirmed: [],
      active: this.active, source: this.profile?.source ?? 'live-unverified',
      candidates: this.current.size, sightings: this.sightings, capped: this.capped, observations,
      coverage: Object.fromEntries(fields.map(field => [field, observations.filter(card => card[field] !== null).length])) as Record<Field, number>,
    };
  }
}

export function exportJson(snapshot: Snapshot, selected: readonly Field[]): string {
  return JSON.stringify({
    format: 'sbc-dom-observations-v1', source: snapshot.source,
    confidence: snapshot.source === 'synthetic' ? 'synthetic-only' : snapshot.source === 'live-sample' ? 'sample-backed-layout' : 'unverified',
    ownership: 'unknown', sightings: snapshot.sightings, truncated: snapshot.capped,
    observations: snapshot.observations.map(card => Object.fromEntries(
      fields.map(field => [field, selected.includes(field) ? card[field] : null]),
    )),
  }, null, 2);
}

export function exportCandidatesJson(snapshot: Snapshot, selected: readonly Field[]): string {
  const redact = (card: Card) => Object.fromEntries(fields.map(field => [field, selected.includes(field) ? card[field] : null]));
  return JSON.stringify({
    format: 'sbc-inventory-candidates-v1', source: snapshot.source, ownership: 'unconfirmed',
    sightings: snapshot.sightings, truncated: snapshot.capped,
    rawObservations: snapshot.rawObservations.map(observation => ({
      id: observation.id, correlation: observation.correlation, source: observation.source, view: observation.view, values: redact(observation.values),
    })),
    candidates: snapshot.reconciled.map(candidate => ({
      id: candidate.id, values: redact(candidate.values), location: candidate.location,
      confirmation: candidate.confirmation, review: candidate.review,
      provenance: Object.fromEntries(fields.map(field => [field, selected.includes(field) ? candidate.provenance[field] : { observations: [], confidence: 'unknown' }])),
    })),
    confirmedItems: [],
  }, null, 2);
}

export const fields = ['name', 'rating', 'position', 'club', 'league', 'nation', 'cardType', 'tradeable', 'sbcStorage', 'visibleId'] as const;
export type Field = typeof fields[number];
export type Card = Record<Field, string | null>;
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
}
export class Capture {
  private active = false;
  private observer?: MutationObserver;
  private timer?: ReturnType<typeof setTimeout>;
  private current = new Map<Element, string>();
  private observations = new Map<string, Card>();
  private sightings = 0;
  private capped = false;
  private readonly schedule = () => {
    if (this.timer || !this.active) return;
    this.timer = setTimeout(() => { this.timer = undefined; this.scan(); }, 100);
  };
  constructor(private root: HTMLElement, private profile: Profile | null) {}
  start() {
    if (this.active) return;
    this.active = true;
    this.observer = new MutationObserver(this.schedule);
    this.observer.observe(this.root, { subtree: true, childList: true, characterData: true, attributes: true });
    window.addEventListener('scroll', this.schedule, true);
    window.addEventListener('resize', this.schedule);
    document.addEventListener('visibilitychange', this.schedule);
    this.scan();
  }
  stop() {
    this.active = false;
    this.observer?.disconnect();
    clearTimeout(this.timer);
    this.timer = undefined;
    window.removeEventListener('scroll', this.schedule, true);
    window.removeEventListener('resize', this.schedule);
    document.removeEventListener('visibilitychange', this.schedule);
  }
  clear() {
    this.stop();
    this.current.clear();
    this.observations.clear();
    this.sightings = 0;
    this.capped = false;
  }
  private scan() {
    if (!this.active || !this.profile) return;
    const next = new Map<Element, string>();
    for (const element of this.root.querySelectorAll(this.profile.candidate)) {
      if (!visible(element)) continue;
      const card = parseCard(element, this.profile);
      const key = JSON.stringify(card);
      // Empty recycled placeholders are candidates, but provide no observation.
      if (fields.every(field => card[field] === null)) {
        next.set(element, '');
        continue;
      }
      if (this.current.get(element) !== key) this.sightings++;
      next.set(element, key);
      if (this.observations.has(key)) continue;
      if (this.observations.size >= 500) { this.capped = true; continue; }
      this.observations.set(key, card);
    }
    this.current = next;
  }
  snapshot(): Snapshot {
    const observations = [...this.observations.values()];
    return {
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

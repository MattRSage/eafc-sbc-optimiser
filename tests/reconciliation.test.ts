import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Capture, exportCandidatesJson, fields, fixtureProfile, liveProfile } from '../src/capture';
import { confirmInventory, type InventoryItem } from '../src/reconciliation';
import main from './fixtures/player-list-main.html?raw';

let capture: Capture;
const tick = async (ms = 0) => { await Promise.resolve(); await vi.advanceTimersByTimeAsync(ms); };
const markup = (name: string, rating = '', position = '') => `<article data-fixture-card><span data-field="name">${name}</span><span data-field="rating">${rating}</span><span data-field="position">${position}</span></article>`;
const set = (field: string, value: string) => { document.querySelector(`[data-field="${field}"]`)!.textContent = value; };
beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ width: 100, height: 40, top: 10, left: 10, bottom: 50, right: 110, x: 10, y: 10, toJSON() {} });
  document.body.innerHTML = markup('Yıldız');
  capture = new Capture(document.body, fixtureProfile);
});
afterEach(() => { capture.stop(); vi.useRealTimers(); vi.restoreAllMocks(); });

it('settles progressive visible fields into one candidate with exact raw provenance', async () => {
  capture.start();
  await tick(100); set('rating', '84');
  await tick(100); set('position', 'CAM');
  await tick(249);
  expect(capture.snapshot().reconciled).toEqual([]);
  await tick(1);
  const snapshot = capture.snapshot();
  expect(snapshot.rawObservations).toHaveLength(3);
  expect(snapshot.reconciled).toHaveLength(1);
  expect(snapshot.reconciled[0]).toMatchObject({ values: { name: 'Yıldız', rating: '84', position: 'CAM', club: null }, confirmation: 'unconfirmed', location: 'unknown', provenance: { rating: { observations: [2, 3], confidence: 'observed' }, club: { observations: [], confidence: 'unknown' } } });
  expect(snapshot.confirmed).toEqual([]);
});

it('keeps stable partial cards and supports a configurable window', async () => {
  capture = new Capture(document.body, fixtureProfile, 300);
  capture.start(); await tick(299);
  expect(capture.snapshot().reconciled).toHaveLength(0);
  await tick(1);
  expect(capture.snapshot().reconciled[0]?.review).toContain('incomplete');
});

it('merges main and bio only under continuous visible container identity', async () => {
  document.body.innerHTML = main;
  document.querySelector('.entityContainer > .name')!.textContent = 'Hazard';
  capture = new Capture(document.body, liveProfile);
  capture.start();
  (document.querySelector('.ut-item-view--main') as HTMLElement).style.display = 'none';
  (document.querySelector('.ut-item-view--bio') as HTMLElement).style.display = '';
  await tick(250);
  const snapshot = capture.snapshot();
  expect(snapshot.rawObservations.map(sample => sample.view)).toEqual(['main', 'bio']);
  expect(snapshot.rawObservations[1]?.values.rating).toBeNull();
  expect(snapshot.reconciled).toHaveLength(1);
  expect(snapshot.reconciled[0]?.values).toMatchObject({ name: 'Hazard', rating: '84', nation: 'NNN', league: 'DEM 1', club: 'DEM', tradeable: null, cardType: null });
});

it('does not read previously hidden main fields when capture starts in bio', async () => {
  document.body.innerHTML = main;
  (document.querySelector('.ut-item-view--main') as HTMLElement).hidden = true;
  (document.querySelector('.ut-item-view--bio') as HTMLElement).style.display = '';
  capture = new Capture(document.body, liveProfile);
  capture.start(); await tick(250);
  expect(capture.snapshot().reconciled[0]?.values.rating).toBeNull();
});

it('splits recycled names arriving in stages and retains fast observations', async () => {
  capture.start(); await tick(20);
  set('name', 'Next Example'); await tick(20);
  set('rating', '89'); await tick(20);
  set('position', 'LM'); await tick(250);
  expect(capture.snapshot().reconciled.map(candidate => candidate.values)).toMatchObject([
    { name: 'Yıldız', rating: null, position: null }, { name: 'Next Example', rating: '89', position: 'LM' },
  ]);
});

it('splits conflicts instead of overwriting a settled value', async () => {
  set('rating', '84'); capture.start(); await tick(250);
  set('rating', '89'); await tick(250);
  const candidates = capture.snapshot().reconciled;
  expect(candidates.map(candidate => candidate.values.rating)).toEqual(['84', '89']);
  expect(candidates.every(candidate => candidate.review.includes('conflict') && candidate.review.includes('same-name'))).toBe(true);
});

it('never collapses separate same-name containers or distinct visible versions', async () => {
  document.body.innerHTML = markup('Same Example', '84') + markup('Same Example', '84');
  const cards = document.querySelectorAll('article');
  cards[0]!.insertAdjacentHTML('beforeend', '<span data-field="cardType">Gold</span>');
  cards[1]!.insertAdjacentHTML('beforeend', '<span data-field="cardType">Special</span>');
  capture.start(); await tick(250);
  const candidates = capture.snapshot().reconciled;
  expect(candidates.map(candidate => candidate.values.cardType)).toEqual(['Gold', 'Special']);
  expect(candidates.every(candidate => candidate.review.includes('same-name'))).toBe(true);
});

it.each(['hide', 'detach', 'empty', 'name-missing', 'offscreen', 'background'])('closes continuity on %s and retains unseen candidates on revisit', async mode => {
  set('rating', '84'); capture.start(); await tick(10);
  const card = document.querySelector('article')!;
  const original = card.innerHTML;
  if (mode === 'hide') card.hidden = true;
  if (mode === 'detach') card.remove();
  if (mode === 'empty') card.replaceChildren();
  if (mode === 'name-missing') set('name', '');
  if (mode === 'offscreen') { vi.mocked(Element.prototype.getBoundingClientRect).mockReturnValue({ width: 100, height: 40, top: 10000, left: 10, bottom: 10040, right: 110 } as DOMRect); window.dispatchEvent(new Event('scroll')); }
  if (mode === 'background') { vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden'); document.dispatchEvent(new Event('visibilitychange')); }
  await tick(10);
  expect(capture.snapshot().reconciled[0]?.values.rating).toBe('84');
  vi.mocked(Element.prototype.getBoundingClientRect).mockReturnValue({ width: 100, height: 40, top: 10, left: 10, bottom: 50, right: 110 } as DOMRect);
  if (mode === 'background') { vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible'); document.dispatchEvent(new Event('visibilitychange')); }
  card.hidden = false; card.innerHTML = original;
  if (!card.isConnected) document.body.append(card);
  window.dispatchEvent(new Event('scroll'));
  await tick(250);
  expect(capture.snapshot().reconciled.length).toBeGreaterThanOrEqual(2);
});

it('recognizes detach and reinsert in one mutation delivery', async () => {
  capture.start(); const card = document.querySelector('article')!;
  card.remove(); document.body.append(card); await tick(250);
  expect(capture.snapshot().reconciled).toHaveLength(2);
});

it('finalises observed candidates on stop without another DOM read, then resets correlation on restart', async () => {
  capture.start(); await tick(100);
  const query = vi.spyOn(document.body, 'querySelectorAll');
  set('name', 'Not sampled before stop');
  capture.stop();
  expect(query).not.toHaveBeenCalled();
  expect(capture.snapshot().reconciled).toHaveLength(1);
  expect(capture.snapshot().reconciled[0]?.values.name).toBe('Yıldız');
  expect(capture.snapshot().reconciled[0]?.review).toContain('unsettled');
  const stopped = exportCandidatesJson(capture.snapshot(), fields);
  expect(JSON.parse(stopped).candidates[0].values.name).toBe('Yıldız');
  await tick(300);
  expect(exportCandidatesJson(capture.snapshot(), fields)).toBe(stopped);
  capture.start(); await tick(250);
  expect(capture.snapshot().reconciled).toHaveLength(2);
  expect(capture.snapshot().rawObservations).toHaveLength(2);
  capture.clear(); await tick(300);
  expect(capture.snapshot()).toMatchObject({ reconciled: [], rawObservations: [], confirmed: [], sightings: 0 });
});

it.each(['settle', 'stop'])('quarantines superseded mixed-player samples when recycling finishes with %s', async finish => {
  document.body.innerHTML = markup('Hazard', '89', 'LM');
  capture.start(); await tick(250);
  set('name', 'Kelly'); await tick(30);
  set('rating', '86'); await tick(30);
  set('position', 'CM'); await tick();
  if (finish === 'stop') capture.stop();
  else await tick(250);
  const snapshot = capture.snapshot();
  const exported = JSON.parse(exportCandidatesJson(snapshot, fields));
  expect(exported.candidates.map((candidate: { values: unknown }) => candidate.values)).toMatchObject([
    { name: 'Hazard', rating: '89', position: 'LM' },
    { name: 'Kelly', rating: '86', position: 'CM' },
  ]);
  expect(exported.candidates).toHaveLength(2);
  expect(snapshot.rawObservations.map(sample => sample.values)).toMatchObject([
    { name: 'Hazard', rating: '89', position: 'LM' },
    { name: 'Kelly', rating: '89', position: 'LM' },
    { name: 'Kelly', rating: '86', position: 'LM' },
    { name: 'Kelly', rating: '86', position: 'CM' },
  ]);
  expect(snapshot.reconciled[1]?.provenance.rating.observations).toEqual([4]);
  expect(exported.rawObservations.map((sample: { quarantined: boolean }) => sample.quarantined)).toEqual([false, true, true, false]);
  if (finish === 'stop') expect(snapshot.reconciled[1]?.review).toContain('unsettled');
  capture.clear();
  expect(capture.snapshot().quarantinedCorrelations).toEqual([]);
});

it('scans only the affected card on an in-card text update', async () => {
  capture.start();
  const query = vi.spyOn(document.body, 'querySelectorAll');
  set('rating', '84'); await tick(250);
  expect(query).not.toHaveBeenCalled();
  expect(capture.snapshot().reconciled[0]?.values.rating).toBe('84');
});

it('redacts candidate values and raw evidence together without leaking provenance for redacted fields', async () => {
  capture.start(); await tick(250);
  const exported = JSON.parse(exportCandidatesJson(capture.snapshot(), fields.filter(field => field !== 'name')));
  expect(JSON.stringify(exported)).not.toContain('Yıldız');
  expect(exported).toMatchObject({ format: 'sbc-inventory-candidates-v1', ownership: 'unconfirmed', confirmedItems: [] });
  expect(exported.candidates[0]).toMatchObject({ values: { name: null }, provenance: { name: { observations: [], confidence: 'unknown' } }, confirmation: 'unconfirmed' });
  expect(exported.rawObservations[0].values.name).toBeNull();
});

const item = (candidateId: number, location: InventoryItem['location'], verifiedVersion: string | null): InventoryItem => ({ candidateId, location, verifiedVersion, confirmation: 'user-confirmed' });
it('enforces exact-version main-club uniqueness without treating name or unknown version as unique', () => {
  const existing = [item(1, 'main-club', 'verified-version-a')];
  expect(confirmInventory(existing, item(2, 'main-club', 'verified-version-a'))).toEqual({ accepted: false, reason: 'same-version-main-club' });
  expect(confirmInventory(existing, item(2, 'main-club', 'verified-version-b')).accepted).toBe(true);
  expect(confirmInventory(existing, item(2, 'main-club', null)).accepted).toBe(true);
  expect(confirmInventory(existing, item(2, 'unknown', 'verified-version-a')).accepted).toBe(true);
  expect(confirmInventory(existing, item(1, 'main-club', 'verified-version-a')).accepted).toBe(false);
});
it('allows confirmed identical-version copies in SBC storage', () => {
  expect(confirmInventory([item(1, 'sbc-storage', 'verified-version-a')], item(2, 'sbc-storage', 'verified-version-a')).accepted).toBe(true);
});

it('retains session review flags across snapshots and stop, and clears them with the session', async () => {
  capture.start(); await tick(250);
  const id = capture.snapshot().reconciled[0]!.id;
  capture.markForReview(id); capture.stop();
  expect(capture.snapshot().reconciled[0]?.review).toContain('user-review');
  capture.clear(); capture.start(); await tick(250);
  expect(capture.snapshot().reconciled[0]?.review).not.toContain('user-review');
});

it('bounds raw evidence even when identical descriptions recur', async () => {
  document.body.innerHTML = Array.from({ length: 502 }, () => markup('Same Example')).join('');
  capture.start(); await tick(250);
  const snapshot = capture.snapshot();
  expect(snapshot.observations).toHaveLength(1);
  expect(snapshot.rawObservations).toHaveLength(500);
  expect(snapshot.reconciled).toHaveLength(500);
  expect(snapshot).toMatchObject({ sightings: 502, capped: true });
});

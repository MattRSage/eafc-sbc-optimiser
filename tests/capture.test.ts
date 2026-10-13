import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import fixture from './fixtures/cards.html?raw';
import { Capture, exportJson, fields, fixtureProfile, liveProfile, parseCard } from '../src/capture';

let capture: Capture;
beforeEach(() => {
  document.body.innerHTML = fixture;
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ width: 100, height: 40, top: 10, left: 10, bottom: 50, right: 110, x: 10, y: 10, toJSON() {} });
  // jsdom has no layout. Actual rendered visibility is checked in Chromium.
  capture = new Capture(document.body, fixtureProfile);
});
afterEach(() => { capture.stop(); vi.restoreAllMocks(); });
const settle = () => new Promise(resolve => setTimeout(resolve, 150));

describe('capture lifecycle and observations', () => {
  it('does not read cards before opt-in; disconnects pending and future changes on stop', async () => {
    expect(capture.snapshot().observations).toHaveLength(0);
    capture.start();
    expect(capture.snapshot().sightings).toBe(2);
    document.body.append(document.body.firstElementChild!.cloneNode(true));
    capture.stop();
    await settle();
    expect(capture.snapshot().sightings).toBe(2);
    capture.start();
    expect(capture.snapshot().sightings).toBe(3);
    capture.clear();
    expect(capture.snapshot()).toMatchObject({ active: false, sightings: 0, candidates: 0, observations: [] });
  });
  it('counts extra visible nodes as sightings without claiming duplicate ownership', async () => {
    capture.start(); capture.start();
    document.body.append(document.body.firstElementChild!.cloneNode(true));
    await settle();
    expect(capture.snapshot()).toMatchObject({ candidates: 3, sightings: 3 });
    expect(capture.snapshot().observations).toHaveLength(2);
    document.body.setAttribute('data-unrelated', 'change');
    await settle();
    expect(capture.snapshot().sightings).toBe(3);
    document.body.lastElementChild!.remove();
    await settle();
    expect(capture.snapshot().observations).toHaveLength(2);
  });
  it('handles recycled markup as a new description', async () => {
    capture.start();
    document.querySelector('[data-field="name"]')!.textContent = 'New Example';
    await settle();
    expect(capture.snapshot().observations).toHaveLength(3);
    expect(capture.snapshot().sightings).toBe(3);
  });
  it('does not query live cards without verified selectors', () => {
    const query = vi.spyOn(document.body, 'querySelectorAll');
    const live = new Capture(document.body, liveProfile);
    live.start();
    expect(query).not.toHaveBeenCalled();
    expect(live.snapshot()).toMatchObject({ active: true, source: 'live-unverified', observations: [] });
    live.stop();
  });
  it('bounds retained descriptions', () => {
    document.body.innerHTML = Array.from({ length: 502 }, (_, i) => `<article data-fixture-card><span data-field="name">Example ${i}</span></article>`).join('');
    capture.start();
    expect(capture.snapshot().observations).toHaveLength(500);
    expect(capture.snapshot().capped).toBe(true);
  });
});

describe('parser and export boundary', () => {
  it('reports unknown fields and coverage', () => {
    capture.start();
    expect(capture.snapshot().observations[1]).toMatchObject({ name: 'Sam Sample', club: null, visibleId: null });
    expect(capture.snapshot().coverage).toMatchObject({ name: 2, club: 1 });
  });
  it('ignores hidden and offscreen candidates and fields', () => {
    (document.body.firstElementChild as HTMLElement).hidden = true;
    (document.querySelectorAll('[data-field="rating"]')[1] as HTMLElement).style.display = 'none';
    capture.start();
    expect(capture.snapshot().observations).toHaveLength(1);
    expect(capture.snapshot().observations[0]?.rating).toBeNull();
  });
  it('does not observe background tabs', () => {
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    capture.start();
    expect(capture.snapshot().observations).toHaveLength(0);
  });
  it('rejects URLs, credentials, oversized strings, and invalid ratings', () => {
    document.querySelector('[data-field="name"]')!.textContent = 'https://example.test/?token=secret';
    document.querySelector('[data-field="club"]')!.textContent = 'a'.repeat(81);
    document.querySelector('[data-field="rating"]')!.textContent = '999';
    expect(parseCard(document.body.firstElementChild!, fixtureProfile)).toMatchObject({ name: null, club: null, rating: null });
  });
  it('exports only whitelisted fields, redacts deselected fields, and makes unknown ownership explicit', () => {
    capture.start();
    const snapshot = capture.snapshot();
    Object.assign(snapshot.observations[0]!, { cookie: 'secret', url: 'https://example.test' });
    const json = exportJson(snapshot, fields.filter(field => field !== 'visibleId' && field !== 'name'));
    expect(json).not.toContain('secret');
    expect(json).not.toContain('https://');
    expect(json).not.toContain('Alex Example');
    expect(JSON.parse(json)).toMatchObject({ ownership: 'unknown', confidence: 'synthetic-only', observations: [{ name: null, visibleId: null }, { name: null, visibleId: null }] });
  });
});

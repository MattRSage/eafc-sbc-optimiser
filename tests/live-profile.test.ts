import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import main from './fixtures/player-list-main.html?raw';
import bio from './fixtures/player-list-bio.html?raw';
import { Capture, exportJson, fields, liveProfile, parseCard } from '../src/capture';

let capture: Capture;
beforeEach(() => {
  document.body.innerHTML = main;
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ width: 100, height: 40, top: 10, left: 10, bottom: 50, right: 110, x: 10, y: 10, toJSON() {} });
  capture = new Capture(document.body, liveProfile);
});
afterEach(() => { capture.stop(); vi.restoreAllMocks(); });
const card = () => document.querySelector(liveProfile.candidate)!;
const settle = () => new Promise(resolve => setTimeout(resolve, 150));

it('reads the visible main view and outer name, leaving hidden bio and class-only status unknown', () => {
  expect(parseCard(card(), liveProfile)).toEqual({
    name: 'Alex Example', rating: '84', position: 'CM', nation: null, league: null, club: null,
    cardType: null, tradeable: null, sbcStorage: null, visibleId: null,
  });
});

it('reads visible bio abbreviations and current position without hidden rating or alternate positions', () => {
  document.body.innerHTML = bio;
  expect(parseCard(card(), liveProfile)).toEqual({
    name: 'Alex Example', rating: null, position: 'CM', nation: 'NNN', league: 'DEM 1', club: 'DEM',
    cardType: null, tradeable: null, sbcStorage: null, visibleId: null,
  });
});

it('fails closed for missing, inserted, or renamed bio rows', () => {
  for (const change of ['remove', 'insert', 'rename']) {
    document.body.innerHTML = bio;
    const row = document.querySelector('.ut-item-row')!;
    if (change === 'remove') row.remove();
    if (change === 'insert') row.after(row.cloneNode(true));
    if (change === 'rename') row.className = 'different-layout';
    expect(parseCard(card(), liveProfile)).toMatchObject({ name: 'Alex Example', nation: null, league: null, club: null });
  }
});

it('does not fall back to hidden or unrelated names when a field is missing', () => {
  card().querySelector(':scope > .name')!.remove();
  card().querySelector('.main-view.name')!.textContent = 'Wrong name';
  expect(parseCard(card(), liveProfile).name).toBeNull();
  card().querySelector('.rating')!.remove();
  expect(parseCard(card(), liveProfile).rating).toBeNull();
});

it('ignores unrelated list items and synthetic cards', () => {
  document.body.innerHTML = '<ul><li class="listFUTItem"><div class="rowContent"><div class="entityContainer"><div class="item manager"></div><div class="name">Manager Example</div></div></div></li></ul><article data-fixture-card><span data-field="name">Fixture</span></article>';
  capture.start();
  expect(capture.snapshot()).toMatchObject({ candidates: 0, observations: [] });
});

it('requires opt-in and retains separate partial observations across view switches without merging identity', async () => {
  const query = vi.spyOn(document.body, 'querySelectorAll');
  expect(capture.snapshot().observations).toEqual([]);
  expect(query).not.toHaveBeenCalled();
  capture.start();
  const mainView = card().querySelector<HTMLElement>('.ut-item-view--main')!;
  const bioView = card().querySelector<HTMLElement>('.ut-item-view--bio')!;
  mainView.style.display = 'none'; bioView.style.display = '';
  await settle();
  expect(capture.snapshot()).toMatchObject({ source: 'live-sample', sightings: 2 });
  expect(capture.snapshot().observations).toHaveLength(2);
  expect(capture.snapshot().observations[1]).toMatchObject({ rating: null, nation: 'NNN' });
  mainView.style.display = ''; bioView.style.display = 'none';
  await settle();
  expect(capture.snapshot().observations).toHaveLength(2);
  const output = JSON.parse(exportJson(capture.snapshot(), fields));
  expect(output).toMatchObject({ source: 'live-sample', confidence: 'sample-backed-layout', ownership: 'unknown' });
});

it('deduplicates replaced nodes, captures recycled text, retains absent cards, and stops pending scans', async () => {
  capture.start();
  const item = document.querySelector('li')!;
  item.replaceWith(item.cloneNode(true));
  await settle();
  expect(capture.snapshot().observations).toHaveLength(1);
  card().querySelector(':scope > .name')!.firstChild!.nodeValue = 'Sam Sample';
  await settle();
  expect(capture.snapshot().observations).toHaveLength(2);
  document.querySelector('li')!.remove();
  await settle();
  expect(capture.snapshot()).toMatchObject({ candidates: 0 });
  expect(capture.snapshot().observations).toHaveLength(2);
  document.body.innerHTML = bio;
  capture.stop();
  await settle();
  expect(capture.snapshot().observations).toHaveLength(2);
  capture.start();
  expect(capture.snapshot().observations).toHaveLength(3);
});

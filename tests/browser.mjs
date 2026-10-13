import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import { readFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';

const extension = resolve('.output/chrome-mv3');
const manifest = JSON.parse(await readFile(join(extension, 'manifest.json'), 'utf8'));
assert.equal(manifest.manifest_version, 3);
assert.deepEqual(manifest.permissions ?? [], []);
assert.deepEqual(manifest.content_scripts[0].matches, ['https://www.ea.com/ea-sports-fc/ultimate-team/web-app/*']);
assert.equal(manifest.content_scripts[0].world, 'ISOLATED');
const id = createHash('sha256').update(extension).digest('hex').slice(0, 32).replace(/[0-9a-f]/g, char => String.fromCharCode(97 + parseInt(char, 16)));
const profile = await mkdtemp(join(tmpdir(), 'sbc-browser-'));
const context = await chromium.launchPersistentContext(profile, {
  channel: 'chromium', headless: true, viewport: { width: 1100, height: 1000 },
  args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
});
const errors = [];
const requests = [];
context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
await context.route(/^https?:/, route => { requests.push(route.request().url()); return route.abort(); });
try {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${id}/demo.html`);
  const click = name => page.getByRole('button', { name, exact: true }).click();
  const counts = () => page.locator('#counts').textContent();
  const refresh = async () => { await page.waitForTimeout(200); await click('Refresh diagnostics'); };
  assert.match(await counts(), /0 distinct descriptions · 0 sightings/);
  await click('Enable capture');
  assert.match(await counts(), /2 distinct descriptions · 2 sightings/);
  await click('Add another Alex card'); await refresh();
  assert.match(await counts(), /3 visible candidates.*2 distinct descriptions · 3 sightings/);
  await click('Disable capture');
  await click('Add another Alex card'); await refresh();
  assert.match(await counts(), /3 sightings/);
  await click('Enable capture');
  assert.match(await counts(), /4 sightings/);
  await click('Review JSON export');
  await page.locator('input[value="name"]').uncheck();
  const preview = await page.locator('#preview').textContent();
  assert.equal(JSON.parse(preview).observations[0].name, null);
  assert.equal(JSON.parse(preview).observations[0].visibleId, null);
  const downloadEvent = page.waitForEvent('download');
  await click('Download reviewed JSON');
  const download = await downloadEvent;
  await mkdir('test-results', { recursive: true });
  await download.saveAs('test-results/synthetic-export.json');
  assert.equal(await readFile('test-results/synthetic-export.json', 'utf8'), preview);
  // Only this synthetic extension page is manipulated by the test, never EA.
  await click('Clear session');
  await page.locator('#cards').evaluate(cards => {
    cards.children[1].style.display = 'none';
    cards.children[2].style.position = 'absolute';
    cards.children[2].style.top = '10000px';
    cards.children[3].style.opacity = '0';
    cards.querySelector('[data-field="name"]').innerHTML = 'Alex Example<span hidden>SECRET</span>';
    cards.querySelector('[data-field="club"]').style.visibility = 'hidden';
  });
  await click('Enable capture');
  assert.match(await counts(), /1 visible candidates/);
  await click('Review JSON export');
  const visibleExport = JSON.parse(await page.locator('#preview').textContent());
  assert.equal(visibleExport.observations[0].name, 'Alex Example');
  assert.equal(visibleExport.observations[0].club, null);
  await page.screenshot({ path: 'test-results/demo.png', fullPage: false });
  await page.reload();
  assert.match(await counts(), /0 distinct descriptions · 0 sightings/);
  await click('Enable capture');
  await click('Recycle first card'); await refresh();
  assert.match(await counts(), /2 visible candidates.*2 distinct descriptions · 3 sightings/);
  await click('Review JSON export');
  assert.equal(JSON.parse(await page.locator('#preview').textContent()).observations[0].tradeable, 'Untradeable');
  await click('Hide or show first card'); await refresh();
  assert.match(await counts(), /1 visible candidates.*2 distinct descriptions · 3 sightings/);
  await click('Hide or show first card'); await refresh();
  assert.match(await counts(), /2 visible candidates.*2 distinct descriptions · 4 sightings/);
  await click('Disable capture');
  await click('Recycle first card'); await refresh();
  assert.match(await counts(), /4 sightings/);
  await click('Enable capture');
  assert.match(await counts(), /2 distinct descriptions · 5 sightings/);
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${id}/popup.html`);
  await popup.waitForFunction(() => document.querySelector('#status').textContent.includes('No supported tab'));
  // Only sanitised local fixtures are served here; no requests reach EA.
  const playerFixture = await readFile('tests/fixtures/player-list-main.html', 'utf8');
  await context.route('https://www.ea.com/ea-sports-fc/ultimate-team/web-app/', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><title>Sanitised player-list test</title><body>${playerFixture}</body>` }));
  const target = await context.newPage();
  await target.goto('https://www.ea.com/ea-sports-fc/ultimate-team/web-app/');
  const send = command => popup.evaluate(async command => {
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (tab.id === undefined) continue;
      try { const result = await chrome.tabs.sendMessage(tab.id, { command }); if (result) return result; } catch {}
    }
    throw new Error('Content script did not respond');
  }, command);
  assert.equal((await send('status')).active, false);
  assert.deepEqual((await send('status')).observations, []);
  const initial = await send('start');
  assert.equal(initial.active, true);
  assert.equal(initial.source, 'live-sample');
  assert.equal(initial.observations.length, 1);
  assert.equal(initial.observations[0].name, 'Alex Example');
  assert.equal(initial.observations[0].rating, '84');
  assert.equal(initial.observations[0].nation, null);
  // Manual view changes are simulated only on the routed local fixture.
  await target.locator('.entityContainer').evaluate(element => {
    element.querySelector('.ut-item-view--main').style.display = 'none';
    element.querySelector('.ut-item-view--bio').style.display = '';
  });
  await target.waitForTimeout(200);
  await target.waitForTimeout(100);
  const switched = await send('status');
  assert.equal(switched.reconciled.length, 1);
  assert.equal(switched.reconciled[0].values.rating, '84');
  assert.equal(switched.reconciled[0].values.nation, 'NNN');
  assert.equal(switched.reconciled[0].confirmation, 'unconfirmed');
  assert.deepEqual(switched.confirmed, []);
  assert.equal(switched.observations.length, 2);
  assert.equal(switched.observations[1].rating, null);
  assert.equal(switched.observations[1].position, 'CM');
  assert.equal(switched.observations[1].nation, 'NNN');
  assert.equal(switched.observations[1].league, 'DEM 1');
  assert.equal(switched.observations[1].club, 'DEM');
  assert.equal(switched.observations[1].tradeable, null);
  assert.equal(switched.observations[1].visibleId, null);
  assert.equal((await send('stop')).active, false);
  await target.locator('.entityContainer > .name').evaluate(element => { element.textContent = 'Sam Sample'; });
  await target.waitForTimeout(200);
  assert.equal((await send('status')).observations.length, 2);
  assert.equal((await send('start')).observations.length, 3);
  const cleared = await send('clear');
  assert.equal(cleared.active, false);
  assert.deepEqual(cleared.observations, []);
  // Regression fixtures: stopping must preserve sampled evidence, and recycled
  // name/stat transitions must stay raw evidence rather than extra candidates.
  await target.locator('.entityContainer').evaluate(element => {
    element.querySelector('.ut-item-view--main').style.display = '';
    element.querySelector('.ut-item-view--bio').style.display = 'none';
    element.querySelector(':scope > .name').textContent = 'Hazard';
    element.querySelector('.rating').textContent = '89';
    element.querySelector('.position').textContent = 'LM';
  });
  await send('start');
  const stoppedPending = await send('stop');
  assert.equal(stoppedPending.reconciled.length, 1);
  assert.equal(stoppedPending.reconciled[0].values.name, 'Hazard');
  assert(stoppedPending.reconciled[0].review.includes('unsettled'));
  await target.waitForTimeout(300);
  assert.deepEqual((await send('status')).reconciled, stoppedPending.reconciled);
  await send('clear'); await send('start');
  await target.waitForTimeout(300);
  await target.locator('.entityContainer > .name').evaluate(element => { element.textContent = 'Kelly'; });
  await target.waitForTimeout(30);
  await target.locator('.playerOverview').evaluate(element => {
    element.querySelector('.rating').textContent = '86';
    element.querySelector('.position').textContent = 'CM';
  });
  await target.waitForTimeout(30);
  const recycledStopped = await send('stop');
  assert.deepEqual(recycledStopped.reconciled.map(candidate => [candidate.values.name, candidate.values.rating, candidate.values.position]), [
    ['Hazard', '89', 'LM'], ['Kelly', '86', 'CM'],
  ]);
  assert.equal(recycledStopped.rawObservations.length, 3);
  assert.deepEqual(recycledStopped.quarantinedCorrelations, [recycledStopped.rawObservations[1].correlation]);
  await send('clear');

  await page.reload();
  await page.locator('#cards').evaluate(cards => {
    cards.innerHTML = '<article data-fixture-card><span data-field="name">Yıldız</span><span data-field="rating"></span><span data-field="position"></span></article>';
  });
  await click('Enable capture');
  await page.locator('[data-field="rating"]').evaluate(element => { element.textContent = '84'; });
  await page.waitForTimeout(50);
  await page.locator('[data-field="position"]').evaluate(element => { element.textContent = 'CAM'; });
  await page.waitForTimeout(300); await click('Refresh diagnostics');
  assert.match(await counts(), /1 reconciled candidates · 0 confirmed owned items/);
  await click('Mark for review');
  await click('Review candidate JSON export');
  let candidateExport = JSON.parse(await page.locator('#preview').textContent());
  assert.equal(candidateExport.format, 'sbc-inventory-candidates-v1');
  assert.equal(candidateExport.candidates.length, 1);
  assert.equal(candidateExport.candidates[0].values.position, 'CAM');
  assert(candidateExport.candidates[0].review.includes('user-review'));
  await page.locator('input[value="name"]').uncheck();
  candidateExport = JSON.parse(await page.locator('#preview').textContent());
  assert.equal(candidateExport.candidates[0].values.name, null);
  assert(candidateExport.rawObservations.every(sample => sample.values.name === null));
  const candidateDownloadEvent = page.waitForEvent('download');
  await click('Download reviewed JSON');
  await (await candidateDownloadEvent).saveAs('test-results/candidate-export.json');
  await page.locator('[data-field="name"]').evaluate(element => { element.textContent = 'Next Example'; });
  await page.waitForTimeout(30);
  await page.locator('[data-field="rating"]').evaluate(element => { element.textContent = '89'; });
  await page.waitForTimeout(300); await click('Refresh diagnostics');
  await click('Review candidate JSON export');
  candidateExport = JSON.parse(await page.locator('#preview').textContent());
  assert.equal(candidateExport.candidates[0].values.name, 'Yıldız');
  assert(candidateExport.candidates.some(candidate => candidate.values.name === 'Next Example'));
  assert(candidateExport.candidates.every(candidate => candidate.confirmation === 'unconfirmed'));
  await click('Disable capture');
  await page.locator('[data-field="name"]').evaluate(element => { element.textContent = 'Stopped Example'; });
  await page.waitForTimeout(300); await click('Refresh diagnostics');
  await click('Review candidate JSON export');
  assert(!((await page.locator('#preview').textContent()).includes('Stopped Example')));
  await click('Clear session');
  assert.match(await counts(), /0 raw partial observations · 0 reconciled candidates · 0 confirmed owned items/);
  assert.deepEqual(errors, []);
  assert.deepEqual(requests, []);
  console.log('PASS: built MV3 extension, opt-in/stop/restart, deduplication, rendered visibility, redaction/download, reload reset, popup fallback, content-script main/bio extraction, hidden-field exclusion, zero external requests.');
} finally {
  await context.close();
  await rm(profile, { recursive: true, force: true });
}

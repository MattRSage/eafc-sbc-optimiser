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
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${id}/popup.html`);
  await popup.waitForFunction(() => document.querySelector('#status').textContent.includes('No supported tab'));
  // A routed blank synthetic page exercises the content-script bridge without contacting EA.
  await context.route('https://www.ea.com/ea-sports-fc/ultimate-team/web-app/', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Synthetic bridge test</title><body>No account or live markup</body>' }));
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
  assert.equal((await send('start')).active, true);
  assert.deepEqual((await send('status')).observations, []);
  assert.equal((await send('stop')).active, false);
  assert.deepEqual(errors, []);
  assert.deepEqual(requests, []);
  console.log('PASS: built MV3 extension, opt-in/stop/restart, deduplication, rendered visibility, redaction/download, reload reset, popup fallback, content-script messaging, zero external requests.');
} finally {
  await context.close();
  await rm(profile, { recursive: true, force: true });
}

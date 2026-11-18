import assert from 'node:assert/strict';
import { testLibrary } from './library-browser.mjs';

export async function testInventory({ context, target, send, id }) {
  await target.evaluate(() => {
    window.inventoryFixture = { calls: [], mode: 'normal', delay: 5, detached: 0 };
    window.UTSearchCriteriaDTO = class {};
    window.SearchType = { PLAYER: 'player' };
    const read = source => criteria => {
      const fixture = window.inventoryFixture;
      fixture.calls.push({ source, offset: criteria.offset, count: criteria.count, type: criteria.type });
      const mode = fixture.mode;
      return {
        observe(owner, callback) {
          setTimeout(() => {
            const item = { id: source === 'club' ? `invented-copy-${criteria.offset}` : 'invented-storage-copy', definitionId: 'invented-definition', rating: 84, getStaticData: () => ({ knownAs: 'Synthetic Player' }), nationId: 12, leagueId: 34, teamId: 56, rareflag: 1, unrelated: 'discard-me' };
            const response = { items: mode === 'missing' && source === 'club' ? [] : [item] };
            if (mode !== 'malformed') response[source === 'club' ? 'retrievedAll' : 'endOfList'] = mode === 'missing' || source === 'sbc-storage' || criteria.offset === 100;
            callback(this, mode === 'auth' || (mode === 'storage-failure' && source === 'sbc-storage') ? { success: false, status: 401 } : { success: true, response });
          }, fixture.delay);
        },
        unobserve() { fixture.detached++; },
      };
    };
    window.services = { Club: { search: read('club') }, Item: { searchStorageItems: read('sbc-storage') } };
  });
  assert.equal((await send('import:status')).status, 'idle');
  await target.evaluate(() => {
    window.postMessage({ channel: 'sbc-inventory-v1', operation: 'begin', run: crypto.randomUUID() }, location.origin);
    window.postMessage({ channel: 'sbc-inventory-v1', operation: 'search', endpoint: 'anything' }, location.origin);
  });
  await target.waitForTimeout(100);
  assert.deepEqual(await target.evaluate(() => window.inventoryFixture.calls), []);

  // Exercise the actual popup controls while pinning its active-tab query to the synthetic target.
  const controls = await context.newPage();
  await controls.addInitScript(() => {
    const query = chrome.tabs.query.bind(chrome.tabs);
    chrome.tabs.query = async options => options.active ? (await query({})).filter(tab => tab.url === 'https://www.ea.com/ea-sports-fc/ultimate-team/web-app/') : query(options);
  });
  await controls.goto(`chrome-extension://${id}/popup.html`);
  await controls.getByRole('button', { name: 'Import club', exact: true }).click();
  await controls.locator('#import-status').filter({ hasText: 'Complete service traversal: club + SBC storage' }).waitFor();
  await controls.getByRole('button', { name: 'Review imported items', exact: true }).click();
  const completed = JSON.parse(await controls.locator('#import-result').textContent());
  assert.equal(completed.items.length, 3);
  assert.equal(completed.items[0].unrelated, undefined);
  assert.equal(completed.items[0].tradeable, null);
  assert.equal(completed.items[0].name, 'Synthetic Player');
  assert.equal(completed.items[0].clubId, 56);
  assert.match(completed.verification, /unverified/);
  await controls.screenshot({ path: 'test-results/inventory-review.png', fullPage: true });
  assert.deepEqual(await target.evaluate(() => window.inventoryFixture.calls), [
    { source: 'club', offset: 0, count: 100, type: 'player' },
    { source: 'club', offset: 100, count: 100, type: 'player' },
    { source: 'sbc-storage', offset: 0, count: 10000, type: 'player' },
  ]);
  await testLibrary(controls, target);
  const waitDone = async () => {
    let state;
    for (let i = 0; i < 100; i++) {
      state = await send('import:status');
      if (state.status !== 'running') return state;
      await target.waitForTimeout(30);
    }
    throw new Error(`Import did not settle: ${state.status}`);
  };
  await target.evaluate(() => { window.inventoryFixture.calls = []; window.inventoryFixture.delay = 400; });
  await controls.getByRole('button', { name: 'Import club', exact: true }).click();
  await target.waitForFunction(() => window.inventoryFixture.calls.length === 1);
  await target.evaluate(() => {
    window.postMessage({ channel: 'sbc-inventory-v1', operation: 'progress', run: 'wrong', snapshot: { status: 'complete' } }, location.origin);
    window.postMessage({ channel: 'sbc-inventory-v1', operation: 'arbitrary-method' }, location.origin);
  });
  assert.equal((await send('import:status')).status, 'running');
  await controls.getByRole('button', { name: 'Cancel import', exact: true }).click();
  assert.equal((await send('import:status')).status, 'cancelled');
  await target.waitForTimeout(500);
  assert.equal((await send('import:status')).status, 'cancelled');
  assert.equal(await target.evaluate(() => window.inventoryFixture.calls.length), 1);
  assert.equal((await send('import:status')).items.length, 0);

  await target.evaluate(() => { window.inventoryFixture.delay = 5; window.services.Item = {}; });
  await send('import:start');
  const partial = await waitDone();
  assert.equal(partial.status, 'partial');
  assert.equal(partial.problem, 'unsupported-service');
  assert.equal(partial.coverage.club, 'complete');
  assert.equal(partial.coverage['sbc-storage'], 'partial');
  assert.equal(partial.items.length, 2);
  await target.evaluate(() => { window.inventoryFixture.mode = 'malformed'; });
  await send('import:start');
  assert.equal((await waitDone()).problem, 'malformed-end-marker');
  await target.evaluate(() => { window.inventoryFixture.mode = 'auth'; });
  await send('import:start');
  assert.equal((await waitDone()).problem, 'authentication');
  await target.evaluate(() => { delete window.services; });
  await send('import:start');
  const unsupported = await waitDone();
  assert.equal(unsupported.status, 'failed');
  assert.equal(unsupported.problem, 'unsupported-service');
  assert.deepEqual((await send('status')).observations, []);
  await controls.close();
  console.log('PASS: inventory popup opt-in, MAIN-world bridge, pagination, both sources, cancellation/late response, repeat import, unsupported service, malformed/auth failures, incomplete source reporting.');
}

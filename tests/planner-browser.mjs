import assert from 'node:assert/strict';

export async function testPlanner(context, id) {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${id}/popup.html`);
  await page.evaluate(async () => {
    const items = Array.from({ length: 13 }, (_, i) => ({ reported: { instanceId: `synthetic-${i}`, definitionId: `synthetic-definition-${i}`, name: `Synthetic Player ${i}`, rating: 84, position: null, tradeable: null, provenance: { kind: 'synthetic-service', source: 'club' } }, protected: i === 12, corrections: {}, correctedAt: null, lastSeen: '2026-11-18T00:00:00Z', freshness: 'seen' }));
    const request = indexedDB.open('sbc-local-inventory', 1);
    const db = await new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = reject; });
    await new Promise((resolve, reject) => {
      const tx = db.transaction('inventory', 'readwrite');
      tx.objectStore('inventory').put({ version: 1, profiles: [{ id: 'planner-fixture', label: 'Synthetic planner', items, latest: null }] }, 'state');
      tx.oncomplete = resolve; tx.onerror = reject;
    });
    db.close();
  });
  await page.reload();
  await page.locator('#local-profile option[value="planner-fixture"]').waitFor({ state: 'attached' });
  await page.locator('#local-profile').selectOption('planner-fixture');
  await page.getByText('Experimental rating-only SBC planner', { exact: true }).click();
  const requests = [];
  page.on('request', request => requests.push(request.url()));
  await page.locator('#planner-rating').fill('84');
  await page.locator('#planner-solve').click();
  await page.locator('#planner-status').filter({ hasText: 'Unsupported challenge' }).waitFor();
  await page.locator('#planner-shape').check();
  await page.locator('#planner-solve').click();
  await page.locator('#planner-status').filter({ hasText: 'No solution' }).waitFor();
  for (let i = 0; i < 12; i++) {
    await page.getByRole('checkbox', { name: `Eligible synthetic-${i}`, exact: true }).check();
    await page.getByRole('textbox', { name: `Player identity for synthetic-${i}`, exact: true }).fill(`Person ${i}`);
  }
  await page.locator('#planner-solve').click();
  await page.locator('#planner-status').filter({ hasText: 'Optimal for the reviewed candidates' }).waitFor();
  assert.equal(await page.locator('#planner-result li').count(), 11);
  assert.match(await page.locator('#planner-result').textContent(), /calculated rating 84/);
  assert.match(await page.locator('#planner-result').textContent(), /synthetic-12: Protected/);
  assert.deepEqual(requests, []);
  await page.screenshot({ path: 'test-results/local-planner.png', fullPage: true });
  await page.locator('#planner-rating').fill('85');
  assert.equal(await page.locator('#planner-result li').count(), 0);
  await page.locator('#planner-solve').click();
  await page.locator('#planner-status').filter({ hasText: 'No solution' }).waitFor();
  await page.locator('#planner-rating').fill('84');
  await page.evaluate(async () => {
    const req = indexedDB.open('sbc-local-inventory', 1);
    const db = await new Promise(resolve => { req.onsuccess = () => resolve(req.result); });
    await new Promise(resolve => {
      const tx = db.transaction('inventory', 'readwrite'); const store = tx.objectStore('inventory'); const get = store.get('state');
      get.onsuccess = () => { const state = get.result; state.profiles[0].items[0].protected = true; store.put(state, 'state'); }; tx.oncomplete = resolve;
    }); db.close();
  });
  await page.locator('#planner-solve').click();
  await page.locator('#planner-status').filter({ hasText: 'Saved inventory changed' }).waitFor();
  assert.equal(await page.locator('#planner-result li').count(), 0);
  await page.close();
  console.log('PASS: manual rating requirements, eligibility review, local recommendation, no network, invalidation and concurrent protection check.');
}

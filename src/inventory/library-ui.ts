import type { ImportSnapshot } from './import';
import { emptyState, exportFields, parseCorrections, reconcile, reviewedExport, transact, verification, type ExportField, type InventoryState, type Profile } from './store';

export function mountLibrary(root: HTMLElement, getImport: () => ImportSnapshot | undefined) {
  root.innerHTML = `<h2>Saved local inventory</h2><p>${verification}</p>
    <p>Use a separate local profile for each account or club. Account changes cannot be detected. Use an invented label, never credentials or a real club identifier.</p>
    <label>Local profile <select id="local-profile"><option value="">Choose a profile</option></select></label>
    <label>New profile label <input id="profile-label" maxlength="60"></label><button id="profile-create">Create profile</button>
    <p><label><input type="checkbox" id="profile-confirm">I reviewed the stopped import and confirm it belongs to the selected account/club profile.</label></p>
    <button id="inventory-save">Save reviewed import to profile</button>
    <p id="library-message" role="status"></p><p id="library-coverage"></p>
    <label>Search name or ID <input id="inventory-search"></label>
    <label>Source <select id="inventory-source"><option value="">All sources</option><option>club</option><option>sbc-storage</option></select></label>
    <label><input type="checkbox" id="protected-only">Protected only</label>
    <label><input type="checkbox" id="stale-only">Missing or not rechecked only</label>
    <div id="inventory-list"></div>
    <fieldset><legend>Reviewed inventory export</legend><div id="export-fields"></div>
    <button id="inventory-preview">Review selected fields</button><pre id="inventory-preview-text" hidden></pre>
    <button id="inventory-download" disabled>Download reviewed inventory JSON</button></fieldset>
    <p><label><input type="checkbox" id="clear-confirm">Erase all saved inventory profiles, protection choices and corrections</label></p>
    <button id="inventory-clear">Clear local inventory</button>`;
  const el = <T extends HTMLElement>(id: string) => root.querySelector<T>(`#${id}`)!;
  const select = el<HTMLSelectElement>('local-profile');
  const confirm = el<HTMLInputElement>('profile-confirm');
  let state: InventoryState = emptyState();
  let preview: string | null = null;
  const invalidate = () => { preview = null; el('inventory-preview-text').hidden = true; el<HTMLButtonElement>('inventory-download').disabled = true; };
  const profile = (): Profile => {
    const value = state.profiles.find(p => p.id === select.value);
    if (!value) throw new Error('Choose a local profile first.');
    return value;
  };
  const run = async (action: () => Promise<void>) => {
    try { await action(); } catch (error) { el('library-message').textContent = error instanceof Error ? error.message : 'Local inventory operation failed.'; }
  };
  const updateProfile = async (change: (p: Profile) => Profile) => {
    const id = profile().id;
    state = await transact(current => {
      if (!current.profiles.some(p => p.id === id)) throw new Error('Profile was removed. Reopen the popup.');
      return { ...current, profiles: current.profiles.map(p => p.id === id ? change(p) : p) };
    });
    invalidate(); render();
  };
  const render = () => {
    const selected = select.value;
    select.replaceChildren(new Option('Choose a profile', ''), ...state.profiles.map(p => new Option(p.label, p.id)));
    select.value = selected;
    const p = state.profiles.find(p => p.id === select.value);
    el('library-coverage').textContent = p?.latest ? `Last saved import: ${p.latest.status}; club: ${p.latest.coverage.club}; SBC storage: ${p.latest.coverage['sbc-storage']}; ${p.latest.savedAt}. ${p.latest.problem ?? ''} Saved records: ${p.items.length}. Coverage describes that import only; retained records may be stale.` : 'No saved import in this profile.';
    const list = el('inventory-list'); list.replaceChildren();
    const query = el<HTMLInputElement>('inventory-search').value.toLowerCase();
    for (const item of p?.items ?? []) {
      const card = { ...item.reported, ...item.corrections };
      if (query && !`${card.name ?? ''} ${card.instanceId} ${card.definitionId}`.toLowerCase().includes(query)) continue;
      if (el<HTMLSelectElement>('inventory-source').value && card.provenance.source !== el<HTMLSelectElement>('inventory-source').value) continue;
      if (el<HTMLInputElement>('protected-only').checked && !item.protected) continue;
      if (el<HTMLInputElement>('stale-only').checked && item.freshness === 'seen') continue;
      const row = document.createElement('section'); row.className = 'saved-item';
      const text = document.createElement('p');
      text.textContent = `${card.name ?? 'Unknown name'} · ${card.rating ?? 'Unknown rating'} · ${card.position ?? 'Unknown position'} · tradeable: ${card.tradeable ?? 'unknown'} · ${card.provenance.source} · ${card.instanceId} · ${item.freshness} · last seen ${item.lastSeen}`;
      const protect = document.createElement('button'); protect.textContent = item.protected ? 'Unprotect player' : 'Protect player';
      protect.onclick = () => void run(() => updateProfile(current => ({ ...current, items: current.items.map(i => i.reported.instanceId === card.instanceId ? { ...i, protected: !i.protected } : i) })));
      const details = document.createElement('details');
      const summary = document.createElement('summary'); summary.textContent = 'Manual corrections and reported evidence';
      const evidence = document.createElement('pre'); evidence.textContent = JSON.stringify(item.reported, null, 2);
      const label = document.createElement('label'); label.textContent = 'Corrections JSON (name, rating, position, tradeable). Use {} to clear. Overrides persist across re-imports; reported evidence stays separate.';
      const input = document.createElement('textarea'); input.value = JSON.stringify(item.corrections); label.append(input);
      const provenance = document.createElement('p'); provenance.textContent = item.correctedAt ? `User correction: ${item.correctedAt}` : 'No manual corrections.';
      const save = document.createElement('button'); save.textContent = 'Save manual corrections';
      save.onclick = () => void run(async () => {
        const corrections = parseCorrections(JSON.parse(input.value));
        await updateProfile(current => ({ ...current, items: current.items.map(i => i.reported.instanceId === card.instanceId ? { ...i, corrections, correctedAt: Object.keys(corrections).length ? new Date().toISOString() : null } : i) }));
      });
      details.append(summary, evidence, label, save, provenance);
      row.append(text, protect, details);
      if (item.freshness === 'missing-unconfirmed') {
        const removalLabel = document.createElement('label');
        const removalConfirm = document.createElement('input'); removalConfirm.type = 'checkbox';
        removalLabel.append(removalConfirm, 'I confirm removal of this missing record from local inventory');
        const remove = document.createElement('button'); remove.textContent = 'Remove confirmed missing record';
        remove.onclick = () => void run(async () => {
          if (!removalConfirm.checked) throw new Error('Confirm removal of this specific record first.');
          await updateProfile(current => {
            if (current.items.find(i => i.reported.instanceId === card.instanceId)?.freshness !== 'missing-unconfirmed') throw new Error('Record changed. Review the latest inventory before removal.');
            return { ...current, items: current.items.filter(i => i.reported.instanceId !== card.instanceId) };
          });
        });
        row.append(removalLabel, remove);
      }
      list.append(row);
    }
  };
  select.onchange = () => { confirm.checked = false; invalidate(); render(); };
  for (const id of ['inventory-search', 'inventory-source', 'protected-only', 'stale-only']) el(id).oninput = render;
  el('profile-create').onclick = () => void run(async () => {
    const label = el<HTMLInputElement>('profile-label').value.trim();
    if (!label || label.length > 60) throw new Error('Enter an invented profile label of 1–60 characters.');
    const id = crypto.randomUUID();
    state = await transact(current => ({ ...current, profiles: [...current.profiles, { id, label, items: [], latest: null }] }));
    render(); select.value = id; confirm.checked = false; invalidate(); render();
    el<HTMLInputElement>('profile-label').value = '';
  });
  el('inventory-save').onclick = () => void run(async () => {
    if (!confirm.checked) throw new Error('Review the import and confirm its account/club profile before saving.');
    const snapshot = getImport();
    await updateProfile(p => reconcile(p, snapshot));
    confirm.checked = false;
    el('library-message').textContent = 'Saved locally. Protection and manual overrides retained; missing records were not deleted.';
  });
  for (const field of exportFields) {
    const label = document.createElement('label'); const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.value = field;
    checkbox.checked = !['instanceId', 'definitionId'].includes(field); checkbox.onchange = invalidate;
    label.append(checkbox, field, ' '); el('export-fields').append(label);
  }
  el('inventory-preview').onclick = () => void run(async () => {
    const fields = Array.from(el('export-fields').querySelectorAll<HTMLInputElement>('input:checked'), input => input.value as ExportField);
    preview = JSON.stringify(reviewedExport(profile(), fields), null, 2);
    el('inventory-preview-text').textContent = preview; el('inventory-preview-text').hidden = false;
    el<HTMLButtonElement>('inventory-download').disabled = false;
  });
  el('inventory-download').onclick = () => {
    if (!preview) return;
    const url = URL.createObjectURL(new Blob([preview], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'reviewed-local-inventory.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  el('inventory-clear').onclick = () => void run(async () => {
    if (!el<HTMLInputElement>('clear-confirm').checked) throw new Error('Confirm erasing all local inventory first.');
    state = await transact(() => emptyState()); confirm.checked = false; el<HTMLInputElement>('clear-confirm').checked = false;
    invalidate(); render(); el('library-message').textContent = 'All saved inventory profiles, protection choices and corrections cleared. In-memory import and DOM sessions are separate.';
  });
  void run(async () => { state = await transact(); render(); });
  return { resetConfirmation: () => { confirm.checked = false; } };
}

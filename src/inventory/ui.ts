import type { ImportSnapshot } from './import';

export function mountInventory(root: HTMLElement, send: (command: string) => Promise<ImportSnapshot>) {
  root.innerHTML = `<h2>Club inventory import</h2>
    <p>Read-only internal-service import. EA terms and account-enforcement risk remain unresolved. Live identity and coverage are unverified.</p>
    <button id="import-start">Import club</button> <button id="import-cancel" disabled>Cancel import</button>
    <p id="import-status" role="status"></p>
    <button id="import-review" disabled>Review imported items</button><pre id="import-result" hidden></pre>`;
  const start = root.querySelector<HTMLButtonElement>('#import-start')!;
  const cancel = root.querySelector<HTMLButtonElement>('#import-cancel')!;
  const review = root.querySelector<HTMLButtonElement>('#import-review')!;
  const status = root.querySelector<HTMLElement>('#import-status')!;
  const result = root.querySelector<HTMLElement>('#import-result')!;
  let latest: ImportSnapshot | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const render = (state: ImportSnapshot) => {
    latest = state;
    start.disabled = state.status === 'running';
    cancel.disabled = state.status !== 'running';
    review.disabled = state.status === 'running' || state.status === 'idle';
    const label = state.status === 'complete' ? 'Complete service traversal: club + SBC storage (live coverage unverified)' : state.status;
    status.textContent = `${label} · ${state.items.length} reported instances · ${state.pages} pages · ${state.requests} requests. Club: ${state.coverage.club}; SBC storage: ${state.coverage['sbc-storage']}.${state.problem ? ` Stopped: ${state.problem}.` : ''}`;
    clearTimeout(timer);
    if (state.status === 'running') timer = setTimeout(() => void command('import:status'), 300);
  };
  const command = async (name: string) => {
    try { render(await send(name)); }
    catch { status.textContent = 'No supported Web App tab. Open the Web App and sign in yourself, then reopen this popup.'; start.disabled = true; cancel.disabled = true; }
  };
  start.onclick = () => { start.disabled = true; result.hidden = true; void command('import:start'); };
  cancel.onclick = () => { cancel.disabled = true; void command('import:cancel'); };
  review.onclick = () => {
    result.textContent = JSON.stringify({ verification: 'Live ownership, identity and coverage unverified. Missing records do not imply sale or submission.', ...latest }, null, 2);
    result.hidden = false;
  };
  void command('import:status');
  return () => clearTimeout(timer);
}

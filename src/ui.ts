import { exportJson, fields, type Field, type Snapshot } from './capture';
import './style.css';
export function mount(send: (command: string) => Promise<Snapshot>) {
  const host = document.querySelector<HTMLElement>('#app')!;
  host.innerHTML = `<h1>SBC DOM feasibility</h1>
    <p>Read-only, local session. EA may prohibit extraction even with manual browsing.</p>
    <p id="status" role="status">Capture is off.</p>
    <div class="buttons"><button id="start">Enable capture</button><button id="stop">Disable capture</button><button id="clear">Clear session</button><button id="refresh">Refresh diagnostics</button></div>
    <p id="counts"></p><p id="confidence"></p><ul id="coverage"></ul>
    <button id="review">Review JSON export</button>
    <section id="review-panel" hidden><h2>Review and redact</h2><p>Uncheck fields to redact them. Check the exact preview before downloading. Identifiers are excluded by default.</p><div id="fields"></div><pre id="preview"></pre><button id="download">Download reviewed JSON</button><button id="cancel">Cancel</button></section>`;
  const get = <T extends HTMLElement>(id: string) => host.querySelector<T>(`#${id}`)!;
  let snapshot: Snapshot | undefined;
  let reviewed = '';
  const close = () => { get('review-panel').hidden = true; reviewed = ''; };
  const update = async (command: string) => {
    close();
    try {
      snapshot = await send(command);
      const live = snapshot.source === 'live-unverified';
      get('status').textContent = live
        ? `Observer ${snapshot.active ? 'enabled' : 'disabled'}, but no verified EA selectors. 0 cards captured.`
        : `Synthetic capture ${snapshot.active ? 'enabled' : 'disabled'} in this tab.`;
      get('start').textContent = live ? 'Enable observer' : 'Enable capture';
      get('stop').textContent = live ? 'Disable observer' : 'Disable capture';
      get('counts').textContent = `${snapshot.candidates} visible candidates at last scan · ${snapshot.observations.length} distinct descriptions · ${snapshot.sightings} sightings${snapshot.capped ? ' · 500-description limit reached' : ''}. Owned instances: unknown.`;
      get('confidence').textContent = snapshot.source === 'synthetic'
        ? 'Synthetic fixture only. Live extraction confidence: unverified.'
        : 'Live selectors unverified. No player fields are read. Follow the manual inspection report.';
      get('coverage').replaceChildren(...fields.map(field => {
        const item = document.createElement('li');
        item.textContent = `${field}: ${snapshot!.coverage[field]}/${snapshot!.observations.length} known; otherwise unknown`;
        return item;
      }));
      get<HTMLButtonElement>('start').disabled = snapshot.active;
      get<HTMLButtonElement>('stop').disabled = !snapshot.active;
      get<HTMLButtonElement>('review').disabled = false;
    } catch {
      snapshot = undefined;
      get('status').textContent = 'No supported tab connection. Open or reload https://www.ea.com/ea-sports-fc/ultimate-team/web-app/ or use the synthetic demo.';
      get<HTMLButtonElement>('review').disabled = true;
    }
  };
  for (const command of ['start', 'stop', 'clear', 'refresh']) get(command).onclick = () => void update(command === 'refresh' ? 'status' : command);
  get('review').onclick = () => {
    if (!snapshot) return;
    const frozen = snapshot;
    get('fields').replaceChildren(...fields.map(field => {
      const label = document.createElement('label');
      const input = document.createElement('input');
      input.type = 'checkbox'; input.value = field; input.checked = field !== 'visibleId';
      label.append(input, field); return label;
    }));
    const preview = () => {
      const selected = [...get('fields').querySelectorAll<HTMLInputElement>('input:checked')].map(input => input.value as Field);
      reviewed = exportJson(frozen, selected);
      get('preview').textContent = reviewed;
    };
    get('fields').onchange = preview;
    preview(); get('review-panel').hidden = false;
  };
  get('cancel').onclick = close;
  get('download').onclick = () => {
    if (!reviewed) return;
    const url = URL.createObjectURL(new Blob([reviewed], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url; link.download = 'sbc-observations.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    close();
  };
  void update('status');
}

import { defineUnlistedScript } from 'wxt/utils/define-unlisted-script';
import { importInventory } from '../src/inventory/import';
import { readWebAppPage } from '../src/inventory/web-app';
import { CHANNEL, validRun } from '../src/inventory/protocol';

export default defineUnlistedScript(() => {
  const root = window as unknown as Record<string, unknown>;
  const run = root.__sbcInventoryRun;
  delete root.__sbcInventoryRun;
  if (!validRun(run)) return;
  const controller = new AbortController();
  let begin: (() => void) | undefined;
  const cancel = (event: MessageEvent) => {
    if (event.source === window && event.origin === location.origin && event.data?.channel === CHANNEL && event.data?.run === run) {
      if (event.data.operation === 'cancel') controller.abort();
      if (event.data.operation === 'begin') { begin?.(); begin = undefined; }
    }
  };
  window.addEventListener('message', cancel);
  const leave = () => controller.abort();
  window.addEventListener('pagehide', leave, { once: true });
  const authorized = new Promise<void>(resolve => { begin = resolve; });
  const deadline = setTimeout(() => { controller.abort(); begin?.(); begin = undefined; }, 1_000);
  window.postMessage({ channel: CHANNEL, run, operation: 'ready' }, location.origin);
  void authorized.then(() => {
    clearTimeout(deadline);
    return importInventory({
      evidence: 'internal-inventory-service',
      readClubPage: ({ cursor, signal }) => readWebAppPage(window, 'club', cursor, signal),
      readStoragePage: ({ cursor, signal }) => readWebAppPage(window, 'sbc-storage', cursor, signal),
    }, {
      signal: controller.signal,
      onProgress: snapshot => window.postMessage({ channel: CHANNEL, run, operation: 'progress', snapshot }, location.origin),
    });
  }).finally(() => {
    window.removeEventListener('message', cancel);
    window.removeEventListener('pagehide', leave);
  });
});

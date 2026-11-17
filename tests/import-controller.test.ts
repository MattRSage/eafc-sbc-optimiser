import { afterEach, expect, it, vi } from 'vitest';
import { ImportController } from '../src/inventory/controller';
import { idleImport } from '../src/inventory/import';
import { CHANNEL } from '../src/inventory/protocol';

afterEach(() => vi.restoreAllMocks());
it('cancels before injection finishes and never authorizes its late ready message', async () => {
  let finish: () => void = () => {};
  let run = '';
  const send = vi.spyOn(window, 'postMessage').mockImplementation(() => {});
  const controller = new ImportController(id => { run = id; return new Promise<void>(resolve => { finish = resolve; }); });
  const pending = controller.start();
  controller.cancel();
  window.dispatchEvent(new MessageEvent('message', { source: window, origin: location.origin, data: { channel: CHANNEL, run, operation: 'ready' } }));
  finish();
  expect((await pending).status).toBe('cancelled');
  expect(send.mock.calls.map(call => call[0].operation)).toEqual(['cancel']);
  controller.dispose();
});
it('rejects malformed, wrong-source and stale progress without exposing extra fields', async () => {
  let run = '';
  const controller = new ImportController(async id => { run = id; });
  await controller.start();
  const deliver = (snapshot: unknown, source: Window | null = window, id = run) => window.dispatchEvent(new MessageEvent('message', {
    source, origin: location.origin, data: { channel: CHANNEL, run: id, operation: 'progress', snapshot },
  }));
  deliver({ ...idleImport(), status: 'complete' });
  deliver({ ...idleImport(), status: 'failed' }, null);
  deliver({ ...idleImport(), status: 'failed' }, window, 'stale');
  expect(controller.snapshot().status).toBe('running');
  deliver({ ...idleImport(), status: 'failed', problem: 'unsupported-service', privateExtra: 'discard' });
  expect(controller.snapshot().status).toBe('failed');
  expect(controller.snapshot()).not.toHaveProperty('privateExtra');
  controller.dispose();
});

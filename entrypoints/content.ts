import { defineContentScript } from 'wxt/utils/define-content-script';
import { browser } from 'wxt/browser';
import { ImportController } from '../src/inventory/controller';
import { Capture, liveProfile } from '../src/capture';

export default defineContentScript({
  matches: ['https://www.ea.com/ea-sports-fc/ultimate-team/web-app/*'],
  world: 'ISOLATED',
  main(ctx) {
    const inventory = new ImportController(run => browser.runtime.sendMessage({ operation: 'inject-inventory', run }));
    const capture = new Capture(document.body, liveProfile);
    const listener = (message: unknown) => {
      if (!message || typeof message !== 'object' || !('command' in message)) return;
      const command = message.command;
      if (typeof command !== 'string') return;
      if (command === 'import:start') return inventory.start();
      if (command === 'import:cancel') return Promise.resolve(inventory.cancel());
      if (command === 'import:status') return Promise.resolve(inventory.snapshot());
      if (!['status', 'start', 'stop', 'clear'].includes(command) && !/^review:\d+$/.test(command)) return;
      if (command.startsWith('review:')) capture.markForReview(Number(command.slice(7)));
      if (command === 'start') capture.start();
      if (command === 'stop') capture.stop();
      if (command === 'clear') capture.clear();
      return Promise.resolve(capture.snapshot());
    };
    browser.runtime.onMessage.addListener(listener);
    ctx.onInvalidated(() => { inventory.dispose(); capture.stop(); browser.runtime.onMessage.removeListener(listener); });
  },
});

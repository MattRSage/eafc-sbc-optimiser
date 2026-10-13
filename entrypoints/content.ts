import { defineContentScript } from 'wxt/utils/define-content-script';
import { browser } from 'wxt/browser';
import { Capture, liveProfile } from '../src/capture';

export default defineContentScript({
  matches: ['https://www.ea.com/ea-sports-fc/ultimate-team/web-app/*'],
  world: 'ISOLATED',
  main(ctx) {
    const capture = new Capture(document.body, liveProfile);
    const listener = (message: unknown) => {
      if (!message || typeof message !== 'object' || !('command' in message)) return;
      const command = message.command;
      if (!['status', 'start', 'stop', 'clear'].includes(String(command))) return;
      if (command === 'start') capture.start();
      if (command === 'stop') capture.stop();
      if (command === 'clear') capture.clear();
      return Promise.resolve(capture.snapshot());
    };
    browser.runtime.onMessage.addListener(listener);
    ctx.onInvalidated(() => { capture.stop(); browser.runtime.onMessage.removeListener(listener); });
  },
});

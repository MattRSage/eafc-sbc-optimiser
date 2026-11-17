import { defineBackground } from 'wxt/utils/define-background';
import { browser } from 'wxt/browser';
import { validRun } from '../src/inventory/protocol';

export default defineBackground(() => {
  browser.runtime.onMessage.addListener(async (message, sender) => {
    if (message?.operation !== 'inject-inventory' || !validRun(message.run) || sender.tab?.id === undefined || sender.frameId !== 0 || !sender.url?.startsWith('https://www.ea.com/ea-sports-fc/ultimate-team/web-app/')) return;
    const target = { tabId: sender.tab.id, frameIds: [0] };
    await browser.scripting.executeScript({ target, world: 'MAIN', func: (run: string) => { (window as unknown as Record<string, unknown>).__sbcInventoryRun = run; }, args: [message.run] });
    await browser.scripting.executeScript({ target, world: 'MAIN', files: ['/inventory.js'] });
    return true;
  });
});

import { browser } from 'wxt/browser';
import { mount } from '../../src/ui';
const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
mount(command => {
  if (tab?.id === undefined) return Promise.reject(new Error('No tab'));
  return browser.tabs.sendMessage(tab.id, { command });
});
document.querySelector<HTMLButtonElement>('#demo')!.onclick = () => {
  void browser.tabs.create({ url: browser.runtime.getURL('/demo.html') });
};

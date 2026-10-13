import { beforeEach, expect, it, vi } from 'vitest';
import { Capture, fixtureProfile, liveProfile } from '../src/capture';
import { mount } from '../src/ui';

beforeEach(() => { document.body.innerHTML = '<main id="app"></main>'; });

it('labels live controls without claiming owned-card imports', async () => {
  const capture = new Capture(document.createElement('section'), liveProfile);
  mount(async command => {
    if (command === 'start') capture.start();
    if (command === 'stop') capture.stop();
    if (command === 'clear') capture.clear();
    return capture.snapshot();
  });
  try {
    await vi.waitFor(() => expect(document.querySelector('#status')?.textContent).toBe('Observer disabled for the supplied player-list layout. Owned cards imported: 0.'));
    expect(document.querySelector('#start')?.textContent).toBe('Enable observer');
    expect(document.querySelector('#stop')?.textContent).toBe('Disable observer');
    expect(document.querySelector('#confidence')?.textContent).toContain('one supplied card');
    for (const command of ['start', 'stop', 'start', 'clear']) {
      document.querySelector<HTMLButtonElement>(`#${command}`)!.click();
      await vi.waitFor(() => expect(document.querySelector('#status')?.textContent).toBe(
        `Observer ${command === 'start' ? 'enabled' : 'disabled'} for the supplied player-list layout. Owned cards imported: 0.`,
      ));
    }
  } finally { capture.stop(); }
});

it('identifies synthetic capture separately', async () => {
  const capture = new Capture(document.createElement('section'), fixtureProfile);
  mount(async () => capture.snapshot());
  await vi.waitFor(() => expect(document.querySelector('#status')?.textContent).toBe('Synthetic capture disabled in this tab.'));
  expect(document.querySelector('#start')?.textContent).toBe('Enable capture');
});

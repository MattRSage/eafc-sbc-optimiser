import fixture from '../../tests/fixtures/cards.html?raw';
import { Capture, fixtureProfile } from '../../src/capture';
import { mount } from '../../src/ui';
const cards = document.querySelector<HTMLElement>('#cards')!;
cards.innerHTML = fixture;
const capture = new Capture(cards, fixtureProfile);
mount(async command => {
  if (command === 'start') capture.start();
  if (command === 'stop') capture.stop();
  if (command === 'clear') capture.clear();
  return capture.snapshot();
});
document.querySelector<HTMLButtonElement>('#add')!.onclick = () => cards.append(cards.firstElementChild!.cloneNode(true));
document.querySelector<HTMLButtonElement>('#remove')!.onclick = () => { if (cards.children.length > 1) cards.lastElementChild!.remove(); };

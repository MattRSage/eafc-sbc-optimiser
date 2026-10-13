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
document.querySelector<HTMLButtonElement>('#recycle')!.onclick = () => {
  const first = cards.firstElementChild!;
  const source = document.createElement('template');
  source.innerHTML = fixture;
  const index = first.querySelector('[data-field="name"]')?.textContent === 'Alex Example' ? 1 : 0;
  first.replaceChildren(...source.content.children[index]!.childNodes);
};
document.querySelector<HTMLButtonElement>('#visibility')!.onclick = () => {
  const first = cards.firstElementChild as HTMLElement;
  first.hidden = !first.hidden;
};

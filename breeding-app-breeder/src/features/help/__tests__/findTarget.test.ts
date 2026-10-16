// @vitest-environment jsdom
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { findTarget, openDialog } from '../tours/findTarget';

// jsdom has no layout: give every element a box from its data-box attribute ("w,h"),
// zero when absent, so visibility follows the markup.
const original = {
  rect: Element.prototype.getBoundingClientRect,
  rects: Element.prototype.getClientRects,
};
const boxOf = (el: Element) => {
  const [w, h] = (el.getAttribute('data-box') || '0,0').split(',').map(Number);
  return { width: w, height: h, top: 0, left: 0, right: w, bottom: h, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
};
beforeAll(() => {
  Element.prototype.getBoundingClientRect = function () { return boxOf(this); };
  Element.prototype.getClientRects = function () {
    const box = boxOf(this);
    return (box.width && box.height ? [box] : []) as unknown as DOMRectList;
  };
});
afterAll(() => {
  Element.prototype.getBoundingClientRect = original.rect;
  Element.prototype.getClientRects = original.rects;
});

beforeEach(() => {
  document.body.innerHTML = `
    <button id="hidden" data-tour="add-animal" data-box="0,0">+ (phone, hidden)</button>
    <button id="add" data-tour="add-animal" data-box="120,36">Add animal</button>
    <button id="by-help" data-help="nav-animals" data-box="80,30">Animals</button>
    <div data-help-ui=""><button id="q" data-tour="help-button" data-box="36,36">?</button></div>
    <section class="help-tour-panel" data-help-ui=""><button data-tour="tour-next" data-box="60,30">Next</button></section>`;
});

describe('findTarget', () => {
  it('finds a visible data-tour or data-help target, skipping hidden twins', () => {
    expect(findTarget('add-animal')?.id).toBe('add');
    expect(findTarget('nav-animals')?.id).toBe('by-help');
  });

  it('can point at the ? button, never into the tour panel itself', () => {
    expect(findTarget('help-button')?.id).toBe('q');
    expect(findTarget('tour-next')).toBeNull();
  });

  it('returns null for a target that is not on screen', () => {
    expect(findTarget('no-such-target')).toBeNull();
  });

  it('with a window open, looks only inside it, and "dialog" is the window itself', () => {
    document.body.insertAdjacentHTML('beforeend', `
      <div data-dialog="add-animal" id="win" data-box="500,400">
        <button id="inner" data-tour="add-animal-save" data-box="80,30">Add</button>
      </div>`);
    expect(openDialog(document)?.id).toBe('win');
    expect(findTarget('dialog')?.id).toBe('win');
    expect(findTarget('add-animal-save')?.id).toBe('inner');
    expect(findTarget('add-animal')).toBeNull();
  });

  it('with no window open, ignores controls inside closed or hidden windows', () => {
    document.body.insertAdjacentHTML('beforeend', `
      <div data-dialog="gone" data-box="0,0"><button data-tour="inside" data-box="10,10">x</button></div>`);
    expect(findTarget('dialog')).toBeNull();
    expect(findTarget('inside')).toBeNull();
  });
});

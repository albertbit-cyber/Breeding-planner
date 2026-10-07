// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installHelpGuard, type HelpExplanation } from '../helpGuard';

// The guard is tested the way the app installs it: on window, capture phase, with app
// handlers attached underneath the way React attaches its own (bubbling, on the root).

let active = true;
let explained: HelpExplanation[] = [];
let uninstall: () => void = () => {};
let appHandler = vi.fn();

const html = `
  <div id="root">
    <button id="save" data-help="animal-save"><svg id="icon"></svg><span id="label">Save changes</span></button>
    <button id="untopiced" aria-label="Mystery">?</button>
    <button id="off" data-help="animal-save" disabled>Save changes</button>
    <button id="iconed"><span aria-hidden="true">📅</span><span>Calendar</span></button>
    <div id="clickable-div">plain clickable div</div>
    <p id="text">Just some text.</p>
    <form id="form"><input id="name" placeholder="Name" /><button id="submit" type="submit">Add</button></form>
    <label for="sex">Sex</label><select id="sex"><option>Male</option><option>Female</option></select>
    <div role="radiogroup"><span id="radio" role="radio" tabindex="0" aria-checked="false">Cards</span></div>
    <a id="nav-link" href="#animals">Animals</a>
    <a id="out-link" href="https://example.com">Out</a>
    <details id="details"><summary id="summary">More fields</summary><p>Inside</p></details>
    <div data-help-ui id="help-ui"><button id="exit">Exit</button><input id="manual-search" /></div>
    <div id="tile" data-help="card-activity-feed"><span id="tile-text">Feeds: 3</span></div>
  </div>`;

const $ = (id: string) => document.getElementById(id)!;

const fire = (element: Element, type: string, init: Record<string, unknown> = {}) => {
  const Ctor = type.startsWith('key') ? KeyboardEvent
    : type.startsWith('pointer') ? (window.PointerEvent || MouseEvent)
    : ['click', 'dblclick', 'auxclick', 'contextmenu'].includes(type) || type.startsWith('mouse') ? MouseEvent
    : Event;
  const event = new Ctor(type, { bubbles: true, cancelable: true, ...init });
  const notCancelled = element.dispatchEvent(event);
  return { event, notCancelled };
};

const press = (element: Element) => {
  for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) fire(element, type);
};

const key = (element: Element, value: string) => fire(element, 'keydown', { key: value });

beforeEach(() => {
  document.body.innerHTML = html;
  active = true;
  explained = [];
  appHandler = vi.fn();
  uninstall = installHelpGuard(window, { isActive: () => active, onExplain: info => explained.push(info) });
  const root = $('root');
  for (const type of ['pointerdown', 'mousedown', 'mouseup', 'click', 'dblclick', 'keydown', 'keyup', 'submit', 'input', 'change', 'paste', 'drop', 'touchstart']) {
    root.addEventListener(type, appHandler);
  }
});

afterEach(() => {
  uninstall();
  document.body.innerHTML = '';
});

describe('installHelpGuard, Help Mode on', () => {
  it('explains a pressed control by its topic id', () => {
    press($('save'));
    expect(explained.map(item => item.id)).toEqual(['animal-save']);
  });

  it('counts a press on an icon or text inside a control as the control', () => {
    press($('icon'));
    press($('label'));
    press($('tile-text'));
    expect(explained.map(item => item.id)).toEqual(['animal-save', 'animal-save', 'card-activity-feed']);
  });

  it('never lets a pointer press reach an app handler', () => {
    press($('save'));
    press($('clickable-div'));
    fire($('save'), 'dblclick');
    fire($('save'), 'auxclick');
    expect(appHandler).not.toHaveBeenCalled();
  });

  it('cancels the default action of a press', () => {
    expect(fire($('submit'), 'click').notCancelled).toBe(false);
    expect(fire($('save'), 'mousedown').notCancelled).toBe(false);
  });

  it('explains a control with no topic by its accessible name', () => {
    press($('untopiced'));
    expect(explained[0]).toMatchObject({ id: null, name: 'Mystery' });
    press($('name'));
    expect(explained[1]).toMatchObject({ id: null, name: 'Name' });
    press($('sex'));
    expect(explained[2]).toMatchObject({ id: null, name: 'Sex' });
    press($('iconed'));
    expect(explained[3]).toMatchObject({ id: null, name: 'Calendar' });
  });

  it('explains a disabled control on release, since browsers never click it', () => {
    fire($('off'), 'pointerup');
    expect(explained).toHaveLength(1);
    expect(explained[0]).toMatchObject({ id: 'animal-save', disabled: true });
    fire($('off'), 'click');
    expect(explained).toHaveLength(1);
  });

  it('ignores plain text and empty space, but still lets nothing through', () => {
    press($('text'));
    press($('clickable-div'));
    expect(explained).toEqual([]);
    expect(appHandler).not.toHaveBeenCalled();
  });

  it('explains on Enter and Space instead of activating', () => {
    $('save').focus();
    expect(key($('save'), 'Enter').notCancelled).toBe(false);
    expect(key($('save'), ' ').notCancelled).toBe(false);
    expect(explained.map(item => item.id)).toEqual(['animal-save', 'animal-save']);
    expect(appHandler).not.toHaveBeenCalled();
  });

  it('stops typing, arrows, Backspace and Delete in fields', () => {
    for (const value of ['a', 'Z', '7', 'ArrowLeft', 'Backspace', 'Delete']) {
      expect(key($('name'), value).notCancelled, value).toBe(false);
    }
    expect(fire($('name'), 'beforeinput').notCancelled).toBe(false);
    fire($('name'), 'input');
    fire($('name'), 'paste');
    expect(appHandler).not.toHaveBeenCalled();
  });

  it('stops arrows in radio groups and selects', () => {
    expect(key($('radio'), 'ArrowRight').notCancelled).toBe(false);
    expect(key($('sex'), 'ArrowDown').notCancelled).toBe(false);
    fire($('sex'), 'change');
    expect(appHandler).not.toHaveBeenCalled();
  });

  it('stops app hotkeys pressed anywhere, scanner keystrokes included', () => {
    const scanner = vi.fn();
    window.addEventListener('keydown', scanner, true);
    key(document.body, 'g');
    key(document.body, 'Enter');
    window.removeEventListener('keydown', scanner, true);
    expect(scanner).not.toHaveBeenCalled();
  });

  it('lets the page scroll with arrows and Space when nothing is focused', () => {
    expect(key(document.body, 'ArrowDown').notCancelled).toBe(true);
    expect(key(document.body, ' ').notCancelled).toBe(true);
  });

  it('keeps forms from submitting', () => {
    expect(fire($('form'), 'submit').notCancelled).toBe(false);
    key($('name'), 'Enter');
    expect(appHandler).not.toHaveBeenCalled();
  });

  it('stops drops, drags, cuts and pastes', () => {
    for (const type of ['drop', 'dragstart', 'cut', 'paste']) {
      expect(fire($('name'), type).notCancelled, type).toBe(false);
    }
  });

  it('lets Tab, Shift+Tab and Escape through', () => {
    expect(key($('save'), 'Tab').notCancelled).toBe(true);
    expect(fire($('save'), 'keydown', { key: 'Tab', shiftKey: true }).notCancelled).toBe(true);
    expect(key($('save'), 'Escape').notCancelled).toBe(true);
    expect(appHandler).toHaveBeenCalledTimes(3);
    expect(explained).toEqual([]);
  });

  it('lets in-app navigation links navigate, and explains them', () => {
    const { notCancelled } = fire($('nav-link'), 'click');
    expect(notCancelled).toBe(true);
    expect(explained[0]).toMatchObject({ id: null, name: 'Animals' });
  });

  it('stops links that leave the app', () => {
    expect(fire($('out-link'), 'click').notCancelled).toBe(false);
  });

  it('lets disclosure toggles open, and explains them', () => {
    const { notCancelled } = fire($('summary'), 'click');
    expect(notCancelled).toBe(true);
    expect(explained[0]).toMatchObject({ name: 'More fields' });
  });

  it('leaves help UI fully working', () => {
    const exit = vi.fn();
    $('exit').addEventListener('click', exit);
    press($('exit'));
    expect(exit).toHaveBeenCalledTimes(1);
    expect(key($('manual-search'), 'b').notCancelled).toBe(true);
    expect(fire($('manual-search'), 'beforeinput').notCancelled).toBe(true);
    expect(explained).toEqual([]);
  });

  it('stops touches reaching app handlers without cancelling the tap', () => {
    const { notCancelled } = fire($('save'), 'touchstart');
    expect(notCancelled).toBe(true);
    expect(appHandler).not.toHaveBeenCalled();
  });
});

describe('installHelpGuard, Help Mode off', () => {
  it('intercepts nothing', () => {
    active = false;
    press($('save'));
    key($('name'), 'a');
    fire($('form'), 'submit');
    expect(explained).toEqual([]);
    expect(appHandler).toHaveBeenCalledTimes(6);
  });

  it('removes every listener on uninstall', () => {
    uninstall();
    press($('save'));
    key($('save'), 'Enter');
    expect(explained).toEqual([]);
    // A press reaches the root's pointerdown, mousedown, mouseup and click handlers.
    expect(appHandler).toHaveBeenCalledTimes(5);
    uninstall = () => {};
  });

  it('reads isActive on every event, so turning Help Mode on takes effect at once', () => {
    active = false;
    press($('save'));
    active = true;
    press($('save'));
    expect(explained).toHaveLength(1);
    expect(appHandler).toHaveBeenCalledTimes(4);
  });
});

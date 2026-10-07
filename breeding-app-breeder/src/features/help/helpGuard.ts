// Help Mode's promise is "pressing a control explains it and nothing else". This guard
// keeps that promise once, for the whole app, instead of in every button.
//
// It is installed on window in the capture phase before React mounts, so it runs ahead
// of every component and of the app's own window-capture listeners (the hardware
// scanner). It does nothing while Help Mode is off.
//
// No framework dependency: the tests drive it with a fake DOM.

export interface HelpExplanation {
  // The data-help id of the control, or null when the control has none.
  id: string | null;
  element: Element;
  // The control's accessible name, for the fallback popover when it has no topic.
  name: string;
}

export interface HelpGuardOptions {
  isActive: () => boolean;
  onExplain: (explanation: HelpExplanation) => void;
}

const INTERACTIVE = [
  'button',
  'a[href]',
  'input',
  'select',
  'textarea',
  'label',
  'summary',
  '[role="button"]',
  '[role="link"]',
  '[role="tab"]',
  '[role="radio"]',
  '[role="checkbox"]',
  '[role="switch"]',
  '[role="menuitem"]',
  '[role="option"]',
  '[contenteditable=""]',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

// Pointer events that could reach an app handler. Swallowed everywhere outside help UI,
// so even a clickable <div> with no role does nothing. Only click explains.
const POINTER_EVENTS = ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'dblclick', 'auxclick', 'contextmenu'];
// Touch events are stopped from reaching handlers but not cancelled: cancelling would
// also cancel the click a tap turns into, and the click is what gets explained.
const TOUCH_EVENTS = ['touchstart', 'touchend'];
// Ways data gets in or out without a key press.
const INPUT_EVENTS = ['submit', 'beforeinput', 'input', 'change', 'paste', 'cut', 'drop', 'dragstart', 'dragover'];
const KEY_EVENTS = ['keydown', 'keypress', 'keyup'];

// Keys that move focus or leave, never change anything.
const FREE_KEYS = new Set(['Tab', 'Escape']);
// Keys that only scroll the page when nothing editable or interactive is focused.
const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End', ' ']);
const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock']);

const asElement = (node: EventTarget | null): Element | null => {
  if (!node || typeof (node as Node).nodeType !== 'number') return null;
  const asNode = node as Node;
  if (asNode.nodeType === 1) return asNode as Element;
  return asNode.parentElement;
};

export const isHelpUi = (element: Element | null): boolean => !!element?.closest('[data-help-ui]');

// The control a press was meant for: the nearest data-help ancestor, else the nearest
// interactive element. A press on an icon inside a button counts as the button.
export const findHelpControl = (element: Element | null): Element | null => {
  if (!element) return null;
  return element.closest('[data-help]') || element.closest(INTERACTIVE);
};

export const accessibleName = (element: Element): string => {
  const labelled = element.getAttribute('aria-labelledby');
  if (labelled) {
    const doc = element.ownerDocument;
    const text = labelled.split(/\s+/).map(id => doc.getElementById(id)?.textContent || '').join(' ').trim();
    if (text) return text;
  }
  const direct = element.getAttribute('aria-label') || element.getAttribute('title');
  if (direct?.trim()) return direct.trim();
  if (isEditable(element)) {
    const id = element.getAttribute('id');
    const label = (id && Array.from(element.ownerDocument.querySelectorAll('label[for]')).find(item => item.getAttribute('for') === id))
      || element.closest('label');
    if (label?.textContent?.trim()) return label.textContent.trim().replace(/\s+/g, ' ');
    const placeholder = element.getAttribute('placeholder');
    if (placeholder?.trim()) return placeholder.trim();
  }
  return (element.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 80);
};

const explanationFor = (control: Element): HelpExplanation => ({
  id: control.getAttribute('data-help') || null,
  element: control,
  name: accessibleName(control),
});

// In-app navigation: a same-page hash link only changes what is shown.
const isNavigationLink = (element: Element): boolean => {
  const link = element.closest('a[href]');
  if (!link) return false;
  const href = link.getAttribute('href') || '';
  return href.startsWith('#') && link.getAttribute('target') !== '_blank';
};

const isDisclosure = (element: Element): boolean => !!element.closest('summary');

const isEditable = (element: Element | null): boolean => {
  if (!element) return false;
  if (element.closest('[contenteditable=""],[contenteditable="true"]')) return true;
  const tag = element.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
};

const stop = (event: Event) => {
  if (event.cancelable) event.preventDefault();
  event.stopImmediatePropagation();
};

export const installHelpGuard = (target: EventTarget, { isActive, onExplain }: HelpGuardOptions): (() => void) => {
  const onPointer = (event: Event) => {
    if (!isActive()) return;
    const element = asElement(event.target);
    if (isHelpUi(element)) return;
    const control = findHelpControl(element);
    // Links within the page and <summary> toggles only change what is shown: let them
    // work, and explain them too.
    if (control && (isNavigationLink(control) || isDisclosure(control))) {
      if (event.type === 'click') onExplain(explanationFor(control));
      return;
    }
    stop(event);
    if (event.type === 'click' && control) onExplain(explanationFor(control));
  };

  const onTouch = (event: Event) => {
    if (!isActive()) return;
    const element = asElement(event.target);
    if (isHelpUi(element)) return;
    event.stopImmediatePropagation();
  };

  const onInput = (event: Event) => {
    if (!isActive()) return;
    if (isHelpUi(asElement(event.target))) return;
    stop(event);
  };

  const onKey = (event: Event) => {
    if (!isActive()) return;
    const key = (event as KeyboardEvent).key;
    const element = asElement(event.target);
    if (isHelpUi(element)) return;
    if (FREE_KEYS.has(key) || MODIFIER_KEYS.has(key)) return;
    const control = findHelpControl(element);
    const activates = key === 'Enter' || key === ' ' || key === 'Spacebar';
    if (control && activates) {
      if (isNavigationLink(control) || (isDisclosure(control) && !isEditable(element))) {
        if (event.type === 'keydown') onExplain(explanationFor(control));
        return;
      }
      stop(event);
      if (event.type === 'keydown') onExplain(explanationFor(control));
      return;
    }
    // Nothing focused but the page: let it scroll.
    if (!control && !isEditable(element) && SCROLL_KEYS.has(key)) return;
    stop(event);
  };

  const listeners: Array<[string, (event: Event) => void, AddEventListenerOptions]> = [
    ...POINTER_EVENTS.map(type => [type, onPointer, { capture: true }] as [string, (event: Event) => void, AddEventListenerOptions]),
    ...TOUCH_EVENTS.map(type => [type, onTouch, { capture: true, passive: true }] as [string, (event: Event) => void, AddEventListenerOptions]),
    ...INPUT_EVENTS.map(type => [type, onInput, { capture: true }] as [string, (event: Event) => void, AddEventListenerOptions]),
    ...KEY_EVENTS.map(type => [type, onKey, { capture: true }] as [string, (event: Event) => void, AddEventListenerOptions]),
  ];

  for (const [type, listener, options] of listeners) target.addEventListener(type, listener, options);
  return () => {
    for (const [type, listener, options] of listeners) target.removeEventListener(type, listener, options);
  };
};

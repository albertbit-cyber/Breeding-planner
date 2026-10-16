// Find the control a tour step points at. Plain function over the DOM.
//
// - 'dialog' is the open window's own box.
// - Otherwise [data-tour="X"] or [data-help="X"], visible ones only, never inside the tour
//   panel itself (the ? button is help UI, but a tour may point at it).
// - With a window open, only elements inside it count; with none open, only elements
//   outside every window. The first match wins.

const isVisible = (element: Element): boolean => {
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0 || element.getClientRects().length === 0) return false;
  const view = element.ownerDocument.defaultView;
  const style = view?.getComputedStyle(element);
  return !style || (style.visibility !== 'hidden' && style.display !== 'none');
};

export const openDialog = (doc: Document): Element | null => {
  const dialogs = Array.from(doc.querySelectorAll('[data-dialog]')).filter(isVisible);
  return dialogs.length ? dialogs[dialogs.length - 1] : null;
};

const escape = (value: string) => value.replace(/["\\]/g, '\\$&');

export const findTarget = (target: string, doc: Document = document): Element | null => {
  const dialog = openDialog(doc);
  if (target === 'dialog') return dialog;
  const selector = `[data-tour="${escape(target)}"], [data-help="${escape(target)}"]`;
  const candidates = Array.from(doc.querySelectorAll(selector)).filter((element) => {
    if (element.closest('.help-tour-panel')) return false;
    if (dialog ? !dialog.contains(element) : !!element.closest('[data-dialog]')) return false;
    return isVisible(element);
  });
  return candidates[0] || null;
};

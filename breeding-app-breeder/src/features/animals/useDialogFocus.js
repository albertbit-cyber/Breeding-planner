import { useEffect, useRef } from 'react';

/**
 * Keyboard behaviour for a modal dialog: focus moves into it when it opens, Tab stays inside,
 * Escape closes it, and focus goes back to whatever opened it.
 *
 * The archive stacks dialogs (the exit-details form opens over the record), so only the topmost
 * open dialog answers Escape and keeps Tab. A module-level stack tracks the order.
 */
const stack = [];

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function useDialogFocus(onClose, { active = true, initialFocus = null } = {}) {
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!active) return undefined;
    const token = {};
    stack.push(token);
    const previous = typeof document !== 'undefined' ? document.activeElement : null;
    const node = ref.current;
    const target = (initialFocus && node?.querySelector(initialFocus)) || node?.querySelector(FOCUSABLE);
    target?.focus?.({ preventScroll: true });

    const onKey = (event) => {
      if (stack[stack.length - 1] !== token || !ref.current) return;
      if (event.key === 'Escape') {
        event.stopPropagation();
        event.preventDefault();
        closeRef.current?.();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = Array.from(ref.current.querySelectorAll(FOCUSABLE)).filter(el => el.offsetParent !== null || el === document.activeElement);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && (document.activeElement === first || !ref.current.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !ref.current.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      const index = stack.indexOf(token);
      if (index >= 0) stack.splice(index, 1);
      if (previous && typeof previous.focus === 'function' && document.contains(previous)) previous.focus({ preventScroll: true });
    };
  // initialFocus is read once on open, by design.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  return ref;
}

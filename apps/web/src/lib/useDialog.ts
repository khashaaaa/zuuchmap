import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

let locks = 0;

/**
 * Modal behaviour shared by Modal and BottomSheet: focus moves into the panel, Tab
 * is trapped inside it, Esc closes, the page behind stops scrolling, and focus goes
 * back to whatever opened it.
 */
export function useDialog(open: boolean, onClose: () => void, panel: RefObject<HTMLElement | null>, initialFocus: 'first' | 'panel' = 'first'): void {
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    const el = panel.current;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const items = () => (el ? Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE)) : []);
    (initialFocus === 'first' ? (items()[0] ?? el) : el)?.focus({ preventScroll: true });

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close.current();
        return;
      }
      if (e.key !== 'Tab' || !el) return;
      const list = items();
      if (list.length === 0) {
        e.preventDefault();
        el.focus();
        return;
      }
      const first = list[0];
      const last = list[list.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !el.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !el.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey, true);

    locks += 1;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKey, true);
      locks -= 1;
      if (locks === 0) document.body.style.overflow = prev;
      if (opener && document.contains(opener)) opener.focus({ preventScroll: true });
    };
  }, [open, panel, initialFocus]);
}

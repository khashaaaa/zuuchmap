import { useEffect, useState } from 'react';

/** Keeps an overlay mounted for its exit: `closing` is true for `ms` after `open` turns false. */
export function usePresence(open: boolean, ms = 180): { mounted: boolean; closing: boolean } {
  const [mounted, setMounted] = useState(open);
  if (open && !mounted) setMounted(true);
  useEffect(() => {
    if (open || !mounted) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const id = setTimeout(() => setMounted(false), reduce ? 0 : ms);
    return () => clearTimeout(id);
  }, [open, mounted, ms]);
  return { mounted: open || mounted, closing: !open && mounted };
}

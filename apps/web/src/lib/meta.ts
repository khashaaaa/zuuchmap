import { useEffect } from 'react';

/** `title · ZuuchMap`; the bare name when no title. */
export function useDocTitle(title?: string | null): void {
  useEffect(() => {
    document.title = title ? `${title} · ZuuchMap` : 'ZuuchMap';
  }, [title]);
}

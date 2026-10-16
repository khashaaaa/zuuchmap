import { cn } from '@/lib/cn';

/** 40 × 5 drag handle. Decorative: the sheet closes with its scrim, Esc and the header. */
export function SheetGrabber({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn('block h-[5px] w-10 rounded-[3px] bg-border-strong', className)} />;
}

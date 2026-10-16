import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/cn';

/** Same geometry as the ListingCard row. 900 ms opacity pulse; static under reduced motion. */
export function SkeletonListingRow({ className }: { className?: string }) {
  const { t } = useTranslation();
  const bar = 'rounded-md bg-bg-surface-sunken';
  return (
    <div role="status" aria-busy="true" className={cn('zm-pulse flex min-h-[120px] w-full items-center gap-3.5 rounded-xl bg-bg-surface p-3', className)}>
      <span className="sr-only">{t('ui.loading')}</span>
      <div aria-hidden="true" className="size-24 shrink-0 rounded-md bg-bg-surface-sunken" />
      <div aria-hidden="true" className="flex min-w-0 flex-1 flex-col gap-2.5">
        <div className={cn(bar, 'h-4 w-[198px] max-w-full')} />
        <div className={cn(bar, 'h-3 w-[132px] max-w-full')} />
        <div className={cn(bar, 'h-3 w-[99px] max-w-full')} />
        <div className={cn(bar, 'h-3 w-[77px] max-w-full')} />
      </div>
    </div>
  );
}

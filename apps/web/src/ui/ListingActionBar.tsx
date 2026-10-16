import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ACTION_BAR_VAR } from '@/lib/actionBar';
import { cn } from '@/lib/cn';
import { useFormat } from '@/lib/useFormat';
import { Button } from './Button';
import { Icon } from './Icon';

export interface ListingActionBarProps {
  kind: 'book' | 'call' | 'sos';
  price?: number | string | null;
  priceUnit?: string | null;
  onPrimary?: () => void;
  onMessage?: () => void;
  /** The viewer already has a PENDING request: the primary button opens it instead. */
  pending?: boolean;
  /** Info strip above the buttons, e.g. that the phone opens on acceptance. */
  note?: string;
  /** Kit/tests: in flow instead of sticky. */
  preview?: boolean;
  className?: string;
}

/**
 * Docks at the bottom of the page (`sticky bottom-0`) above every map pane. While mounted it
 * publishes its height as `--action-bar-height` on <html>; pad the page with `ACTION_BAR_PADDING`.
 */
export function ListingActionBar({ kind, price, priceUnit, onPrimary, onMessage, pending, note, preview, className }: ListingActionBarProps) {
  const { t } = useTranslation();
  const f = useFormat();
  const ref = useRef<HTMLDivElement>(null);
  const parts = f.priceParts(price, priceUnit);

  useEffect(() => {
    const el = ref.current;
    if (!el || preview) return;
    const root = document.documentElement;
    const set = () => root.style.setProperty(ACTION_BAR_VAR, `${el.offsetHeight}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.removeProperty(ACTION_BAR_VAR);
    };
  }, [preview]);

  return (
    <div
      ref={ref}
      className={cn(
        'z-40 flex w-full flex-col gap-2 border-t border-border-subtle bg-bg-surface px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-3',
        preview ? 'relative' : 'sticky bottom-0',
        className,
      )}
    >
      {note && (
        <p className="flex items-center gap-2 rounded-md bg-status-info-tint px-3 py-2 text-small text-text-primary">
          <Icon name="info" size={16} className="text-status-info" />
          {note}
        </p>
      )}
      <div className="flex items-center gap-2">
        {kind === 'sos' ? (
          <Button variant="danger" icon="phone" onClick={onPrimary} className="flex-1">{t('kit.action.sos')}</Button>
        ) : (
          <>
            {parts && (
              <div className="flex min-w-0 shrink-0 flex-col">
                <span className="text-price text-text-primary">{parts.amount}</span>
                {parts.unit && <span className="text-small text-text-secondary">/ {parts.unit}</span>}
              </div>
            )}
            <Button variant="outline" icon="message-circle" onClick={onMessage} className="ml-auto shrink-0 px-3!">{t('messages.title')}</Button>
            <Button variant={kind === 'book' && pending ? 'outline' : 'primary'} onClick={onPrimary} icon={kind === 'call' ? 'phone' : undefined} className="min-w-0 flex-1 px-3!">
              {kind === 'book' ? (pending ? t('deal.sent.pendingCta') : t('kit.action.book')) : t('kit.action.call')}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

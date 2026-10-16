import { useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/cn';
import { useDialog } from '@/lib/useDialog';
import { usePresence } from '@/lib/usePresence';
import { Button } from './Button';
import { Icon } from './Icon';

export type ModalTone = 'danger' | 'warning' | 'info';

const TONE: Record<ModalTone, { bg: string; fg: string; icon: string }> = {
  danger: { bg: 'bg-status-danger-tint', fg: 'text-status-danger', icon: 'circle-alert' },
  warning: { bg: 'bg-status-warning-tint', fg: 'text-status-warning', icon: 'alert-triangle' },
  info: { bg: 'bg-status-info-tint', fg: 'text-status-info', icon: 'info' },
};

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  body?: string;
  /** Status-tinted icon disc above the title. */
  tone?: ModalTone;
  confirmLabel: string;
  onConfirm: () => void;
  cancelLabel?: string;
  /** Destructive choices confirm with the danger button. */
  destructive?: boolean;
  children?: ReactNode;
}

/** Only for destructive choices. Focus is trapped, Esc and the scrim cancel, focus returns to the trigger. */
export function Modal({ open, onClose, title, body, tone, confirmLabel, onConfirm, cancelLabel, destructive = false, children }: ModalProps) {
  const { t } = useTranslation();
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useDialog(open, onClose, panel);
  const { mounted, closing } = usePresence(open);
  if (!mounted) return null;
  const look = tone && TONE[tone];
  return createPortal(
    <div data-closing={closing ? '' : undefined} className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div aria-hidden="true" onClick={onClose} className="zm-fade-in absolute inset-0 bg-bg-scrim" />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn('zm-pop-in relative flex w-[360px] max-w-full flex-col gap-4 rounded-modal bg-bg-surface-raised px-6 pb-5 pt-6 shadow-lg focus-visible:outline-none md:w-[420px] md:p-7')}
      >
        {look && (
          <span className={cn('inline-flex size-11 items-center justify-center rounded-pill', look.bg, look.fg)}>
            <Icon name={look.icon} size={22} />
          </span>
        )}
        <h2 id={titleId} className="text-h3 text-text-primary">{title}</h2>
        {body && <p className="text-body text-text-secondary">{body}</p>}
        {children}
        <div className="flex justify-end gap-3">
          <Button variant="outline" size="medium" onClick={onClose}>{cancelLabel ?? t('common.cancel')}</Button>
          <Button variant={destructive ? 'danger' : 'primary'} size="medium" onClick={onConfirm}>{confirmLabel}</Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

import { useTranslation } from 'react-i18next';
import type { DateInput } from '@zuuchmap/core';
import { cn } from '@/lib/cn';
import { useFormat } from '@/lib/useFormat';
import { Icon } from './Icon';

export type MessageStatus = 'sending' | 'sent' | 'read';

export interface MessageBubbleProps {
  direction: 'in' | 'out';
  text: string;
  at: DateInput;
  /** Outgoing only. */
  status?: MessageStatus;
  className?: string;
}

const STATUS_ICON: Record<MessageStatus, string> = { sending: 'clock', sent: 'check', read: 'check-check' };

export function MessageBubble({ direction, text, at, status = 'sent', className }: MessageBubbleProps) {
  const { t } = useTranslation();
  const f = useFormat();
  const out = direction === 'out';
  const statusLabel = status === 'sending' ? t('messages.sending') : t(`kit.bubble.${status}`);
  return (
    <div
      className={cn(
        'flex max-w-[75%] flex-col gap-1 rounded-xl px-3.5 pb-2 pt-2.5',
        out ? 'self-end rounded-br-xs bg-action-secondary text-action-on-secondary' : 'self-start rounded-bl-xs bg-bg-surface-sunken text-text-primary',
        className,
      )}
    >
      <p className="whitespace-pre-wrap break-words text-body">{text}</p>
      <div className={cn('flex items-center justify-end gap-1 text-small', out ? 'text-action-on-secondary/70' : 'text-text-secondary')}>
        <span>{f.time(at)}</span>
        {out && (
          <span className={cn('inline-flex', status === 'read' && 'text-action-on-secondary')}>
            <Icon name={STATUS_ICON[status]} size={14} />
            <span className="sr-only">{statusLabel}</span>
          </span>
        )}
      </div>
    </div>
  );
}

import type { DateInput } from '@zuuchmap/core';
import { cn } from '@/lib/cn';
import { useFormat } from '@/lib/useFormat';
import { Avatar } from './Avatar';
import { CountBadge } from './CountBadge';

export interface InboxRowProps {
  name: string;
  avatarSrc?: string;
  /** Title of the listing the thread is about. */
  listing?: string;
  preview: string;
  at: DateInput;
  /** Unread messages; 0 = read. */
  unread?: number;
  onClick?: () => void;
  className?: string;
}

export function InboxRow({ name, avatarSrc, listing, preview, at, unread = 0, onClick, className }: InboxRowProps) {
  const f = useFormat();
  const read = unread === 0;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn('flex min-h-[89px] w-full items-center gap-3 bg-bg-surface px-4 py-3 text-left focus-visible:outline-none focus-visible:shadow-focus', className)}
    >
      <Avatar name={name} src={avatarSrc} size="large" />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-baseline gap-2">
          <span className={cn('min-w-0 flex-1 truncate text-text-primary', read ? 'text-body-medium' : 'text-body-bold')}>{name}</span>
          <span className={cn('shrink-0 text-small', read ? 'text-text-tertiary' : 'text-text-primary')}>{f.inboxStamp(at)}</span>
        </span>
        {listing && <span className="truncate text-small text-text-tertiary">{listing}</span>}
        <span className="flex items-center gap-2">
          <span className={cn('min-w-0 flex-1 truncate text-caption', read ? 'text-text-secondary' : 'text-text-primary')}>{preview}</span>
          {!read && <CountBadge count={unread} />}
        </span>
      </span>
    </button>
  );
}

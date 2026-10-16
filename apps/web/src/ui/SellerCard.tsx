import { cn } from '@/lib/cn';
import { Avatar } from './Avatar';
import { Icon } from './Icon';

export interface SellerCardProps {
  name: string;
  avatarSrc?: string;
  verified?: boolean;
  /** "2024.03-оос гишүүн · 38 ажил" — composed by the screen. */
  meta?: string;
  rating?: { value: number; count: number };
  /** "Ихэвчлэн 2 цагт хариулдаг". */
  replyNote?: string;
  /** Accessible name for the verified glyph. */
  verifiedLabel?: string;
  className?: string;
}

export function SellerCard({ name, avatarSrc, verified, meta, rating, replyNote, verifiedLabel, className }: SellerCardProps) {
  return (
    <div className={cn('flex flex-col gap-3.5 rounded-xl border border-border-subtle bg-bg-surface p-4', className)}>
      <div className="flex items-center gap-3">
        <Avatar name={name} src={avatarSrc} type="company" size="large" />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="flex items-center gap-1 text-title text-text-primary">
            <span className="truncate">{name}</span>
            {verified && (
              <span role="img" aria-label={verifiedLabel} className="inline-flex text-icon-accent">
                <Icon name="badge-check" size={18} />
              </span>
            )}
          </p>
          {meta && <p className="text-caption text-text-secondary">{meta}</p>}
        </div>
      </div>
      {(rating || replyNote) && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {rating && (
            <span className="inline-flex items-center gap-1">
              <Icon name="star" size={16} className="fill-status-warning text-status-warning" />
              <span className="text-label-strong text-text-primary">{rating.value.toFixed(1)}</span>
              <span className="text-caption text-text-secondary">({rating.count})</span>
            </span>
          )}
          {replyNote && (
            <span className="inline-flex items-center gap-1 text-caption text-text-secondary">
              <Icon name="clock" size={16} />
              {replyNote}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

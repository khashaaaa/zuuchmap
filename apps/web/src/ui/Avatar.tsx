import { cn } from '@/lib/cn';
import { Icon } from './Icon';

export type AvatarSize = 'small' | 'medium' | 'large';

export interface AvatarProps {
  name?: string;
  src?: string;
  size?: AvatarSize;
  /** People are round, companies are rounded squares. */
  type?: 'initials' | 'company';
  className?: string;
}

const BOX: Record<AvatarSize, string> = { small: 'size-8', medium: 'size-10', large: 'size-14' };
const TEXT: Record<AvatarSize, string> = { small: 'text-micro', medium: 'text-label-strong', large: 'text-title' };
const GLYPH: Record<AvatarSize, number> = { small: 16, medium: 20, large: 28 };

const initialsOf = (name: string): string =>
  name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => Array.from(w)[0] ?? '').join('').toUpperCase();

export function Avatar({ name = '', src, size = 'medium', type = 'initials', className }: AvatarProps) {
  const company = type === 'company';
  return (
    <span
      role={name ? 'img' : undefined}
      aria-label={name || undefined}
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden border border-border-subtle bg-bg-surface-sunken text-text-secondary',
        company ? 'rounded-md' : 'rounded-pill',
        BOX[size],
        TEXT[size],
        className,
      )}
    >
      {src ? (
        <img src={src} alt="" className="size-full object-cover" />
      ) : company ? (
        <Icon name="building-2" size={GLYPH[size]} />
      ) : (
        initialsOf(name)
      )}
    </span>
  );
}

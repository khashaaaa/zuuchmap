import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/cn';
import { Icon } from './Icon';

export function Rating({ value, className }: { value: number; className?: string }) {
  const { t } = useTranslation();
  const filled = Math.round(value);
  return (
    <span className={cn('inline-flex h-5 items-center gap-0.5', className)} role="img" aria-label={t('kit.rating', { value: value.toFixed(1) })}>
      {[0, 1, 2, 3, 4].map((i) => (
        <Icon key={i} name="star" size={16} className={i < filled ? 'fill-status-warning text-status-warning' : 'text-border-strong'} />
      ))}
      <span className="ml-1 text-label-strong text-text-primary">{value.toFixed(1)}</span>
    </span>
  );
}

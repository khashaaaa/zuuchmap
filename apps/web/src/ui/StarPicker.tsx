import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/cn';
import { Icon } from './Icon';

export interface StarPickerProps {
  value: number;
  onChange: (value: number) => void;
  className?: string;
}

/** 1–5 stars as a radio group; each target is 48 px. */
export function StarPicker({ value, onChange, className }: StarPickerProps) {
  const { t } = useTranslation();
  return (
    <div role="radiogroup" aria-label={t('review.yourRating')} className={cn('flex justify-center gap-1', className)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={t('deal.review.outOf', { count: n })}
          onClick={() => onChange(n)}
          className="inline-flex size-12 items-center justify-center rounded-lg focus-visible:outline-none focus-visible:shadow-focus"
        >
          <Icon name="star" size={36} className={n <= value ? 'fill-status-warning text-status-warning' : 'text-border-strong'} />
        </button>
      ))}
    </div>
  );
}

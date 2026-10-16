import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/cn';

export interface ListingHealthRingProps {
  /** 0–100. */
  value: number;
  /** Ring diameter in px. Under 48 the value is hidden. */
  size?: number;
  label?: string;
  className?: string;
}

export function ListingHealthRing({ value, size = 72, label, className }: ListingHealthRingProps) {
  const { t } = useTranslation();
  const v = Math.max(0, Math.min(100, Math.round(value)));
  const stroke = Math.max(3, Math.round(size / 12));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const name = label ?? t('kit.health');
  return (
    <div className={cn('inline-flex flex-col items-center gap-2', className)}>
      <div role="img" aria-label={`${name}: ${v}%`} className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden="true">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-border-default" />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - v / 100)}
            className="stroke-status-success"
          />
        </svg>
        {size >= 48 && <span className="absolute inset-0 inline-flex items-center justify-center text-label-strong text-text-primary">{v}%</span>}
      </div>
      {label !== '' && <span className="text-small text-text-secondary">{name}</span>}
    </div>
  );
}

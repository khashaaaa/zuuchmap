import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/cn';

export interface WizardStepsProps {
  /** 1-based current step. */
  current: number;
  /** Step names; defaults to the five listing steps. */
  steps?: readonly string[];
  className?: string;
}

export function WizardSteps({ current, steps, className }: WizardStepsProps) {
  const { t } = useTranslation();
  const names = steps ?? [1, 2, 3, 4, 5].map((n) => t(`kit.wizard.s${n}`));
  const total = names.length;
  return (
    <div className={cn('flex flex-col gap-2.5', className)}>
      <div className="flex items-baseline gap-2">
        <span className="text-overline text-text-secondary">{t('kit.wizard.step', { current, total })}</span>
        <span className="min-w-0 flex-1 truncate text-label-strong text-text-primary">{names[current - 1]}</span>
      </div>
      <div
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={total}
        aria-valuenow={current}
        aria-valuetext={`${current}/${total} ${names[current - 1] ?? ''}`}
        className="flex gap-1"
      >
        {names.map((n, i) => (
          <span key={n} className={cn('h-1 flex-1 rounded-xs', i < current ? 'bg-action-secondary' : 'bg-border-default')} />
        ))}
      </div>
    </div>
  );
}

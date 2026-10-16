import { cn } from '@/lib/cn';
import { useFormat } from '@/lib/useFormat';

export type MapPinProps = { className?: string; onClick?: () => void } & (
  | { variant: 'price'; price: number | string }
  | { variant: 'selected'; price: number | string }
  | { variant: 'cluster'; count: number }
);

/** Plain DOM for now. The full price, never compact. No shadow on Android once these become map markers. */
export function MapPin(props: MapPinProps) {
  const f = useFormat();
  if (props.variant === 'cluster') {
    return (
      <button
        type="button"
        onClick={props.onClick}
        aria-label={String(props.count)}
        className={cn(
          'inline-flex size-11 items-center justify-center rounded-pill border-2 border-text-primary bg-bg-surface text-label-strong text-text-primary',
          'focus-visible:outline-none focus-visible:shadow-focus',
          props.className,
        )}
      >
        {props.count}
      </button>
    );
  }
  const selected = props.variant === 'selected';
  const label = f.amount(props.price) ?? '';
  return (
    <button
      type="button"
      onClick={props.onClick}
      aria-pressed={selected}
      className={cn('inline-flex origin-bottom flex-col items-center focus-visible:outline-none focus-visible:[&>span:first-child]:shadow-focus', selected && 'scale-[1.2]', props.className)}
    >
      <span
        className={cn(
          'inline-flex h-8 items-center rounded-pill border px-2.5 text-label-strong shadow-md',
          selected ? 'border-action-secondary bg-action-secondary text-action-on-secondary' : 'border-border-default bg-bg-surface text-text-primary',
        )}
      >
        {label}
      </span>
      <span
        aria-hidden="true"
        className={cn('-mt-px h-[7px] w-3 [clip-path:polygon(0_0,100%_0,50%_100%)]', selected ? 'bg-action-secondary' : 'bg-bg-surface')}
      />
    </button>
  );
}

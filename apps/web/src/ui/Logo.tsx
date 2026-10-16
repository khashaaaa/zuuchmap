import { cn } from '@/lib/cn';

/** The pin-Z mark. Colour comes from the caller (`text-brand-mark` or `text-action-primary`). */
export function LogoMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={(size * 26) / 22} viewBox="5 3 22 26" fill="currentColor" aria-hidden="true" focusable="false" className={cn('shrink-0', className)}>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M16 3.3125C10.1813 3.3125 5.5 7.99375 5.5 13.8125C5.5 21.4688 16 28.6875 16 28.6875C16 28.6875 26.5 21.4688 26.5 13.8125C26.5 7.99375 21.8188 3.3125 16 3.3125ZM11.1875 9H20.8125V11.625L15.3438 16H20.8125V18.625H11.1875V16L16.6562 11.625H11.1875V9Z"
      />
    </svg>
  );
}

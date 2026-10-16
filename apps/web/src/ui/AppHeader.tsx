import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/cn';
import { Avatar } from './Avatar';
import { CountBadge } from './CountBadge';
import { IconButton } from './IconButton';
import { LogoMark } from './Logo';

export interface HeaderAction {
  icon: string;
  /** Required: icon-only. */
  label: string;
  onClick?: () => void;
  /** A count on the corner (unread notifications). */
  badge?: number;
}

export type AppHeaderProps = { className?: string } & (
  | { variant: 'root'; title: string; action?: HeaderAction }
  | { variant: 'pushed'; title: string; subtitle?: string; onBack?: () => void; action?: HeaderAction }
  | { variant: 'brand'; action?: HeaderAction }
  | { variant: 'chat'; name: string; replyNote?: string; avatarSrc?: string; onBack?: () => void; action?: HeaderAction }
);

export function AppHeader(props: AppHeaderProps) {
  const { t } = useTranslation();
  const act = props.action;
  const action = act && (
    <span className="relative inline-flex shrink-0">
      <IconButton icon={act.icon} label={act.label} variant="ghost" onClick={act.onClick} />
      <CountBadge count={act.badge ?? 0} className="pointer-events-none absolute right-0.5 top-0.5" />
    </span>
  );
  const back = (onBack?: () => void) => <IconButton icon="arrow-left" label={t('common.back')} variant="ghost" onClick={onBack} />;
  const shell = 'flex h-14 items-center bg-bg-canvas';

  switch (props.variant) {
    case 'root':
      return (
        <header className={cn(shell, 'gap-2 pl-5 pr-1', props.className)}>
          <h1 className="min-w-0 flex-1 truncate text-h2 text-text-primary">{props.title}</h1>
          {action}
        </header>
      );
    case 'pushed':
      return (
        <header className={cn(shell, 'px-1', props.className)}>
          {back(props.onBack)}
          <div className="flex min-w-0 flex-1 flex-col items-center">
            <h1 className="max-w-full truncate text-title text-text-primary">{props.title}</h1>
            {props.subtitle && <p className="text-label text-text-secondary">{props.subtitle}</p>}
          </div>
          {action ?? <span className="size-12 shrink-0" aria-hidden="true" />}
        </header>
      );
    case 'brand':
      return (
        <header className={cn(shell, 'gap-2 pl-4 pr-2', props.className)}>
          <LogoMark size={26} className="text-brand-mark" />
          <span className="min-w-0 flex-1 truncate text-h3 text-text-primary">ZuuchMap</span>
          {action}
        </header>
      );
    case 'chat':
      return (
        <header className={cn(shell, 'gap-2 pl-1 pr-2', props.className)}>
          {back(props.onBack)}
          <Avatar name={props.name} src={props.avatarSrc} size="medium" />
          <div className="flex min-w-0 flex-1 flex-col">
            <h1 className="truncate text-body-bold text-text-primary">{props.name}</h1>
            {props.replyNote && <p className="truncate text-small text-text-secondary">{props.replyNote}</p>}
          </div>
          {action}
        </header>
      );
  }
}

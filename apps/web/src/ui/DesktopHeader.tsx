import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/cn';
import { Avatar } from './Avatar';
import { Button } from './Button';
import { CountBadge } from './CountBadge';
import { Icon } from './Icon';
import { IconButton } from './IconButton';
import { LogoMark } from './Logo';
import { SearchBar } from './SearchBar';
import { WizardSteps } from './WizardSteps';

export type DesktopHeaderKey = 'saved' | 'messages' | 'notifications';

export type DesktopHeaderProps = { className?: string; /** Kit/tests: visible at every width. */ preview?: boolean } & (
  | {
      variant: 'signedIn';
      query: string;
      onQuery: (v: string) => void;
      onSubmit?: (v: string) => void;
      active?: DesktopHeaderKey;
      onSelect?: (k: DesktopHeaderKey) => void;
      avatarName: string;
      avatarSrc?: string;
      onAvatar?: () => void;
      /** Primary dot on the avatar when something is unread. */
      unread?: boolean;
      /** Unread notifications, on the bell. */
      bellCount?: number;
    }
  | {
      variant: 'guest';
      query: string;
      onQuery: (v: string) => void;
      onSubmit?: (v: string) => void;
      onSelect?: (k: DesktopHeaderKey) => void;
      onLogin?: () => void;
    }
  | { variant: 'none' }
);

function Logo() {
  return (
    <span className="flex shrink-0 items-center gap-2">
      <LogoMark size={26} className="text-action-primary" />
      <span className="text-h3 text-text-primary">ZuuchMap</span>
    </span>
  );
}

/** Desktop only (`hidden md:flex`). */
export function DesktopHeader(props: DesktopHeaderProps) {
  const { t } = useTranslation();
  const shell = cn('h-[76px] w-full items-center gap-6 border-b border-border-subtle bg-bg-surface px-6 lg:px-20', props.preview ? 'flex' : 'hidden md:flex', props.className);
  if (props.variant === 'none') {
    return <header className={cn(shell, 'h-auto py-5')}><Logo /></header>;
  }
  const icons: { key: DesktopHeaderKey; icon: string; label: string }[] = [
    { key: 'saved', icon: 'bookmark', label: t('nav.saved') },
    { key: 'messages', icon: 'message-circle', label: t('messages.title') },
    { key: 'notifications', icon: 'bell', label: t('notif.title') },
  ];
  const signedIn = props.variant === 'signedIn';
  const shown = signedIn ? icons : icons.slice(0, 2);
  const active = signedIn ? props.active : undefined;
  return (
    <header className={shell}>
      <Logo />
      <SearchBar value={props.query} onChange={props.onQuery} onSubmit={props.onSubmit} className="min-w-0 flex-1" />
      <div className="flex shrink-0 items-center gap-2">
        {shown.map((i) => (
          <span key={i.key} className="relative inline-flex">
            <IconButton
              icon={i.icon}
              label={i.label}
              variant="ghost"
              size="medium"
              className={active === i.key ? 'bg-bg-surface-sunken' : undefined}
              aria-current={active === i.key ? 'page' : undefined}
              data-notif-bell={i.key === 'notifications' ? '' : undefined}
              onClick={() => props.onSelect?.(i.key)}
            />
            {i.key === 'notifications' && signedIn && <CountBadge count={props.bellCount ?? 0} className="pointer-events-none absolute -right-1 -top-1" />}
          </span>
        ))}
        {props.variant === 'signedIn' ? (
          <button
            type="button"
            onClick={props.onAvatar}
            aria-label={props.avatarName}
            className="relative ml-1 inline-flex rounded-pill focus-visible:outline-none focus-visible:shadow-focus"
          >
            <Avatar name={props.avatarName} src={props.avatarSrc} size="medium" />
            {props.unread && <span aria-hidden="true" className="absolute -right-0.5 -top-0.5 size-2 rounded-pill bg-action-primary" />}
          </button>
        ) : (
          <Button variant="outline" size="medium" onClick={props.onLogin} className="ml-1">{t('auth.title')}</Button>
        )}
      </div>
    </header>
  );
}

export interface DesktopPageHeaderProps {
  title: string;
  subtitle?: string;
  bellLabel?: string;
  onBell?: () => void;
  /** Unread notifications, on the bell. */
  bellCount?: number;
  avatarName?: string;
  avatarType?: 'initials' | 'company';
  className?: string;
}

export function DesktopPageHeader({ title, subtitle, onBell, bellCount, bellLabel, avatarName, avatarType = 'initials', className }: DesktopPageHeaderProps) {
  const { t } = useTranslation();
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h1 className="text-h1 text-text-primary">{title}</h1>
        {subtitle && <p className="text-body text-text-secondary">{subtitle}</p>}
      </div>
      {onBell && (
        <span className="relative inline-flex">
          <IconButton icon="bell" label={bellLabel ?? t('notif.title')} data-notif-bell="" onClick={onBell} />
          <CountBadge count={bellCount ?? 0} className="pointer-events-none absolute -right-0.5 -top-0.5" />
        </span>
      )}
      {avatarName && <Avatar name={avatarName} type={avatarType} size="medium" />}
    </div>
  );
}

export interface DesktopWizardHeaderProps {
  title: string;
  /** e.g. "Ноорог хадгалагдсан · дөнгөж сая"; omitted until a draft exists. */
  savedNote?: string;
  current: number;
  className?: string;
}

export function DesktopWizardHeader({ title, savedNote, current, className }: DesktopWizardHeaderProps) {
  return (
    <div className={cn('flex flex-wrap items-center gap-3', className)}>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <h1 className="text-h1 text-text-primary">{title}</h1>
        {savedNote && (
          <p className="flex items-center gap-1.5 text-small text-text-secondary">
            <Icon name="circle-check" size={14} className="text-status-success" />
            {savedNote}
          </p>
        )}
      </div>
      <WizardSteps current={current} className="w-[420px] max-w-full" />
    </div>
  );
}

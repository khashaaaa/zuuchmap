import type { ReactNode } from 'react';
import { Navigate, useNavigate, useOutletContext } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/lib/auth';
import { useNotificationUnread } from '@/lib/notifications';
import { cn } from '@/lib/cn';
import { AppHeader, type HeaderAction } from '@/ui/AppHeader';
import { DesktopPageHeader } from '@/ui/DesktopHeader';
import { Icon } from '@/ui/Icon';
import { NeedSignIn } from '../NeedSignIn';

/** Signed-in providers only; a customer is sent to the "become a provider" page, a guest to sign-in. */
export function ProviderOnly({ children }: { children: ReactNode }) {
  const token = useAuthStore((s) => s.token);
  const type = useAuthStore((s) => s.user?.type);
  if (!token) return <NeedSignIn />;
  if (type !== 'PROVIDER') return <Navigate to="/become-provider" replace />;
  return <>{children}</>;
}

interface HeadProps {
  title: string;
  subtitle?: string;
  /** Pushed screens: a back control (phone header arrow, desktop link). */
  back?: boolean | (() => void);
  action?: HeaderAction;
  className?: string;
}

/** Phone: the app header. md and up: the page title row of the provider desktop frames. */
export function PageHead({ title, subtitle, back, action, className }: HeadProps) {
  const { t } = useTranslation();
  const nav = useNavigate();
  const ctx = useOutletContext<{ bell?: () => void } | null>();
  const phone = useAuthStore((s) => s.user?.phone_number);
  const bell = useNotificationUnread();
  const goBack = typeof back === 'function' ? back : () => void nav(-1);
  return (
    <>
      {back ? (
        <AppHeader variant="pushed" title={title} subtitle={subtitle} onBack={goBack} action={action} className="md:hidden" />
      ) : (
        <AppHeader variant="root" title={title} action={action} className="md:hidden" />
      )}
      <div className={cn('hidden px-8 pt-8 md:block', className)}>
        {back && (
          <button type="button" onClick={goBack} className="mb-2 inline-flex h-8 items-center gap-1 rounded-md text-label-strong text-text-link focus-visible:outline-none focus-visible:shadow-focus">
            <Icon name="arrow-left" size={16} />
            {t('common.back')}
          </button>
        )}
        <DesktopPageHeader title={title} subtitle={subtitle} onBell={ctx?.bell} bellCount={bell} avatarName={phone} avatarType="company" />
      </div>
    </>
  );
}

/** The "Гарчиг + Бүгд" row above a section. */
export function SectionTitle({ children, action }: { children: ReactNode; action?: { label: string; onClick: () => void } }) {
  return (
    <div className="flex items-center gap-3">
      <h2 className="min-w-0 flex-1 text-h3 text-text-primary">{children}</h2>
      {action && (
        <button type="button" onClick={action.onClick} className="inline-flex h-10 items-center text-label-strong text-text-link focus-visible:outline-none focus-visible:shadow-focus">
          {action.label}
        </button>
      )}
    </div>
  );
}

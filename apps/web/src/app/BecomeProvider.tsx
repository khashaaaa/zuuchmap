import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore, useSignInSheet } from '@/lib/auth';
import { useDocTitle } from '@/lib/meta';
import { useCategories } from '@/lib/queries';
import { AppHeader } from '@/ui/AppHeader';
import { Button } from '@/ui/Button';
import { Icon } from '@/ui/Icon';
import { useEffect } from 'react';

/** N4. Guests get the sign-in sheet; "continue" opens the listing wizard, whose first listing makes the account a provider. */
export default function BecomeProvider() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const token = useAuthStore((s) => s.token);
  const cats = useCategories();
  useDocTitle(t('customer.become.title'));

  useEffect(() => {
    if (!token) useSignInSheet.getState().show('generic');
  }, [token]);

  return (
    <div className="mx-auto flex w-full max-w-[480px] flex-col">
      <AppHeader variant="pushed" title="" onBack={() => void nav(-1)} className="md:hidden" />
      <div className="flex flex-col items-center gap-5 px-6 pb-10 pt-10 text-center">
        <span className="inline-flex size-20 items-center justify-center rounded-pill bg-action-primary-tint text-text-link">
          <Icon name="truck" size={36} />
        </span>
        <h1 className="text-h1 text-text-primary">{t('customer.become.title')}</h1>
        <p className="text-body text-text-secondary">{t('customer.become.subtitle')}</p>
        <ul className="flex w-full flex-col gap-3 text-left">
          {[t('customer.become.perk1', { count: cats.data?.length ?? 0 }), t('customer.become.perk2'), t('customer.become.perk3')].map((p) => (
            <li key={p} className="flex items-center gap-3 text-body text-text-primary">
              <Icon name="circle-check" size={24} className="text-text-link" />
              {p}
            </li>
          ))}
        </ul>
        <p className="flex w-full items-start gap-2 text-left text-small text-text-secondary">
          <Icon name="info" size={16} className="mt-0.5" />
          {t('customer.become.note')}
        </p>
        <div className="mt-4 flex w-full flex-col gap-3">
          <Button onClick={() => (token ? void nav('/provider/new') : useSignInSheet.getState().show('generic', () => void nav('/provider/new')))}>{t('auth.continue')}</Button>
          <Button variant="outline" onClick={() => void nav('/')}>{t('customer.become.later')}</Button>
        </div>
      </div>
    </div>
  );
}

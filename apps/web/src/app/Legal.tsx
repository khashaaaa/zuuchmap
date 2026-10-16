import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/lib/auth';
import { errorKey } from '@/lib/api';
import { useCatalogue, useDeleteAccount } from '@/lib/billing';
import { useDocTitle } from '@/lib/meta';
import { useToast } from '@/lib/toast';
import { AppHeader } from '@/ui/AppHeader';
import { Banner } from '@/ui/Banner';
import { Button } from '@/ui/Button';
import { Icon } from '@/ui/Icon';
import { Modal } from '@/ui/Modal';
import { NeedSignIn } from './NeedSignIn';

const SUPPORT_EMAIL = 'support@zuuchmap.com';
/** The date the privacy policy and terms took effect (Figma L2, L6). */
const EFFECTIVE = '2026.08.22';

function Page({ title, children }: { title: string; children: React.ReactNode }) {
  const nav = useNavigate();
  useDocTitle(title);
  return (
    <div className="mx-auto w-full max-w-[720px] pb-12">
      <AppHeader variant="pushed" title={title} onBack={() => void nav(-1)} className="md:hidden" />
      <h1 className="hidden px-6 pt-8 text-h1 text-text-primary md:block">{title}</h1>
      <div className="flex flex-col gap-5 px-4 pt-4 md:px-6">{children}</div>
    </div>
  );
}

/** Figma L1. */
export function Help() {
  const { t } = useTranslation();
  const phone = useCatalogue().data?.support_phone ?? '+976 8008-8253';
  const [open, setOpen] = useState(0);
  const contact = (icon: string, label: string, value: string, href: string, action: string) => (
    <li className="flex items-center gap-3 px-4 py-3">
      <Icon name={icon} size={20} className="text-icon-secondary" />
      <div className="min-w-0 flex-1">
        <p className="text-small text-text-secondary">{label}</p>
        <p className="text-label-strong text-text-primary">{value}</p>
      </div>
      {href && <a href={href} className="inline-flex h-10 items-center rounded-md px-3 text-label-strong text-text-link hover:bg-bg-surface-sunken focus-visible:outline-none focus-visible:shadow-focus">{action}</a>}
    </li>
  );
  return (
    <Page title={t('legal.help.title')}>
      <ul className="flex flex-col divide-y divide-border-subtle rounded-card bg-bg-surface">
        {contact('phone', t('legal.help.phone'), phone, `tel:${phone.replace(/[^\d+]/g, '')}`, t('legal.help.call'))}
        {contact('mail', t('legal.help.email'), SUPPORT_EMAIL, `mailto:${SUPPORT_EMAIL}`, t('legal.help.write'))}
        {contact('clock', t('legal.help.hours'), t('legal.help.hoursValue'), '', '')}
      </ul>
      <section className="flex flex-col gap-2">
        <h2 className="text-h3 text-text-primary">{t('legal.help.faq')}</h2>
        <ul className="flex flex-col divide-y divide-border-subtle rounded-card bg-bg-surface">
          {[1, 2, 3, 4].map((n) => (
            <li key={n}>
              <button type="button" aria-expanded={open === n} onClick={() => setOpen(open === n ? 0 : n)} className="flex min-h-14 w-full items-center gap-3 px-4 text-left focus-visible:outline-none focus-visible:shadow-focus">
                <span className="min-w-0 flex-1 text-label-strong text-text-primary">{t(`legal.help.q${n}`)}</span>
                <Icon name="chevron-down" size={18} className={open === n ? 'rotate-180 text-icon-secondary' : 'text-icon-secondary'} />
              </button>
              {open === n && <p className="px-4 pb-4 text-body text-text-secondary">{t(`legal.help.a${n}`)}</p>}
            </li>
          ))}
        </ul>
      </section>
      <div className="flex flex-col">
        <Link to="/privacy" className="inline-flex h-12 items-center text-label-strong text-text-link focus-visible:outline-none focus-visible:shadow-focus">{t('legal.privacy.title')}</Link>
        <Link to="/terms" className="inline-flex h-12 items-center text-label-strong text-text-link focus-visible:outline-none focus-visible:shadow-focus">{t('legal.terms.title')}</Link>
      </div>
    </Page>
  );
}

function Document({ ns, sections }: { ns: 'privacy' | 'terms'; sections: number }) {
  const { t } = useTranslation();
  return (
    <Page title={t(`legal.${ns}.title`)}>
      <p className="text-small text-text-secondary">{t('legal.effective', { date: EFFECTIVE })}</p>
      <p className="text-body text-text-primary">{t(`legal.${ns}.intro`)}</p>
      {Array.from({ length: sections }, (_, i) => (
        <section key={i} className="flex flex-col gap-1.5">
          <h2 className="text-h3 text-text-primary">{t(`legal.${ns}.h${String(i + 1)}`)}</h2>
          <p className="text-body text-text-secondary">{t(`legal.${ns}.p${String(i + 1)}`)}</p>
        </section>
      ))}
      <p className="text-body text-text-secondary">{t('legal.contact')}</p>
    </Page>
  );
}

/** Figma L2. */
export const Privacy = () => <Document ns="privacy" sections={4} />;
/** Figma L6. */
export const Terms = () => <Document ns="terms" sections={4} />;

/** Figma L3/L4: what goes, then a confirmation; the browser is forgotten afterwards. */
export function DeleteAccount() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const toast = useToast();
  const token = useAuthStore((s) => s.token);
  const del = useDeleteAccount();
  const [confirm, setConfirm] = useState(false);
  if (!token) return <NeedSignIn />;
  return (
    <Page title={t('account.delete.title')}>
      <Banner tone="danger" title={t('account.delete.warning')} body={t('account.delete.warningBody')} />
      <section className="flex flex-col gap-2">
        <h2 className="text-h3 text-text-primary">{t('account.delete.what')}</h2>
        <ul className="flex flex-col gap-2">
          {[1, 2, 3, 4].map((n) => (
            <li key={n} className="flex items-center gap-2 text-body text-text-primary">
              <Icon name="x" size={16} className="text-status-danger" />
              {t(`account.delete.item${String(n)}`)}
            </li>
          ))}
        </ul>
        <p className="text-small text-text-secondary">{t('account.delete.reverify')}</p>
      </section>
      <div className="flex flex-col gap-2 md:flex-row">
        <Button variant="danger" onClick={() => setConfirm(true)} loading={del.isPending}>{t('account.delete.action')}</Button>
        <Button variant="outline" onClick={() => void nav(-1)}>{t('account.delete.back')}</Button>
      </div>
      <Modal
        open={confirm}
        onClose={() => setConfirm(false)}
        tone="danger"
        destructive
        title={t('account.delete.confirmTitle')}
        body={t('account.delete.confirmBody')}
        cancelLabel={t('account.delete.cancel')}
        confirmLabel={t('account.delete.confirm')}
        onConfirm={() => {
          setConfirm(false);
          del.mutate(undefined, {
            onSuccess: () => {
              useAuthStore.getState().clear();
              toast.success(t('account.delete.done'));
              void nav('/', { replace: true });
            },
            onError: (e) => toast.error(t(errorKey(e))),
          });
        }}
      />
    </Page>
  );
}

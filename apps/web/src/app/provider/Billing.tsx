import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { groupThousands, PLAN_MONTHS, type Payment, type PaymentInvoice } from '@zuuchmap/core';
import { errorKey } from '@/lib/api';
import { useCatalogue, useCreateInvoice, useMyPayments, useResendReceipt } from '@/lib/billing';
import { useDocTitle } from '@/lib/meta';
import { useMyStats, useProfile } from '@/lib/provider';
import { useToast } from '@/lib/toast';
import { useFormat } from '@/lib/useFormat';
import { cn } from '@/lib/cn';
import { Button } from '@/ui/Button';
import { Chip } from '@/ui/Chip';
import { EmptyState } from '@/ui/EmptyState';
import { Icon } from '@/ui/Icon';
import { QuotaMeter } from '@/ui/TabBar';
import { PageHead, ProviderOnly } from './Page';
import { PaidSheet, PaymentUnavailableSheet, QPaySheet } from './QPaySheet';

const STATUS_TONE: Record<Payment['status'], string> = {
  PAID: 'bg-status-success-tint text-status-success',
  PENDING: 'bg-status-info-tint text-status-info',
  EXPIRED: 'bg-bg-surface-sunken text-text-secondary',
  CANCELLED: 'bg-bg-surface-sunken text-text-secondary',
};

/** Figma P8: payments grouped by month, newest first; a row re-sends its receipt. */
function History() {
  const { t } = useTranslation();
  const f = useFormat();
  const toast = useToast();
  const q = useMyPayments();
  const profile = useProfile();
  const resend = useResendReceipt();
  const groups = useMemo(() => {
    const out: Array<{ key: string; label: string; rows: Payment[] }> = [];
    for (const p of q.data ?? []) {
      const ymd = f.date(p.date_created);
      const key = ymd.slice(0, 7);
      let g = out.at(-1);
      if (!g || g.key !== key) {
        g = { key, label: t('prov.value.month', { year: ymd.slice(0, 4), month: Number(ymd.slice(5, 7)) }), rows: [] };
        out.push(g);
      }
      g.rows.push(p);
    }
    return out;
  }, [q.data, f, t]);

  const onRow = (p: Payment) => {
    if (p.status !== 'PAID' || p.amount === 0) return;
    if (!profile.data?.email) {
      toast.info(t('billing.receiptNoEmail'));
      return;
    }
    resend.mutate(p.id, { onSuccess: () => toast.success(t('billing.receiptSent')), onError: (e) => toast.error(t(errorKey(e))) });
  };

  if (q.data && q.data.length === 0) return <EmptyState icon="credit-card" title={t('billing.noHistory')} className="py-10" />;
  return (
    <div className="flex flex-col gap-4">
      {groups.map((g) => (
        <section key={g.key} className="flex flex-col gap-1">
          <h3 className="px-1 text-overline text-text-secondary">{g.label}</h3>
          <ul className="flex flex-col divide-y divide-border-subtle rounded-card bg-bg-surface">
            {g.rows.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => onRow(p)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-bg-surface-sunken focus-visible:outline-none focus-visible:shadow-focus">
                  <Icon name={p.kind === 'PLAN' ? 'sparkles' : 'star'} size={20} className="shrink-0 text-icon-secondary" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-label-strong text-text-primary">
                      {p.kind === 'PLAN' ? t('billing.rowPlan', { count: p.months }) : t('billing.rowFeatured', { title: p.post_title ?? t('billing.featured.listingGone'), count: p.days ?? 0 })}
                    </p>
                    <p className="text-small text-text-secondary">
                      {[f.date(p.date_created).slice(5), p.provider === 'MANUAL' ? t('billing.manual') : 'QPay', p.reference ? `№${p.reference}` : null].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="text-label-strong text-text-primary tabular-nums">{f.amount(p.amount) ?? `${groupThousands(0)}₮`}</span>
                    <span className={cn('rounded-sm px-1.5 py-0.5 text-badge', STATUS_TONE[p.status])}>{t(`billing.status.${p.status}`)}</span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {groups.length > 0 && <p className="px-1 text-small text-text-secondary">{t('billing.historyNote')}</p>}
    </div>
  );
}

/** Figma P3d/P7d/P8d: the plan, its length, the total and QPay; the history below. */
function BillingPage() {
  const { t } = useTranslation();
  const f = useFormat();
  const nav = useNavigate();
  const loc = useLocation();
  const toast = useToast();
  const catalogue = useCatalogue();
  const stats = useMyStats();
  const create = useCreateInvoice();
  const [months, setMonths] = useState<number>(PLAN_MONTHS[0]);
  const [invoice, setInvoice] = useState<PaymentInvoice | null>(null);
  const [paid, setPaid] = useState<Payment | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  useDocTitle(t('billing.title'));

  useEffect(() => {
    if (loc.hash === '#history') document.getElementById('history')?.scrollIntoView({ block: 'start' });
  }, [loc.hash]);

  const plan = stats.data?.plan;
  const provider = catalogue.data?.plans.find((p) => p.plan === 'PROVIDER');
  const price = provider?.monthly_price ?? null;
  const current = plan?.name ?? 'FREE';
  const planName = (p: string) => t(p === 'PROVIDER' ? 'billing.planProvider' : 'billing.planFree');

  const pay = () => {
    if (!catalogue.data?.enabled || price === null) {
      setUnavailable(true);
      return;
    }
    create.mutate({ kind: 'PLAN', plan: 'PROVIDER', months }, { onSuccess: setInvoice, onError: (e) => toast.error(t(errorKey(e))) });
  };
  const onPaid = useCallback((p: Payment) => {
    setInvoice(null);
    setPaid(p);
  }, []);

  const planCard = (key: 'FREE' | 'PROVIDER', posts: number, monthly: number | null) => {
    const selected = key === 'PROVIDER';
    return (
      <div className={cn('flex items-center gap-3 rounded-card border bg-bg-surface p-4', selected ? 'border-border-selected border-2' : 'border-border-subtle')}>
        <span aria-hidden="true" className={cn('inline-flex size-5 shrink-0 items-center justify-center rounded-pill border-2', selected ? 'border-border-selected' : 'border-border-strong')}>
          {selected && <span className="size-2.5 rounded-pill bg-text-primary" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-title text-text-primary">
            {planName(key)}
            {current === key && <span className="rounded-sm bg-bg-surface-sunken px-1.5 py-0.5 text-badge text-text-secondary">{t('billing.current')}</span>}
          </p>
          <p className="text-small text-text-secondary">{t('billing.postsLimit', { count: posts })}</p>
        </div>
        <p className="shrink-0 text-right">
          <span className="text-title text-text-primary tabular-nums">{monthly === null ? '—' : (f.amount(monthly) ?? `${groupThousands(0)}₮`)}</span>
          <span className="text-small text-text-secondary"> {t('billing.perMonth')}</span>
        </p>
      </div>
    );
  };

  return (
    <div className="pb-10">
      <PageHead title={t('billing.title')} subtitle={t('billing.subtitle')} back />
      <div className="grid gap-6 px-4 pt-4 md:grid-cols-[minmax(0,1fr)_320px] md:px-8">
        <div className="flex min-w-0 flex-col gap-5">
          {plan && (
            <div className="flex flex-col gap-2 rounded-card bg-bg-surface p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-label-strong text-text-primary">{t('billing.currentPlanLine', { plan: planName(current) })}</p>
                <p className="text-small text-text-secondary">{t('billing.usage', { used: plan.active_posts, total: plan.post_limit })}</p>
              </div>
              <QuotaMeter used={plan.active_posts} total={plan.post_limit} />
              {plan.expires_at && <p className="text-small text-text-secondary">{t('billing.expiresOn', { date: f.date(plan.expires_at) })}</p>}
            </div>
          )}
          <section className="flex flex-col gap-3">
            <h2 className="text-label-strong text-text-secondary">{t('billing.choosePlan')}</h2>
            {planCard('FREE', catalogue.data?.plans.find((p) => p.plan === 'FREE')?.posts ?? 0, 0)}
            {planCard('PROVIDER', provider?.posts ?? 0, price)}
          </section>
          <section className="flex flex-col gap-3">
            <h2 className="text-label-strong text-text-secondary">{t('billing.months')}</h2>
            <div className="flex flex-wrap gap-2">
              {PLAN_MONTHS.map((m) => (
                <Chip key={m} label={t('billing.monthsValue', { count: m })} selected={months === m} onClick={() => setMonths(m)} />
              ))}
            </div>
          </section>
          <section id="history" className="flex scroll-mt-6 flex-col gap-3 pt-2">
            <h2 className="text-h3 text-text-primary">{t('billing.history')}</h2>
            <History />
          </section>
        </div>
        <aside className="flex flex-col gap-4 md:sticky md:top-8 md:self-start">
          <div className="flex flex-col gap-1 rounded-card bg-bg-surface p-4">
            <div className="flex items-center gap-2">
              <Icon name="star" size={18} className="text-icon-accent" />
              <p className="min-w-0 flex-1 text-label-strong text-text-primary">{t('billing.featured.title')}</p>
              <button type="button" onClick={() => void nav('/provider/listings?filter=live')} className="text-label-strong text-text-link focus-visible:outline-none focus-visible:shadow-focus">
                {t('billing.choose')}
              </button>
            </div>
            <p className="text-small text-text-secondary">{t('billing.featuredCardHint')}</p>
          </div>
          <div className="flex flex-col gap-3 rounded-card bg-bg-surface p-4">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-label text-text-secondary">{t('billing.totalMonths', { count: months })}</p>
              <p className="text-h2 text-text-primary tabular-nums">{price === null ? '—' : f.amount(price * months)}</p>
            </div>
            <Button onClick={pay} loading={create.isPending} className="w-full">{t('billing.payWithQpay')}</Button>
          </div>
        </aside>
      </div>
      <PaymentUnavailableSheet open={unavailable} phone={catalogue.data?.support_phone ?? ''} onClose={() => setUnavailable(false)} />
      <QPaySheet
        invoice={invoice}
        what={t('billing.rowPlan', { count: invoice?.payment.months ?? months })}
        onClose={() => setInvoice(null)}
        onRenew={pay}
        renewing={create.isPending}
        onPaid={onPaid}
      />
      <PaidSheet
        payment={paid}
        planPosts={provider?.posts ?? 0}
        onClose={() => setPaid(null)}
        primaryLabel={t('billing.publishDrafts')}
        onPrimary={() => {
          setPaid(null);
          void nav('/provider/listings?filter=draft');
        }}
        onHistory={() => {
          setPaid(null);
          document.getElementById('history')?.scrollIntoView({ behavior: 'smooth' });
        }}
      />
    </div>
  );
}

export default function Billing() {
  return (
    <ProviderOnly>
      <BillingPage />
    </ProviderOnly>
  );
}

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { INVOICE_TTL_MINUTES, type Payment, type PaymentInvoice } from '@zuuchmap/core';
import { usePaymentStatus } from '@/lib/billing';
import { useFormat } from '@/lib/useFormat';
import { Banner } from '@/ui/Banner';
import { BottomSheet } from '@/ui/BottomSheet';
import { Button } from '@/ui/Button';
import { Icon } from '@/ui/Icon';

/** A bank app's deep link; its logo falls back to a card glyph when QPay's image does not load. */
function BankLink({ link, logo, label }: { link: string; logo: string; label: string }) {
  const [broken, setBroken] = useState(!logo);
  return (
    <a href={link} className="flex min-h-[72px] flex-col items-center justify-center gap-1.5 rounded-md px-1 text-center text-small text-text-primary hover:bg-bg-surface-sunken focus-visible:outline-none focus-visible:shadow-focus">
      {broken ? <Icon name="credit-card" size={20} className="text-icon-secondary" /> : <img src={logo} alt="" onError={() => setBroken(true)} className="size-8 rounded-sm" loading="lazy" />}
      <span className="line-clamp-2">{label}</span>
    </a>
  );
}

interface Props {
  invoice: PaymentInvoice | null;
  /** "Онцлох байршуулалт — 7 хоног". */
  what: string;
  onClose: () => void;
  /** An expired invoice: open a fresh one for the same thing. */
  onRenew: () => void;
  renewing?: boolean;
  onPaid: (payment: Payment) => void;
}

/**
 * Figma P3/P3d and P6: the QR to scan with a bank app on another phone, the bank apps of this
 * one, and the wait. The engine is polled; a paid invoice hands over to the confirmation.
 */
export function QPaySheet({ invoice, what, onClose, onRenew, renewing, onPaid }: Props) {
  const { t } = useTranslation();
  const f = useFormat();
  const status = usePaymentStatus(invoice?.payment.id ?? null);
  const payment = status.data ?? invoice?.payment ?? null;
  const expired = payment?.status === 'EXPIRED' || payment?.status === 'CANCELLED';

  useEffect(() => {
    if (payment?.status === 'PAID') onPaid(payment);
  }, [payment, onPaid]);

  return (
    <BottomSheet open={!!invoice} onClose={onClose} title={t('billing.payWithQpay')}>
      {invoice && payment && (
        <div className="flex flex-col items-center gap-4 pb-2 text-center">
          <div>
            <p className="text-display text-text-primary tabular-nums">{f.amount(payment.amount)}</p>
            <p className="text-body text-text-secondary">{what}</p>
          </div>
          {expired ? (
            <Banner tone="warning" title={t('billing.expiredTitle')} body={t('billing.expiredBody')} className="w-full text-left" />
          ) : (
            <>
              {invoice.qr_image && (
                <img src={`data:image/png;base64,${invoice.qr_image}`} alt="" className="size-[200px] rounded-md bg-white p-2" />
              )}
              <p className="text-label-strong text-text-primary">{t('billing.scanQr')}</p>
              <p className="inline-flex items-center gap-1.5 text-label text-text-link" role="status">
                <Icon name="clock" size={16} />
                {t('billing.waitingForPayment')}
              </p>
            </>
          )}
          {!expired && invoice.urls.length > 0 && (
            <div className="w-full text-left">
              <p className="pb-2 text-label-strong text-text-primary">{t('billing.openBankApp')}</p>
              <div className="grid grid-cols-3 gap-2">
                {invoice.urls.map((u) => <BankLink key={u.link} link={u.link} logo={u.logo} label={u.description || u.name} />)}
              </div>
            </div>
          )}
          <div className="flex w-full flex-col items-stretch gap-3 pt-1 text-left md:flex-row md:items-center">
            <p className="flex-1 text-small text-text-secondary">{t('billing.invoiceNote', { minutes: INVOICE_TTL_MINUTES })}</p>
            {expired ? (
              <Button onClick={onRenew} loading={renewing}>{t('billing.payWithQpay')}</Button>
            ) : (
              <Button variant="outline" size="medium" icon="refresh-cw" loading={status.isFetching} onClick={() => void status.refetch()}>{t('billing.check')}</Button>
            )}
          </div>
        </div>
      )}
    </BottomSheet>
  );
}

/** Figma P4 (placement live) and P7 (plan active). */
export function PaidSheet({ payment, planPosts, onClose, onPrimary, primaryLabel, onHistory }: {
  payment: Payment | null;
  /** The Provider plan's listing allowance (catalogue). */
  planPosts: number;
  onClose: () => void;
  onPrimary: () => void;
  primaryLabel: string;
  onHistory: () => void;
}) {
  const { t } = useTranslation();
  const f = useFormat();
  const plan = payment?.kind === 'PLAN';
  return (
    <BottomSheet open={!!payment} onClose={onClose} title={t('billing.paid')}>
      {payment && (
        <div className="flex flex-col items-center gap-3 pb-2 text-center">
          <span className="inline-flex size-16 items-center justify-center rounded-pill bg-status-success-tint text-status-success">
            <Icon name="circle-check" size={32} />
          </span>
          <h3 className="text-h2 text-text-primary">{plan ? t('billing.planActiveTitle') : t('billing.paid')}</h3>
          <p className="text-body text-text-secondary">{plan ? t('billing.planActiveBody', { count: planPosts }) : t('billing.featured.paidHint')}</p>
          {payment.granted_until && (
            <p className="rounded-md bg-bg-surface-sunken px-3 py-2 text-label-strong text-text-primary">
              {plan ? t('billing.untilAmount', { date: f.date(payment.granted_until), amount: f.amount(payment.amount) }) : t('billing.featuredUntil', { date: f.date(payment.granted_until) })}
            </p>
          )}
          <Button onClick={onPrimary} className="w-full">{primaryLabel}</Button>
          <Button variant="outline" onClick={onHistory} className="w-full">{t('billing.history')}</Button>
        </div>
      )}
    </BottomSheet>
  );
}

/** Figma P5: online payment is off (QPay or the price not set): call instead. */
export function PaymentUnavailableSheet({ open, phone, onClose }: { open: boolean; phone: string; onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <BottomSheet open={open} onClose={onClose} title={t('billing.featured.title')}>
      <p className="text-body text-text-secondary">{t('billing.notConfigured')}</p>
      <a
        href={`tel:${phone.replace(/[^\d+]/g, '')}`}
        className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-action-primary px-5 text-label-strong text-action-on-primary focus-visible:outline-none focus-visible:shadow-focus"
      >
        <Icon name="phone" size={18} />
        {t('billing.callSupport', { phone })}
      </a>
      <Button variant="outline" onClick={onClose}>{t('billing.cancel')}</Button>
    </BottomSheet>
  );
}

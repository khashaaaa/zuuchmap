import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FEATURED_PACKS, type Payment, type PaymentInvoice } from '@zuuchmap/core';
import { errorKey } from '@/lib/api';
import { useCatalogue, useCreateInvoice } from '@/lib/billing';
import { useCategoryLookup } from '@/lib/labels';
import { useToast } from '@/lib/toast';
import { useFormat } from '@/lib/useFormat';
import { BottomSheet } from '@/ui/BottomSheet';
import { Chip } from '@/ui/Chip';
import { Icon } from '@/ui/Icon';
import { CategoryTile } from '@/ui/ListingCard';
import { PaidSheet, PaymentUnavailableSheet, QPaySheet } from './QPaySheet';

const DAY_MS = 86_400_000;

export interface FeatureTarget {
  id: number;
  title: string | null;
  category: string;
  images: string[] | null;
  expires_at: string | null;
}

/** Days left before the listing lapses, rounded up; null for an open-ended one. */
const daysLeft = (expiresAt: string | null): number | null =>
  expiresAt ? Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / DAY_MS)) : null;

/**
 * Figma P1–P6: pick a pack, see the total (cut to the listing's remaining days, P2), pay by QPay,
 * then the confirmation. With online payment off, the support number instead (P5).
 */
export function FeatureFlow({ target, onClose }: { target: FeatureTarget | null; onClose: () => void }) {
  const { t } = useTranslation();
  const f = useFormat();
  const nav = useNavigate();
  const toast = useToast();
  const cats = useCategoryLookup();
  const catalogue = useCatalogue();
  const create = useCreateInvoice();
  const [pack, setPack] = useState<number>(FEATURED_PACKS[0]);
  const [invoice, setInvoice] = useState<PaymentInvoice | null>(null);
  const [paid, setPaid] = useState<Payment | null>(null);

  const price = catalogue.data?.featured.price_per_day ?? null;
  const unavailable = !!target && !!catalogue.data && (!catalogue.data.enabled || price === null);
  const left = target ? daysLeft(target.expires_at) : null;
  const days = left === null ? pack : Math.min(pack, left);
  const clamped = left !== null && left < pack;

  const close = useCallback(() => {
    setInvoice(null);
    setPaid(null);
    setPack(FEATURED_PACKS[0]);
    onClose();
  }, [onClose]);

  const pay = () => {
    if (!target) return;
    create.mutate({ kind: 'FEATURED', post_id: target.id, days: pack }, {
      onSuccess: (inv) => setInvoice(inv),
      onError: (e) => toast.error(t(errorKey(e))),
    });
  };
  const onPaid = useCallback((p: Payment) => {
    setInvoice(null);
    setPaid(p);
  }, []);

  if (!target) return null;
  const photo = target.images?.[0];
  return (
    <>
      <PaymentUnavailableSheet open={unavailable && !invoice && !paid} phone={catalogue.data?.support_phone ?? ''} onClose={close} />
      <BottomSheet
        open={!unavailable && !invoice && !paid}
        onClose={close}
        title={t('billing.featured.title')}
        primary={{ label: t('billing.payWithQpay'), onClick: pay, disabled: create.isPending || price === null || days < 1 }}
      >
        <p className="text-body text-text-secondary">{t('billing.featured.lead')}</p>
        <div className="flex items-center gap-3 rounded-md bg-bg-surface-sunken p-3">
          <div className="size-14 shrink-0 overflow-hidden rounded-md">
            {photo ? <img src={photo} alt="" className="size-full object-cover" /> : <CategoryTile categoryKey={target.category} icon={cats.byKey.get(target.category)?.icon} glyph={22} className="size-full" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-label-strong text-text-primary">{target.title}</p>
            <p className="text-small text-text-secondary">{left === null ? t('billing.featured.listing', { id: target.id }) : t('billing.listingEnds', { id: target.id, days: left })}</p>
          </div>
        </div>
        <p className="text-label-strong text-text-primary">{t('billing.featured.days')}</p>
        <div className="flex flex-wrap gap-2">
          {FEATURED_PACKS.map((d) => (
            <Chip key={d} label={t('billing.featured.daysValue', { count: d })} selected={pack === d} onClick={() => setPack(d)} />
          ))}
        </div>
        {clamped && (
          <p className="flex items-start gap-2 text-small text-text-secondary">
            <Icon name="info" size={16} className="mt-0.5" />
            {t('billing.featured.clamped', { count: days })}
          </p>
        )}
        {price !== null && (
          <div className="flex items-end justify-between gap-3 pt-1">
            <div>
              <p className="text-label text-text-secondary">{t('billing.total')}</p>
              <p className="text-small text-text-tertiary">{t('billing.totalDays', { count: days, price: f.amount(price) })}</p>
            </div>
            <p className="text-h1 text-text-primary tabular-nums">{f.amount(price * days)}</p>
          </div>
        )}
      </BottomSheet>
      <QPaySheet
        invoice={invoice}
        what={`${t('billing.featured.title')} — ${t('billing.featured.daysValue', { count: invoice?.payment.days ?? days })}`}
        onClose={close}
        onRenew={pay}
        renewing={create.isPending}
        onPaid={onPaid}
      />
      <PaidSheet
        payment={paid}
        planPosts={catalogue.data?.plans.find((p) => p.plan === 'PROVIDER')?.posts ?? 0}
        onClose={close}
        primaryLabel={t('billing.toListings')}
        onPrimary={() => {
          close();
          void nav('/provider/listings');
        }}
        onHistory={() => {
          close();
          void nav('/provider/billing#history');
        }}
      />
    </>
  );
}

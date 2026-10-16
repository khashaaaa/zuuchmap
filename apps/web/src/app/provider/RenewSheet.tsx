import { useTranslation } from 'react-i18next';
import { useCategoryLookup } from '@/lib/labels';
import { useMyPerformance, useRenewListing } from '@/lib/provider';
import { useFormat } from '@/lib/useFormat';
import { BottomSheet } from '@/ui/BottomSheet';
import { Icon } from '@/ui/Icon';

export interface RenewTarget { id: number; title: string | null; category: string; expires_at: string | null; renew_days?: number }

function Body({ target, fromReminder, onClose }: { target: RenewTarget; fromReminder?: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const f = useFormat();
  const cats = useCategoryLookup();
  const perf = useMyPerformance(7);
  const renew = useRenewListing();
  const days = target.renew_days ?? cats.byKey.get(target.category)?.post_expiry_days ?? 60;
  const week = perf.data?.posts.find((p) => p.id === target.id)?.current;
  return (
    <BottomSheet
      open
      onClose={onClose}
      title={t('prov.home.renew')}
      primary={{ label: renew.isPending ? t('ui.loading') : t('prov.renew.action', { days }), disabled: renew.isPending, onClick: () => renew.mutate(target.id, { onSuccess: onClose }) }}
      secondary={{ label: t('prov.renew.notNow'), onClick: onClose }}
    >
      {fromReminder && <p className="text-overline text-text-secondary">{t('prov.renew.fromReminder')}</p>}
      <div className="flex items-start gap-3">
        <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-pill bg-status-warning-tint text-status-warning"><Icon name="clock" size={22} /></span>
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-body-bold text-text-primary">{t('prov.renew.endsOn', { title: target.title ?? '', date: target.expires_at ? f.date(target.expires_at) : '' })}</p>
          <p className="text-caption text-text-secondary">{t('prov.renew.body', { days })}</p>
        </div>
      </div>
      {week && <p className="rounded-md bg-bg-surface-sunken px-3 py-2 text-caption text-text-secondary">{t('prov.renew.last7', { views: week.views, bookings: week.booking_requests })}</p>}
    </BottomSheet>
  );
}

/** E13: renew a lapsing or lapsed listing without a new check. */
export function RenewSheet({ target, ...rest }: { target: RenewTarget | null; fromReminder?: boolean; onClose: () => void }) {
  return target ? <Body target={target} {...rest} /> : null;
}

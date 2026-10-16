import { Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { formatDate } from '@zuuchmap/core';
import { useAppTheme } from '../../design/theme';
import { useListingAction, useMyListings, useMyPerformance } from '../../lib/provider';
import { BottomSheet } from '../../ui/BottomSheet';
import { useToast } from '../../ui/Toast';
import { useLocale } from '../../ui/useLocale';

export interface RenewTarget { id: number; title: string | null; category?: string; expires_at: string | null }

/** E13: renew a lapsing or lapsed listing for another window; no new moderation. */
export function RenewSheet({ target, onClose }: { target: RenewTarget | null; onClose: () => void }) {
  const { colors, type } = useAppTheme();
  const { t } = useTranslation();
  const locale = useLocale();
  const toast = useToast();
  const renew = useListingAction('renew');
  const perf = useMyPerformance(7);
  const mineList = useMyListings();
  const item = mineList.data?.find((p) => p.id === target?.id);
  const days = item?.renew_days ?? 60;
  const week = perf.data?.posts.find((p) => p.id === target?.id)?.current;
  return (
    <BottomSheet
      visible={!!target}
      onClose={onClose}
      title={target ? t('prov.renew.endsOn', { title: target.title ?? '', date: target.expires_at ? formatDate(target.expires_at, locale) : '' }) : ''}
      footerLabel={t('prov.renew.action', { days })}
      footerDisabled={renew.isPending}
      onFooter={() => {
        if (!target) return;
        renew.mutate(target.id, { onSuccess: () => { toast.show({ message: t('prov.renew.done'), kind: 'success' }); onClose(); } });
      }}
    >
      <Text style={[type.body, { color: colors.textSecondary }]}>{t('prov.renew.body', { days })}</Text>
      {week ? <Text style={[type.small, { color: colors.textSecondary }]}>{t('prov.renew.last7', { views: week.views, bookings: week.booking_requests })}</Text> : null}
    </BottomSheet>
  );
}

import { useEffect, useState } from 'react';
import { Image, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { FEATURED_PACKS, formatPrice } from '@zuuchmap/core';
import { themedStyles, useAppTheme } from '../../design/theme';
import { errorText } from '../../lib/api';
import { useCatalogue, useCreateInvoice } from '../../lib/billing';
import type { Nav } from '../../nav';
import { BottomSheet } from '../../ui/BottomSheet';
import { Chip } from '../../ui/Chip';
import { Icon } from '../../ui/Icon';
import { useToast } from '../../ui/Toast';
import { useLocale } from '../../ui/useLocale';
import { UnavailableSheet } from './Billing';

const DAY_MS = 86_400_000;

export interface FeatureTarget { id: number; title: string | null; category: string; images: string[] | null; expires_at: string | null }

const useStyles = themedStyles((t) => ({
  lead: { ...t.type.body, color: t.colors.textSecondary },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: t.radius.md, backgroundColor: t.colors.bgSurfaceSunken },
  thumb: { width: 56, height: 56, borderRadius: t.radius.md, overflow: 'hidden' },
  title: { ...t.type.labelStrong, color: t.colors.textPrimary },
  cap: { ...t.type.small, color: t.colors.textSecondary },
  label: { ...t.type.labelStrong, color: t.colors.textPrimary },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  note: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  total: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  big: { ...t.type.h1, color: t.colors.textPrimary, fontVariant: ['tabular-nums'] },
}));

/** Figma P1/P2: a pack, the total cut to the listing's remaining days, then QPay (P3). P5 when payment is off. */
export function FeatureSheet({ target, onClose }: { target: FeatureTarget | null; onClose: () => void }) {
  const s = useStyles();
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const locale = useLocale();
  const nav = useNavigation<Nav>();
  const toast = useToast();
  const catalogue = useCatalogue();
  const create = useCreateInvoice();
  const [pack, setPack] = useState<number>(FEATURED_PACKS[0]);
  useEffect(() => setPack(FEATURED_PACKS[0]), [target?.id]);

  const price = catalogue.data?.featured.price_per_day ?? null;
  const unavailable = !!target && !!catalogue.data && (!catalogue.data.enabled || price === null);
  const left = target?.expires_at ? Math.max(0, Math.ceil((new Date(target.expires_at).getTime() - Date.now()) / DAY_MS)) : null;
  const days = left === null ? pack : Math.min(pack, left);

  const pay = () => {
    if (!target) return;
    create.mutate({ kind: 'FEATURED', post_id: target.id, days: pack }, {
      onSuccess: (inv) => {
        onClose();
        nav.navigate('Payment', { id: inv.payment.id });
      },
      onError: (e) => toast.show({ message: errorText(e), kind: 'error' }),
    });
  };

  if (unavailable) return <UnavailableSheet visible phone={catalogue.data?.support_phone ?? ''} onClose={onClose} />;
  const photo = target?.images?.[0];
  return (
    <BottomSheet
      visible={!!target}
      onClose={onClose}
      title={t('billing.featured.title')}
      footerLabel={t('billing.payWithQpay')}
      onFooter={pay}
      footerDisabled={create.isPending || price === null || days < 1}
    >
      {target ? (
        <View style={{ gap: 14 }}>
          <Text style={s.lead}>{t('billing.featured.lead')}</Text>
          <View style={s.item}>
            <View style={s.thumb}>{photo ? <Image source={{ uri: photo }} style={{ width: 56, height: 56 }} /> : <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bgSurface }}><Icon name="package" categoryKey={target.category} size={24} color={colors.iconSecondary} /></View>}</View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={s.title} numberOfLines={1}>{target.title}</Text>
              <Text style={s.cap}>{left === null ? t('billing.featured.listing', { id: target.id }) : t('billing.listingEnds', { id: target.id, days: left })}</Text>
            </View>
          </View>
          <Text style={s.label}>{t('billing.featured.days')}</Text>
          <View style={s.wrap}>
            {FEATURED_PACKS.map((d) => <Chip key={d} label={t('billing.featured.daysValue', { count: d })} selected={pack === d} onPress={() => setPack(d)} />)}
          </View>
          {left !== null && left < pack ? (
            <View style={s.note}>
              <Icon name="info" size={16} color={colors.iconSecondary} />
              <Text style={[s.cap, { flex: 1 }]}>{t('billing.featured.clamped', { count: days })}</Text>
            </View>
          ) : null}
          {price !== null ? (
            <View style={s.total}>
              <View>
                <Text style={s.cap}>{t('billing.total')}</Text>
                <Text style={s.cap}>{t('billing.totalDays', { count: days, price: formatPrice(price, 'TOTAL', locale) ?? '' })}</Text>
              </View>
              <Text style={s.big}>{formatPrice(price * days, 'TOTAL', locale)}</Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </BottomSheet>
  );
}

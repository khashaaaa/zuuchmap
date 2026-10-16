import { useEffect, useMemo, useState } from 'react';
import { FlatList, Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { ANALYTICS_EVENTS, estimateEtaMinutes, formatDistance, formatPriceParts, type ListingListItem } from '@zuuchmap/core';
import { themedStyles, useAppTheme } from '../../design/theme';
import { isOffline } from '../../lib/api';
import { placeLabel } from '../../lib/browse';
import { UB, useGeo } from '../../lib/geo';
import { useCategories, useSosList } from '../../lib/queries';
import { recordCall, track } from '../../lib/track';
import type { Nav } from '../../nav';
import { AppHeader } from '../../ui/AppHeader';
import { Button } from '../../ui/Button';
import { Chip } from '../../ui/Chip';
import { EmptyState } from '../../ui/EmptyState';
import { Icon } from '../../ui/Icon';
import { SkeletonListingRow } from '../../ui/SkeletonListingRow';
import { useToast } from '../../ui/Toast';
import { useLocale } from '../../ui/useLocale';
import { ProvinceSheet } from './Sheets';

const useStyles = themedStyles((t) => ({
  screen: { flex: 1, backgroundColor: t.colors.bgCanvas },
  hero: { gap: 8, paddingHorizontal: t.spacing.screenPadding, paddingVertical: 16, backgroundColor: t.colors.statusDangerTint },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  h: { ...t.type.h2, color: t.colors.textPrimary, flex: 1 },
  body: { ...t.type.body, color: t.colors.textSecondary },
  loc: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 32 },
  locText: { ...t.type.labelStrong, color: t.colors.textPrimary },
  link: { ...t.type.labelStrong, color: t.colors.textLink },
  chips: { gap: 8, paddingHorizontal: t.spacing.screenPadding, paddingVertical: 12 },
  note: { ...t.type.small, color: t.colors.textSecondary, paddingHorizontal: t.spacing.screenPadding, paddingBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: t.spacing.screenPadding, paddingVertical: 14 },
  disc: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: t.colors.statusDangerTint },
  title: { ...t.type.bodyBold, color: t.colors.textPrimary },
  sub: { ...t.type.small, color: t.colors.textSecondary },
  price: { ...t.type.labelStrong, color: t.colors.textPrimary },
  rule: { height: 1, marginHorizontal: t.spacing.screenPadding, backgroundColor: t.colors.borderSubtle },
}));

/** Roughly inside Ulaanbaatar: the fix names no place, so say the city when it is one. */
const nearUB = (c: { lat: number; lng: number }) => Math.abs(c.lat - UB.lat) < 0.25 && Math.abs(c.lng - UB.lng) < 0.4;

/** S1: nearest 24/7 help, one Залгах away, no sign-in. */
export function Sos() {
  const s = useStyles();
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const locale = useLocale();
  const nav = useNavigation<Nav>();
  const toast = useToast();
  const geo = useGeo();
  const cats = useCategories();
  const [sub, setSub] = useState<string | undefined>();
  const [province, setProvince] = useState<string | undefined>();
  const [pick, setPick] = useState(false);

  useEffect(() => {
    void geo.ask();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ask once when SOS opens
  }, []);

  const coords = geo.status === 'granted' ? geo.coords : null;
  const list = useSosList(coords, province, sub);
  const sos = cats.data?.find((c) => c.sos);
  const place = province ? placeLabel(t, province) : coords && nearUB(coords) ? placeLabel(t, 'ULAANBAATAR') : t('common.locationUnknown');
  const items = useMemo(() => list.data?.items ?? [], [list.data]);

  const call = (item: ListingListItem) => {
    if (!item.contact_phone) {
      toast.show({ message: t('posts.noPhone'), kind: 'error' });
      return;
    }
    track(ANALYTICS_EVENTS.CONTACT_CALL, { post_id: item.id, sos: true });
    recordCall(item.id);
    void Linking.openURL(`tel:${item.contact_phone}`).catch(() => toast.show({ message: t('errors.unknown'), kind: 'error' }));
  };

  return (
    <View style={s.screen}>
      <AppHeader variant="pushed" title={t('customer.sos.title')} onBack={() => nav.goBack()} />
      <View style={s.hero}>
        <View style={s.heading}>
          <Icon name="siren" size={28} color={colors.statusDanger} />
          <Text style={s.h} accessibilityRole="header">{t('customer.sos.heading')}</Text>
        </View>
        <Text style={s.body}>{t('customer.sos.body')}</Text>
        <View style={s.loc}>
          <Icon name="map-pin" size={16} color={colors.iconPrimary} />
          <Text style={s.locText}>{t('customer.sos.yourLocation', { place })}</Text>
          <Pressable accessibilityRole="button" hitSlop={12} onPress={() => setPick(true)}>
            <Text style={s.link}>{t('customer.sos.change')}</Text>
          </Pressable>
        </View>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips} style={{ flexGrow: 0 }}>
        <Chip label={t('customer.browse.all')} selected={!sub} onPress={() => setSub(undefined)} />
        {(sos?.subcategories ?? []).map((x) => (
          <Chip key={x.value} label={x.label} selected={sub === x.value} onPress={() => setSub(sub === x.value ? undefined : x.value)} />
        ))}
      </ScrollView>
      <Text style={s.note}>{t('customer.sos.sortNote')}</Text>
      <FlatList
        data={items}
        keyExtractor={(i) => String(i.id)}
        ItemSeparatorComponent={() => <View style={s.rule} />}
        ListEmptyComponent={
          list.isPending ? (
            <View style={{ padding: 16, gap: 12 }}><SkeletonListingRow /><SkeletonListingRow /></View>
          ) : list.isError ? (
            <EmptyState icon={isOffline(list.error) ? 'wifi-off' : 'circle-alert'} title={t('customer.browse.loadFailed')} body={t('customer.browse.loadFailedBody')} actionLabel={t('common.retry')} onAction={() => void list.refetch()} />
          ) : (
            <EmptyState icon="search" title={t('filter.searchNoResults')} body={t('customer.browse.noResultsBody')} />
          )
        }
        renderItem={({ item }) => {
          const eta = estimateEtaMinutes(item.distance_m);
          const dist = formatDistance(item.distance_m, locale);
          const price = item.price_amount !== null ? formatPriceParts(item.price_amount, item.price_unit, locale) : null;
          const line = [eta !== null ? t('customer.sos.eta', { minutes: eta }) : null, dist].filter(Boolean).join(' · ');
          return (
            <View style={s.row}>
              <View style={s.disc}><Icon name="siren" size={22} color={colors.statusDanger} /></View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={s.title} numberOfLines={2}>{item.title}</Text>
                {line ? <Text style={s.sub}>{line}</Text> : null}
                <Text style={s.price}>{price ? `${price.amount} ${t('customer.sos.perCall')}` : t('customer.sos.negotiable')}</Text>
              </View>
              <Button label={t('posts.call')} icon="phone" variant="danger" size="medium" onPress={() => call(item)} />
            </View>
          );
        }}
      />
      <ProvinceSheet visible={pick} onClose={() => setPick(false)} province={province} onPick={(p) => setProvince(p)} />
    </View>
  );
}

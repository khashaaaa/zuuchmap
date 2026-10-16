import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { listingHealth } from '@zuuchmap/core';
import { themedStyles, useAppTheme } from '../../design/theme';
import { errorText } from '../../lib/api';
import { changeText, useMyListings, useListingAction, useListingPerformance } from '../../lib/provider';
import { useCategories, useListing } from '../../lib/queries';
import type { Nav, RootStackParamList } from '../../nav';
import { AppHeader } from '../../ui/AppHeader';
import { EmptyState } from '../../ui/EmptyState';
import { Icon } from '../../ui/Icon';
import { ListingHealthRing } from '../../ui/ListingHealthRing';
import { Modal } from '../../ui/Modal';
import { SkeletonListingRow } from '../../ui/SkeletonListingRow';
import { StatTile } from '../../ui/StatTile';
import { useToast } from '../../ui/Toast';
import { RenewSheet } from './RenewSheet';

const useStyles = themedStyles((t) => ({
  screen: { flex: 1, backgroundColor: t.colors.bgCanvas },
  content: { paddingHorizontal: t.spacing.screenPadding, paddingBottom: 32, gap: 16 },
  title: { ...t.type.h2, color: t.colors.textPrimary },
  sub: { ...t.type.caption, color: t.colors.textSecondary },
  h: { ...t.type.h3, color: t.colors.textPrimary },
  card: { gap: 12, padding: 16, borderRadius: t.radius.card, backgroundColor: t.colors.bgSurface },
  row: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowText: { ...t.type.bodyMedium, color: t.colors.textPrimary },
  rowHint: { ...t.type.small, color: t.colors.textSecondary },
}));

/** E6: one listing's last 7 days against the 7 before, its completeness and what to do next. */
export function Performance() {
  const s = useStyles();
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const nav = useNavigation<Nav>();
  const toast = useToast();
  const { params } = useRoute<RouteProp<RootStackParamList, 'Performance'>>();
  const perf = useListingPerformance(params.id);
  const listing = useListing(params.id);
  const cats = useCategories();
  const mineItem = useMyListings().data?.find((x) => x.id === params.id);
  const del = useListingAction('delete');
  const [renew, setRenew] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const p = perf.data;
  const l = listing.data;
  const cat = cats.data?.find((c) => c.key === l?.category);
  const health = l ? listingHealth({ imageCount: l.images?.length ?? 0, attributes: l.attributes, details: l.details, price: l.price_amount, schema: cat }) : null;

  const delta = (a: number, b: number) => {
    const c = changeText(a, b);
    return c ? { text: t('prov.home.vsPrev', { change: c.text }), trend: c.up ? ('up' as const) : ('flat' as const) } : { text: t('prov.home.same'), trend: 'flat' as const };
  };
  const action = (icon: string, label: string, hint: string | undefined, onPress: () => void, danger?: boolean) => (
    <Pressable accessibilityRole="button" style={s.row} onPress={onPress}>
      <Icon name={icon} size={22} color={danger ? colors.statusDanger : colors.iconPrimary} />
      <View style={{ flex: 1 }}>
        <Text style={[s.rowText, danger ? { color: colors.statusDanger } : null]}>{label}</Text>
        {hint ? <Text style={s.rowHint}>{hint}</Text> : null}
      </View>
      <Icon name="chevron-right" size={18} color={colors.iconSecondary} />
    </Pressable>
  );

  return (
    <View style={s.screen}>
      <AppHeader variant="pushed" title={t('prov.perf.title')} onBack={() => nav.goBack()} />
      {perf.isLoading ? (
        <View style={{ padding: 16, gap: 12 }}><SkeletonListingRow /><SkeletonListingRow /></View>
      ) : perf.isError || !p ? (
        <EmptyState icon="wifi-off" title={t('deal.mine.errorTitle')} body={errorText(perf.error)} actionLabel={t('deal.retry')} onAction={() => void perf.refetch()} />
      ) : (
        <ScrollView contentContainerStyle={s.content}>
          <View style={{ gap: 2 }}>
            <Text style={s.title} numberOfLines={2}>{p.title}</Text>
            {p.days_left !== null ? <Text style={s.sub}>{t('prov.perf.daysLeft', { count: p.days_left })}</Text> : null}
          </View>
          <Text style={s.h} accessibilityRole="header">{t('prov.perf.last7')}</Text>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <StatTile icon="eye" label={t('prov.perf.views')} value={String(p.current.views)} delta={delta(p.current.views, p.previous.views)} />
            <StatTile icon="bookmark" label={t('prov.perf.saves')} value={String(p.current.saves)} delta={delta(p.current.saves, p.previous.saves)} />
          </View>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <StatTile icon="phone" label={t('prov.perf.contacts')} value={String(p.current.contacts)} delta={delta(p.current.contacts, p.previous.contacts)} />
            <StatTile icon="calendar" label={t('prov.perf.requests')} value={String(p.current.booking_requests)} delta={p.pending_requests > 0 ? { text: t('prov.perf.pending', { count: p.pending_requests }), trend: 'flat' } : delta(p.current.booking_requests, p.previous.booking_requests)} />
          </View>
          {health ? (
            <View style={[s.card, { flexDirection: 'row', alignItems: 'center' }]}>
              <ListingHealthRing percent={health.score} size={64} label="" />
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={s.rowText}>{t('prov.perf.health')}</Text>
                <Text style={s.rowHint}>{health.hint ? t(`provider.health${health.hint[0].toUpperCase()}${health.hint.slice(1)}`) : t('provider.healthComplete')}</Text>
              </View>
            </View>
          ) : null}
          <View style={s.card}>
            {action('pencil', t('prov.actions.edit'), t('prov.perf.editNote'), () => nav.navigate('Wizard', { edit: p.id }))}
            {action('refresh-cw', t('prov.home.renew'), t('prov.perf.renewHint', { days: mineItem?.renew_days ?? 60 }), () => setRenew(true))}
            {action('trending-up', t('prov.actions.feature'), t('prov.perf.featureHint'), () => toast.show({ message: t('prov.actions.featureSoon'), kind: 'info' }))}
            {action('trash-2', t('prov.perf.deleteListing'), undefined, () => setConfirm(true), true)}
          </View>
        </ScrollView>
      )}
      <RenewSheet target={renew && p ? { id: p.id, title: p.title, category: l?.category, expires_at: l?.expires_at ?? null } : null} onClose={() => setRenew(false)} />
      <Modal
        visible={confirm}
        onClose={() => setConfirm(false)}
        title={t('prov.actions.deleteTitle')}
        body={t('prov.actions.deleteBody')}
        icon="trash-2"
        cancelLabel={t('prov.actions.keep')}
        confirmLabel={t('prov.actions.delete')}
        onConfirm={() => {
          setConfirm(false);
          del.mutate(params.id, { onSuccess: () => { toast.show({ message: t('prov.actions.deleted'), kind: 'success' }); nav.goBack(); } });
        }}
      />
    </View>
  );
}

import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { formatDate, formatRelativeAge, type MyListingItem } from '@zuuchmap/core';
import { themedStyles, useAppTheme } from '../../design/theme';
import { daysLeft, isExpiring, listingState, matchesFilter, useListingAction, useMyListings, useMyStats, type ListingFilter } from '../../lib/provider';
import { useCategories } from '../../lib/queries';
import type { Nav, TabParamList } from '../../nav';
import { AppHeader } from '../../ui/AppHeader';
import { Banner } from '../../ui/Banner';
import { BottomSheet } from '../../ui/BottomSheet';
import { Chip } from '../../ui/Chip';
import { EmptyState } from '../../ui/EmptyState';
import { Icon } from '../../ui/Icon';
import { Modal } from '../../ui/Modal';
import { MyListingRow } from '../../ui/MyListingRow';
import { SkeletonListingRow } from '../../ui/SkeletonListingRow';
import { useToast } from '../../ui/Toast';
import { useLocale } from '../../ui/useLocale';
import { fieldLabel } from './Home';
import { FeatureSheet, type FeatureTarget } from './FeatureSheet';
import { RenewSheet, type RenewTarget } from './RenewSheet';

const useStyles = themedStyles((t) => ({
  screen: { flex: 1, backgroundColor: t.colors.bgCanvas },
  plan: { ...t.type.caption, color: t.colors.textSecondary, paddingHorizontal: t.spacing.screenPadding, paddingBottom: 8 },
  planRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 40, paddingHorizontal: t.spacing.screenPadding, paddingBottom: 4 },
  planLink: { ...t.type.labelStrong, color: t.colors.textLink },
  chips: { paddingHorizontal: t.spacing.screenPadding, gap: 8, paddingBottom: 12 },
  content: { paddingHorizontal: t.spacing.screenPadding, paddingBottom: 32, gap: 12, flexGrow: 1 },
  sheetRow: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 14 },
  sheetLabel: { ...t.type.bodyMedium, color: t.colors.textPrimary },
  sheetHint: { ...t.type.small, color: t.colors.textSecondary },
}));

const FILTERS: ListingFilter[] = ['all', 'live', 'attention', 'expired', 'draft'];

/** E2 / E17 and the sheets around them: my listings with plan line, filters, per-state cards and actions. */
export function MyListings() {
  const s = useStyles();
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const locale = useLocale();
  const nav = useNavigation<Nav>();
  const toast = useToast();
  const list = useMyListings();
  const stats = useMyStats();
  const cats = useCategories();
  const del = useListingAction('delete');
  const [filter, setFilter] = useState<ListingFilter>('all');
  const [actions, setActions] = useState<MyListingItem | null>(null);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [deleting, setDeleting] = useState<MyListingItem | null>(null);
  const [renew, setRenew] = useState<RenewTarget | null>(null);
  const [feature, setFeature] = useState<FeatureTarget | null>(null);

  const all = useMemo(() => list.data ?? [], [list.data]);

  // An expiry notification opens the renew sheet (E13) for its listing, once.
  const renewId = useRoute<RouteProp<TabParamList, 'myPosts'>>().params?.renew;
  const handled = useRef<number | null>(null);
  useEffect(() => {
    const p = renewId && handled.current !== renewId ? all.find((x) => x.id === renewId) : undefined;
    if (p) {
      handled.current = renewId ?? null;
      setRenew({ id: p.id, title: p.title, category: p.category, expires_at: p.expires_at });
    }
  }, [renewId, all]);
  const shown = useMemo(() => all.filter((p) => matchesFilter(p, filter)), [all, filter]);
  const plan = stats.data?.plan;
  const statOf = (id: number) => stats.data?.posts.find((p) => p.id === id);
  const catOf = (key: string) => cats.data?.find((c) => c.key === key);
  const filterLabel = (f: ListingFilter) =>
    ({ all: t('prov.listings.filterAll'), live: t('prov.listings.filterLive'), attention: t('prov.listings.filterAttention'), expired: t('kit.status.expired'), draft: t('prov.listings.filterDraft') })[f];

  const openSheet = (p: MyListingItem) => {
    setActions(p);
    setActionsOpen(true);
  };
  const closeSheet = () => setActionsOpen(false);
  const afterSheet = (fn: () => void) => {
    closeSheet();
    setTimeout(fn, 200);
  };

  const card = (p: MyListingItem) => {
    const st = listingState(p);
    const stat = statOf(p.id);
    const left = daysLeft(p.expires_at);
    const cat = catOf(p.category);
    const statsLine = t('prov.listings.stats', { views: stat?.views ?? p.views, saves: stat?.saves ?? 0, contacts: stat?.contacts ?? 0 });
    const ageLine = left !== null && left >= 0 ? t('posts.expiresIn', { days: left }) : null;
    const price = p.price_amount !== null && Number(p.price_amount) > 0 ? { amount: p.price_amount, unit: p.price_unit } : null;
    const open = () => (st === 'rejected' || st === 'draft' ? nav.navigate('Wizard', { edit: p.id }) : nav.navigate('ListingDetail', { id: p.id, item: p }));
    const edit = () => nav.navigate('Wizard', { edit: p.id });
    const doRenew = () => setRenew({ id: p.id, title: p.title, category: p.category, expires_at: p.expires_at });

    let status: 'live' | 'pending' | 'rejected' | 'expired' | 'draft' = 'live';
    let meta: string | undefined;
    let action: { label: string; icon: string; onPress: () => void } | undefined;
    let note: string | undefined;
    let banner: ReactElement | null = null;
    switch (st) {
      case 'live':
        meta = [statsLine, ageLine].filter(Boolean).join(' · ');
        action = isExpiring(p) ? { label: t('prov.home.renew'), icon: 'refresh-cw', onPress: doRenew } : { label: t('prov.actions.feature'), icon: 'trending-up', onPress: () => setFeature(p) };
        break;
      case 'editing':
        meta = t('prov.listings.liveStill', { views: stat?.views ?? p.views });
        banner = <Banner tone="info" title={t('prov.listings.editUnderReviewTitle', { title: p.title ?? '' })} body={t('prov.listings.editUnderReviewBody')} />;
        break;
      case 'refused':
        meta = t('prov.listings.liveStill', { views: stat?.views ?? p.views });
        banner = <Banner tone="danger" title={t('prov.listings.editRefusedTitle', { title: p.title ?? '' })} body={t('prov.listings.editRefusedBody', { reason: p.rejection_reason ?? '' })} actionLabel={t('prov.home.fix')} onAction={edit} />;
        break;
      case 'pending':
        status = 'pending';
        meta = t('prov.listings.reviewing');
        break;
      case 'rejected':
        status = 'rejected';
        note = `${fieldLabel(t, p.rejection_field, cat)}: ${p.rejection_reason ?? ''}`;
        action = { label: t('prov.home.fix'), icon: 'pencil', onPress: edit };
        break;
      case 'expired':
        status = 'expired';
        meta = t('prov.listings.expiredOn', { date: p.expires_at ? formatDate(p.expires_at, locale) : '' });
        action = { label: t('prov.home.renew'), icon: 'refresh-cw', onPress: doRenew };
        break;
      case 'draft':
        status = 'draft';
        meta = price ? t('prov.listings.draftSaved', { age: formatRelativeAge(p.date_updated, (k, o) => t(k, o) as string) }) : `${t('prov.listings.noPrice')} · ${t('prov.listings.draftSaved', { age: formatRelativeAge(p.date_updated, (k, o) => t(k, o) as string) })}`;
        action = { label: t('prov.wizard.continue'), icon: 'pencil', onPress: edit };
        break;
    }
    return (
      <View style={{ gap: 8 }}>
        <MyListingRow
          title={p.title ?? cat?.label ?? ''}
          status={status}
          categoryKey={p.category}
          categoryIcon={cat?.icon}
          photoUri={p.images?.[0] ?? null}
          price={price}
          meta={meta}
          action={action}
          rejectionNote={note}
          onPress={open}
          onMore={() => openSheet(p)}
        />
        {banner}
      </View>
    );
  };

  const sheetItem = (icon: string, label: string, onPress: () => void, hint?: string, danger?: boolean) => (
    <Pressable key={label} accessibilityRole="button" style={s.sheetRow} onPress={onPress}>
      <Icon name={icon} size={22} color={danger ? colors.statusDanger : colors.iconPrimary} />
      <View style={{ flex: 1 }}>
        <Text style={[s.sheetLabel, danger ? { color: colors.statusDanger } : null]}>{label}</Text>
        {hint ? <Text style={s.sheetHint}>{hint}</Text> : null}
      </View>
    </Pressable>
  );
  const a = actions;
  const aState = a ? listingState(a) : null;
  const aCat = a ? catOf(a.category) : undefined;

  return (
    <View style={s.screen}>
      <AppHeader variant="root" title={t('prov.tab.listings')} action={{ icon: 'plus', label: t('prov.tab.add'), onPress: () => nav.navigate('Wizard') }} />
      {plan ? (
        <Pressable accessibilityRole="button" onPress={() => nav.navigate('Billing')} style={s.planRow}>
          <Text style={[s.plan, { paddingHorizontal: 0, paddingBottom: 0, flex: 1 }]}>{t('prov.listings.plan', { plan: plan.name === 'PROVIDER' ? t('prov.listings.planProvider') : t('prov.listings.planFree'), limit: plan.post_limit, used: plan.active_posts })}</Text>
          <Text style={s.planLink}>{t('prov.listings.upgrade')}</Text>
        </Pressable>
      ) : null}
      {all.length > 0 ? (
        <View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
            {FILTERS.map((f) => (
              <Chip key={f} label={filterLabel(f)} selected={filter === f} onPress={() => setFilter(f)} />
            ))}
          </ScrollView>
        </View>
      ) : null}
      {list.isLoading ? (
        <View style={{ paddingHorizontal: 16, gap: 12 }}><SkeletonListingRow /><SkeletonListingRow /><SkeletonListingRow /></View>
      ) : list.isError ? (
        <EmptyState icon="wifi-off" title={t('deal.mine.errorTitle')} body={t('deal.mine.errorBody')} actionLabel={t('deal.retry')} onAction={() => void list.refetch()} />
      ) : (
        <FlatList
          data={shown}
          keyExtractor={(p) => String(p.id)}
          contentContainerStyle={s.content}
          refreshControl={<RefreshControl refreshing={list.isRefetching} onRefresh={() => { void list.refetch(); void stats.refetch(); }} tintColor={colors.iconSecondary} />}
          ListEmptyComponent={
            all.length === 0 ? (
              <EmptyState icon="plus" title={t('prov.listings.firstTitle')} body={t('prov.listings.firstBody')} actionLabel={t('prov.listings.add')} actionVariant="secondary" onAction={() => nav.navigate('Wizard')} />
            ) : (
              <EmptyState icon="list" title={t('prov.listings.emptyFilter')} />
            )
          }
          renderItem={({ item }) => card(item)}
        />
      )}

      <BottomSheet visible={actionsOpen} onClose={closeSheet} title={a?.title ?? ''}>
        {a ? (
          <View>
            {sheetItem('pencil', t('prov.actions.edit'), () => afterSheet(() => nav.navigate('Wizard', { edit: a.id })))}
            {sheetItem('copy', t('prov.actions.copy'), () => afterSheet(() => nav.navigate('Wizard', { copyFrom: a.id })), t('prov.actions.copyHint'))}
            {aState !== 'draft' && aState !== 'rejected' ? sheetItem('trending-up', t('prov.actions.feature'), () => afterSheet(() => setFeature(a))) : null}
            {aState !== 'draft' && aCat?.has_availability_dates ? sheetItem('calendar', t('prov.actions.blockDays'), () => afterSheet(() => nav.navigate('BlockDays', { postId: a.id }))) : null}
            {aState !== 'draft' ? sheetItem('bar-chart-3', t('prov.actions.performance'), () => afterSheet(() => nav.navigate('Performance', { id: a.id }))) : null}
            {sheetItem('trash-2', t('prov.actions.delete'), () => afterSheet(() => setDeleting(a)), undefined, true)}
          </View>
        ) : null}
      </BottomSheet>

      <Modal
        visible={!!deleting}
        onClose={() => setDeleting(null)}
        title={t('prov.actions.deleteTitle')}
        body={t('prov.actions.deleteBody')}
        icon="trash-2"
        cancelLabel={t('prov.actions.keep')}
        confirmLabel={t('prov.actions.delete')}
        onConfirm={() => {
          const d = deleting;
          setDeleting(null);
          if (d) del.mutate(d.id, { onSuccess: () => toast.show({ message: t('prov.actions.deleted'), kind: 'success' }) });
        }}
      />
      <RenewSheet target={renew} onClose={() => setRenew(null)} />
      <FeatureSheet target={feature} onClose={() => setFeature(null)} />
    </View>
  );
}

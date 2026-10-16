import { useEffect, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { SAVED_SEARCH_LIMIT, formatDate, isListingLive, type ListingListItem, type SavedSearch } from '@zuuchmap/core';
import { themedStyles, useAppTheme } from '../../design/theme';
import { errorText, isOffline } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { fromSavedParams, placeLabel, setBrowse } from '../../lib/browse';
import { markSearchSeen, useCategories, useDeleteSearch, useSaves, useSavedListings, useSavedSearches } from '../../lib/queries';
import { useGuestSaved } from '../../lib/saved';
import type { Nav, TabParamList } from '../../nav';
import { AppHeader } from '../../ui/AppHeader';
import { Banner } from '../../ui/Banner';
import { EmptyState } from '../../ui/EmptyState';
import { Icon } from '../../ui/Icon';
import { IconButton } from '../../ui/IconButton';
import { Modal } from '../../ui/Modal';
import { SegmentedControl } from '../../ui/SegmentedControl';
import { SkeletonListingRow } from '../../ui/SkeletonListingRow';
import { useToast } from '../../ui/Toast';
import { useLocale } from '../../ui/useLocale';
import { ListingRow } from './ListingRow';

const useStyles = themedStyles((t) => ({
  screen: { flex: 1, backgroundColor: t.colors.bgCanvas },
  seg: { paddingHorizontal: t.spacing.screenPadding, paddingBottom: 8 },
  content: { paddingHorizontal: t.spacing.screenPadding, paddingBottom: 24, gap: 12 },
  cap: { ...t.type.caption, color: t.colors.textSecondary },
  card: { gap: 6, padding: 16, borderRadius: t.radius.card, backgroundColor: t.colors.bgSurface },
  name: { ...t.type.bodyBold, color: t.colors.textPrimary, flex: 1 },
  badge: { paddingHorizontal: 8, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: t.colors.statusInfoTint },
  badgeText: { ...t.type.badge, color: t.colors.statusInfo },
  line: { ...t.type.caption, color: t.colors.textSecondary },
}));

type Seg = 'listings' | 'searches';

export function Saved() {
  const s = useStyles();
  const { t } = useTranslation();
  const nav = useNavigation<Nav>();
  const { token } = useAuth();
  const [seg, setSeg] = useState<Seg>('listings');
  const wantSeg = useRoute<RouteProp<TabParamList, 'saved'>>().params?.seg;
  // A saved-search notification opens the searches.
  useEffect(() => {
    if (wantSeg === 'searches') setSeg('searches');
  }, [wantSeg]);
  const guest = useGuestSaved();
  const server = useSavedListings();
  const searches = useSavedSearches();
  const { isSaved, toggle } = useSaves();
  const toast = useToast();

  const listings = token ? (server.data?.items ?? []) : guest;
  const searchCount = token ? (searches.data?.length ?? 0) : 0;

  const remove = (item: ListingListItem) => {
    void toggle(item);
    toast.show({ message: t('customer.saved.removed'), actionLabel: t('customer.saved.undo'), onAction: () => void toggle(item) });
  };

  return (
    <View style={s.screen}>
      <AppHeader variant="root" title={t('customer.saved.title')} />
      <View style={s.seg}>
        <SegmentedControl
          value={seg}
          onChange={setSeg}
          segments={[
            { value: 'listings', label: t('customer.saved.listings', { count: listings.length }) },
            { value: 'searches', label: t('customer.saved.searches', { count: searchCount }) },
          ]}
        />
      </View>
      {seg === 'listings' ? (
        <FlatList
          data={listings}
          keyExtractor={(i) => String(i.id)}
          contentContainerStyle={s.content}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          ListEmptyComponent={
            token && server.isPending ? (
              <View style={{ gap: 12 }}><SkeletonListingRow /><SkeletonListingRow /></View>
            ) : token && server.isError ? (
              <EmptyState icon={isOffline(server.error) ? 'wifi-off' : 'circle-alert'} title={t('customer.browse.loadFailed')} body={errorText(server.error)} actionLabel={t('common.retry')} onAction={() => void server.refetch()} />
            ) : (
              <EmptyState icon="heart" title={t('posts.noSaved')} actionLabel={t('posts.browse')} actionVariant="secondary" onAction={() => nav.navigate('Tabs', { screen: 'browse' })} />
            )
          }
          ListHeaderComponent={token && server.isError && listings.length > 0 ? <Banner tone="offline" title={t('offline.noConnection')} actionLabel={t('common.retry')} onAction={() => void server.refetch()} /> : null}
          renderItem={({ item }) => (
            <View style={isListingLive(item) ? undefined : { opacity: 0.55 }}>
              <ListingRow item={item} saved={isSaved(item.id)} onToggleSave={remove} onOpen={(i) => nav.navigate('ListingDetail', { id: i.id, item: i })} />
              {isListingLive(item) ? null : <Text style={[s.cap, { paddingTop: 4, paddingLeft: 4 }]}>{t('customer.saved.unavailable')}</Text>}
            </View>
          )}
        />
      ) : (
        <SearchesList />
      )}
    </View>
  );
}

function SearchesList() {
  const s = useStyles();
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const locale = useLocale();
  const nav = useNavigation<Nav>();
  const qc = useQueryClient();
  const { token } = useAuth();
  const query = useSavedSearches();
  const del = useDeleteSearch();
  const categories = useCategories();
  const toast = useToast();
  const [target, setTarget] = useState<SavedSearch | null>(null);

  const summary = (sv: SavedSearch): string => {
    const p = sv.params;
    const cat = categories.data?.find((c) => c.key === p.category);
    const attrs = Object.entries(p.attrs ?? {}).map(([k, v]) => {
      const base = k.replace(/_(min|max)$/, '');
      const label = cat?.fields.find((f) => f.key === base)?.label ?? base;
      return k.endsWith('_min') ? `${label} ≥ ${v}` : k.endsWith('_max') ? `${label} ≤ ${v}` : v === 'true' ? label : `${label}: ${v}`;
    });
    return [p.q, cat?.label, placeLabel(t, p.province, p.district), ...attrs].filter(Boolean).join(' · ');
  };

  if (!token) {
    return <EmptyState icon="bookmark" title={t('auth.guestTitle')} body={t('customer.signin.sheetSearch')} actionLabel={t('auth.title')} actionVariant="secondary" onAction={() => nav.navigate('SignIn')} />;
  }
  if (query.isPending) return <View style={{ padding: 16, gap: 12 }}><SkeletonListingRow /></View>;
  if (query.isError) return <EmptyState icon="wifi-off" title={t('customer.browse.loadFailed')} body={errorText(query.error)} actionLabel={t('common.retry')} onAction={() => void query.refetch()} />;

  const list = query.data;
  return (
    <>
      <FlatList
        data={list}
        keyExtractor={(i) => i.id}
        contentContainerStyle={s.content}
        ListHeaderComponent={<Text style={s.cap}>{t('customer.saved.searchCount', { count: list.length, limit: SAVED_SEARCH_LIMIT })}</Text>}
        ListEmptyComponent={<EmptyState icon="bookmark" title={t('savedSearch.empty')} body={t('savedSearch.emptyHint')} />}
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${item.name}. ${summary(item)}`}
            onPress={() => {
              setBrowse(fromSavedParams(item.params));
              void markSearchSeen(item.id, qc);
              nav.navigate('Tabs', { screen: 'browse' });
            }}
            style={s.card}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={s.name} numberOfLines={1}>{item.name}</Text>
              {item.new_count > 0 ? <View style={s.badge}><Text style={s.badgeText}>{t('customer.saved.newCount', { count: item.new_count })}</Text></View> : null}
              <IconButton icon="trash-2" label={t('common.delete')} variant="ghost" size="medium" onPress={() => setTarget(item)} style={{ marginRight: -8 }} />
            </View>
            <Text style={s.line} numberOfLines={2}>{summary(item) || t('savedSearch.noFilters')}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Icon name="bell" size={14} color={colors.iconSecondary} />
              <Text style={s.line}>{item.notify ? t('customer.saved.notifyOn') : t('customer.saved.notifyOff')}</Text>
            </View>
            {item.last_notified_at ? <Text style={s.line}>{`${t('savedSearch.lastAlert')}: ${formatDate(item.last_notified_at, locale)}`}</Text> : null}
          </Pressable>
        )}
      />
      <Modal
        visible={!!target}
        onClose={() => setTarget(null)}
        title={t('savedSearch.deleteTitle')}
        body={t('savedSearch.deleteMessage')}
        icon="trash-2"
        cancelLabel={t('common.cancel')}
        confirmLabel={t('common.delete')}
        onConfirm={() => {
          const id = target?.id;
          setTarget(null);
          if (id) del.mutate(id, { onError: (e) => toast.show({ message: errorText(e), kind: 'error' }) });
        }}
      />
    </>
  );
}

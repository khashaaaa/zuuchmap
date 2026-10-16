import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Keyboard, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { ANALYTICS_EVENTS, PROVINCE_CODES, countDays, type ListingListItem } from '@zuuchmap/core';
import { themedStyles, useAppTheme } from '../../design/theme';
import { isOffline } from '../../lib/api';
import {
  addRecent, hasSearch, placeLabel, setBrowse, sheetFilterCount, useBrowseState, useRecent,
} from '../../lib/browse';
import { shortDate, shortRange } from '../../lib/dates';
import { useGeo } from '../../lib/geo';
import { useBell } from '../../lib/notifications';
import { useBrowseList, useCategories, useSaves, useStats } from '../../lib/queries';
import { track } from '../../lib/track';
import type { Nav } from '../../nav';
import { AppHeader } from '../../ui/AppHeader';
import { Banner } from '../../ui/Banner';
import { Button } from '../../ui/Button';
import { Chip } from '../../ui/Chip';
import { CountBadge } from '../../ui/CountBadge';
import { EmptyState } from '../../ui/EmptyState';
import { Icon } from '../../ui/Icon';
import { IconButton } from '../../ui/IconButton';
import { SearchBar } from '../../ui/SearchBar';
import { SegmentedControl } from '../../ui/SegmentedControl';
import { SkeletonListingRow } from '../../ui/SkeletonListingRow';
import { useLocale } from '../../ui/useLocale';
import { ListingRow } from './ListingRow';
import { MapScreen } from './MapScreen';
import { Appear } from '../../ui/Appear';
import { DatesSheet, FilterSheet, ProvinceSheet, SaveSearchSheet } from './Sheets';
import { useRequireAuth } from './SignInFlow';

const useStyles = themedStyles((t) => ({
  screen: { flex: 1, backgroundColor: t.colors.bgCanvas },
  head: { paddingHorizontal: t.spacing.screenPadding, gap: 12, paddingBottom: 8 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  chips: { gap: 8, paddingRight: 16, alignItems: 'center' },
  listContent: { paddingHorizontal: t.spacing.screenPadding, paddingBottom: 24, gap: 12 },
  countRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, paddingTop: 4 },
  count: { ...t.type.title, color: t.colors.textPrimary },
  countNote: { ...t.type.small, color: t.colors.textSecondary, flex: 1 },
  link: { ...t.type.labelStrong, color: t.colors.textLink },
  sos: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: t.radius.card, backgroundColor: t.colors.statusDangerTint },
  sosDisc: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: t.colors.bgSurface },
  sosTitle: { ...t.type.bodyBold, color: t.colors.textPrimary },
  sosBody: { ...t.type.small, color: t.colors.textSecondary },
  panel: { flex: 1, paddingHorizontal: t.spacing.screenPadding },
  secTitle: { ...t.type.overline, color: t.colors.textSecondary, paddingTop: 12, paddingBottom: 4 },
  sugRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12 },
  sugText: { ...t.type.bodyMedium, color: t.colors.textPrimary, flex: 1 },
  alt: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48, paddingHorizontal: 16, borderRadius: t.radius.lg, backgroundColor: t.colors.bgSurface, borderWidth: 1, borderColor: t.colors.borderSubtle },
  altText: { ...t.type.labelStrong, color: t.colors.textPrimary },
  altCount: { ...t.type.caption, color: t.colors.statusSuccess },
}));

export function Browse() {
  const s = useStyles();
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const locale = useLocale();
  const nav = useNavigation<Nav>();
  const bell = useBell();
  const requireAuth = useRequireAuth();
  const state = useBrowseState();
  const geo = useGeo();
  const categories = useCategories();
  const stats = useStats();
  const recents = useRecent();
  const { isSaved, toggle } = useSaves();
  const [draft, setDraft] = useState(state.q);
  const [searching, setSearching] = useState(false);
  const [sheet, setSheet] = useState<null | 'dates' | 'filter' | 'province' | 'save'>(null);
  const [headH, setHeadH] = useState(0);
  const inputRef = useRef<TextInput>(null);

  // The committed query changes elsewhere too (a saved search, the pickers): keep the field in step.
  useEffect(() => setDraft(state.q), [state.q]);
  useEffect(() => {
    const sub = Keyboard.addListener('keyboardDidHide', () => setSearching(false));
    return () => sub.remove();
  }, []);

  const coords = geo.status === 'granted' ? geo.coords : null;
  const list = useBrowseList(state, coords);
  const items = useMemo(() => list.data?.pages.flatMap((p) => p.items) ?? [], [list.data]);
  const first = list.data?.pages[0];
  const total = first?.total ?? 0;
  const dated = !!(state.date_from && state.date_to);
  const days = countDays(state.date_from, state.date_to);

  useEffect(() => {
    if (!state.q.trim()) return;
    track(ANALYTICS_EVENTS.SEARCH_PERFORMED, { q: state.q, category: state.category });
    if (dated) track(ANALYTICS_EVENTS.SEARCH_WITH_DATES, { q: state.q, days });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per committed query
  }, [state.q]);

  const category = categories.data?.find((c) => c.key === state.category);
  const open = useCallback((item: ListingListItem) => nav.navigate('ListingDetail', { id: item.id, item }), [nav]);

  const commit = (q: string) => {
    addRecent(q);
    setBrowse({ q: q.trim() });
    setDraft(q.trim());
    setSearching(false);
    Keyboard.dismiss();
  };

  const pickCategory = (key: string | undefined) =>
    setBrowse({ category: key, family: undefined, subcategory: undefined, attrs: {}, price_unit: undefined, price_min: undefined, price_max: undefined });

  const saveSearch = () => requireAuth('search', () => setSheet('save'));
  const addListing = () => requireAuth('become', () => nav.navigate('BecomeProvider'));

  // ---- Chips ----
  const datesLabel = dated ? shortRange(state.date_from!, state.date_to!, locale) : t('customer.landing.pickDates');
  const placeText = placeLabel(t, state.province, state.district) ?? t('customer.landing.allProvinces');
  const filterCount = sheetFilterCount(state);
  const subLabel = category?.subcategories.find((x) => x.value === state.subcategory)?.label ?? state.subcategory;

  const header = (
    <View style={s.head} onLayout={(e) => setHeadH(e.nativeEvent.layout.height)}>
      <View style={s.searchRow}>
        <View style={{ flex: 1 }}>
          <SearchBar
            value={draft}
            inputRef={inputRef}
            onChangeText={(v) => {
              setDraft(v);
              if (v === '' && state.q) setBrowse({ q: '' });
            }}
            onSubmit={commit}
            placeholder={t('customer.landing.whatDoYouNeed')}
            onFocus={() => setSearching(true)}
          />
        </View>
        <View style={{ width: 104 }}>
          <SegmentedControl
            value={state.view}
            onChange={(view) => setBrowse({ view })}
            segments={[
              { value: 'list', label: '', icon: 'list', a11yLabel: t('customer.browse.list') },
              { value: 'map', label: '', icon: 'map', a11yLabel: t('customer.browse.map') },
            ]}
          />
        </View>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips} keyboardShouldPersistTaps="handled">
        <Chip type="category" icon="calendar" label={datesLabel} selected={dated} onPress={() => setSheet('dates')} />
        <Chip type="category" icon="map-pin" label={placeText} selected={!!state.province} onPress={() => setSheet('province')} />
        {subLabel ? <Chip type="removable" label={subLabel} onPress={() => setBrowse({ subcategory: undefined })} /> : null}
        <View>
          <IconButton icon="sliders-horizontal" label={t('customer.filter.title')} size="medium" onPress={() => setSheet('filter')} />
          {filterCount > 0 ? (
            <View style={{ position: 'absolute', top: -4, right: -4 }} pointerEvents="none">
              <CountBadge count={filterCount} />
            </View>
          ) : null}
        </View>
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips} keyboardShouldPersistTaps="handled">
        <Chip label={t('customer.browse.all')} selected={!state.category && !state.family} onPress={() => pickCategory(undefined)} />
        {(categories.data ?? []).map((c) => (
          <Chip
            key={c.key}
            type="category"
            label={c.label}
            icon={c.icon}
            categoryKey={c.key}
            selected={state.category === c.key}
            onPress={() => pickCategory(state.category === c.key ? undefined : c.key)}
          />
        ))}
        <Chip type="category" icon="layout-grid" label={t('nav.categories')} onPress={() => nav.navigate('CategoryPicker')} />
      </ScrollView>
    </View>
  );

  // ---- A5: suggestions ----
  const needle = draft.trim().toLowerCase();
  const suggestions = useMemo(() => {
    const cats = categories.data ?? [];
    const countOf = (key: string) => stats.data?.categories.find((c) => c.key === key)?.count ?? 0;
    const catRows = needle ? cats.filter((c) => c.label.toLowerCase().includes(needle)).slice(0, 4) : [];
    const subRows = needle
      ? cats.flatMap((c) => c.subcategories.filter((x) => x.label.toLowerCase().includes(needle)).map((x) => ({ cat: c, sub: x }))).slice(0, 4)
      : [];
    const places = needle ? PROVINCE_CODES.filter((p) => (placeLabel(t, p) ?? '').toLowerCase().includes(needle)).slice(0, 3) : [];
    return { catRows, subRows, places, countOf };
  }, [needle, categories.data, stats.data, t]);

  // The typed words already have their own row above.
  const shownRecents = recents.filter((r) => r.trim().toLowerCase() !== needle);
  const panel = (
    <ScrollView style={s.panel} keyboardShouldPersistTaps="handled">
      {suggestions.catRows.length + suggestions.subRows.length > 0 ? <Text style={s.secTitle}>{t('customer.suggest.categories')}</Text> : null}
      {suggestions.catRows.map((c) => (
        <Pressable key={c.key} style={s.sugRow} accessibilityRole="button" onPress={() => { pickCategory(c.key); setBrowse({ q: '' }); setDraft(''); setSearching(false); Keyboard.dismiss(); }}>
          <Icon name={c.icon} categoryKey={c.key} size={20} color={colors.iconSecondary} />
          <Text style={s.sugText}>{t('customer.suggest.categoryCount', { category: c.label, count: suggestions.countOf(c.key) })}</Text>
        </Pressable>
      ))}
      {suggestions.subRows.map(({ cat, sub }) => (
        <Pressable key={`${cat.key}.${sub.value}`} style={s.sugRow} accessibilityRole="button" onPress={() => { setBrowse({ category: cat.key, family: undefined, subcategory: sub.value, attrs: {}, q: '' }); setDraft(''); setSearching(false); Keyboard.dismiss(); }}>
          <Icon name={cat.icon} categoryKey={cat.key} size={20} color={colors.iconSecondary} />
          <Text style={s.sugText}>{`${cat.label} · ${sub.label}`}</Text>
        </Pressable>
      ))}
      {suggestions.places.length > 0 ? <Text style={s.secTitle}>{t('customer.suggest.byPlace')}</Text> : null}
      {suggestions.places.map((p) => (
        <Pressable key={p} style={s.sugRow} accessibilityRole="button" onPress={() => { setBrowse({ province: p, district: undefined }); setSearching(false); Keyboard.dismiss(); }}>
          <Icon name="map-pin" size={20} color={colors.iconSecondary} />
          <Text style={s.sugText}>{placeLabel(t, p)}</Text>
        </Pressable>
      ))}
      {/* The typed words themselves, as on the web: the panel is never blank while typing. */}
      {needle ? (
        <Pressable style={s.sugRow} accessibilityRole="button" onPress={() => commit(draft.trim())}>
          <Icon name="search" size={20} color={colors.iconSecondary} />
          <Text style={s.sugText} numberOfLines={1}>{draft.trim()}</Text>
        </Pressable>
      ) : null}
      {shownRecents.length > 0 ? <Text style={s.secTitle}>{t('customer.suggest.recent')}</Text> : null}
      {shownRecents.map((r) => (
        <Pressable key={r} style={s.sugRow} accessibilityRole="button" onPress={() => commit(r)}>
          <Icon name="clock" size={20} color={colors.iconSecondary} />
          <Text style={s.sugText}>{r}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );

  // ---- The list and its states ----
  const noResults = !list.isPending && items.length === 0 && !list.isError;
  const undated = first?.undated_total;
  const listHeader = (
    <View style={{ gap: 12 }}>
      {dated ? (
        <Banner tone="info" title={t('customer.browse.datesBanner', { from: shortDate(state.date_from!, locale), to: shortDate(state.date_to!, locale) })} actionLabel={t('customer.browse.edit')} onAction={() => setSheet('dates')} />
      ) : null}
      {first?.relaxed && items.length > 0 ? (
        <Banner tone="warning" title={t('customer.browse.nearTitle')} body={t('customer.browse.nearBody', { count: total })} actionLabel={t('customer.browse.edit')} onAction={() => inputRef.current?.focus()} />
      ) : null}
      {list.isError && items.length > 0 ? <Banner tone="offline" title={t('offline.noConnection')} actionLabel={t('common.retry')} onAction={() => void list.refetch()} /> : null}
      {!hasSearch(state) && !list.isPending ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`${t('customer.landing.sosTitle')}. ${t('customer.landing.sosBody')}`} onPress={() => nav.navigate('Sos')} style={s.sos}>
          <View style={s.sosDisc}><Icon name="siren" size={24} color={colors.statusDanger} /></View>
          <View style={{ flex: 1 }}>
            <Text style={s.sosTitle}>{t('customer.landing.sosTitle')}</Text>
            <Text style={s.sosBody}>{t('customer.landing.sosBody')}</Text>
          </View>
          <Icon name="chevron-right" size={20} color={colors.iconSecondary} />
        </Pressable>
      ) : null}
      {items.length > 0 ? (
        <View style={s.countRow}>
          <Text style={s.count}>{t('customer.browse.countAll', { count: total })}</Text>
          <Text style={s.countNote} numberOfLines={1}>
            {first?.relaxed ? t('customer.browse.nearMatched') : dated ? t('customer.browse.countFree', { days }) : state.sort === 'relevance' || state.sort === 'newest' ? t('customer.browse.newestFirst') : t(`sort.${state.sort}`)}
          </Text>
          {hasSearch(state) ? (
            <Pressable accessibilityRole="button" onPress={saveSearch} hitSlop={12}>
              <Text style={s.link}>{t('savedSearch.save')}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );

  const empty = list.isPending ? (
    <View style={{ gap: 12 }}>{[0, 1, 2, 3, 4].map((i) => <SkeletonListingRow key={i} />)}</View>
  ) : list.isError ? (
    <EmptyState icon={isOffline(list.error) ? 'wifi-off' : 'circle-alert'} title={t('customer.browse.loadFailed')} body={isOffline(list.error) ? t('offline.noConnection') : t('customer.browse.loadFailedBody')} actionLabel={t('common.retry')} onAction={() => void list.refetch()} />
  ) : noResults && dated && undated !== undefined ? (
    <View style={{ gap: 12 }}>
      <EmptyState icon="calendar" title={t('customer.browse.noFreeTitle', { from: shortDate(state.date_from!, locale), to: shortDate(state.date_to!, locale) })} body={t('customer.browse.noFreeBody', { count: undated })} />
      {(first?.alternatives ?? []).map((a) => (
        <Pressable key={a.date_from} accessibilityRole="button" style={s.alt} onPress={() => setBrowse({ date_from: a.date_from, date_to: a.date_to })}>
          <Text style={s.altText}>{shortRange(a.date_from, a.date_to, locale)}</Text>
          <Text style={s.altCount}>{t('customer.browse.altFree', { count: a.count })}</Text>
        </Pressable>
      ))}
      <Button label={t('customer.browse.withoutDates')} variant="outline" fullWidth onPress={() => setBrowse({ date_from: undefined, date_to: undefined })} />
    </View>
  ) : noResults ? (
    <View style={{ gap: 8 }}>
      <EmptyState title={t('filter.searchNoResults')} body={t('customer.browse.noResultsBody')} actionLabel={t('savedSearch.save')} onAction={saveSearch} />
      {state.province ? <Button label={t('customer.browse.searchAllProvinces')} variant="outline" size="medium" onPress={() => setBrowse({ province: undefined, district: undefined })} style={{ alignSelf: 'center' }} /> : null}
    </View>
  ) : null;

  return (
    <View style={s.screen}>
      <AppHeader variant="brand" extra={bell} action={{ icon: 'plus', label: t('customer.landing.addListing'), onPress: addListing }} />
      {header}
      {searching ? (
        panel
      ) : state.view === 'map' ? (
        <Appear key="map" rise={false} style={{ flex: 1 }}>
          <MapScreen state={state} items={items} onOpen={open} isSaved={isSaved} onToggleSave={(i) => void toggle(i)} top={headH + 120} />
        </Appear>
      ) : (
        <Appear key="list" rise={false} style={{ flex: 1 }}>
          <FlatList
            data={items}
            keyExtractor={(i) => String(i.id)}
            contentContainerStyle={s.listContent}
            keyboardShouldPersistTaps="handled"
            ListHeaderComponent={listHeader}
            ListEmptyComponent={empty}
            ListFooterComponent={list.isFetchingNextPage ? <SkeletonListingRow /> : null}
            onEndReached={() => {
              if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
            }}
            onEndReachedThreshold={0.6}
            refreshing={list.isRefetching && !list.isFetchingNextPage}
            onRefresh={() => void list.refetch()}
            ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
            renderItem={({ item, index }) => (
              <Appear index={index}>
                <ListingRow item={item} dates={{ from: state.date_from, to: state.date_to }} saved={isSaved(item.id)} onToggleSave={(i) => void toggle(i)} onOpen={open} showDistance={!!coords} />
            </Appear>
          )}
        />
        </Appear>
      )}
      <DatesSheet visible={sheet === 'dates'} onClose={() => setSheet(null)} state={state} />
      <FilterSheet visible={sheet === 'filter'} onClose={() => setSheet(null)} state={state} category={category} />
      <ProvinceSheet visible={sheet === 'province'} onClose={() => setSheet(null)} province={state.province} district={state.district} onPick={(province, district) => setBrowse({ province, district })} />
      <SaveSearchSheet visible={sheet === 'save'} onClose={() => setSheet(null)} state={state} />
    </View>
  );
}

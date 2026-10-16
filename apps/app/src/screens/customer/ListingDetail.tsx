import { useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, FlatList, Image, Linking, Platform, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { categoryColor } from '@zuuchmap/tokens';
import {
  ANALYTICS_EVENTS, formatDate, formatPriceParts, type CategoryView, type Listing, type ListingListItem,
} from '@zuuchmap/core';
import { themedStyles, useAppTheme } from '../../design/theme';
import { api, errorText, isMissing } from '../../lib/api';
import { getBrowse, placeLabel, setBrowse } from '../../lib/browse';
import { shortDate } from '../../lib/dates';
import { replyText, serviceAreaText, useOpenChat } from '../../lib/deal';
import { useAvailability, useCategories, useListing, useSaves, useSimilar } from '../../lib/queries';
import { recordCall, track } from '../../lib/track';
import type { Nav, RootStackParamList } from '../../nav';
import { Banner } from '../../ui/Banner';
import { Button } from '../../ui/Button';
import { EmptyState } from '../../ui/EmptyState';
import { Icon } from '../../ui/Icon';
import { IconButton } from '../../ui/IconButton';
import { LISTING_ACTION_BAR_HEIGHT, ListingActionBar } from '../../ui/ListingActionBar';
import { SellerCard } from '../../ui/SellerCard';
import { SkeletonListingRow } from '../../ui/SkeletonListingRow';
import { useToast } from '../../ui/Toast';
import { useLocale } from '../../ui/useLocale';
import { AvailabilitySheet, BookingSheet, ShareSheet, useIsBooked } from './DetailSheets';
import { ListingRow } from './ListingRow';
import { useRequireAuth } from './SignInFlow';

const useStyles = themedStyles((t) => ({
  screen: { flex: 1, backgroundColor: t.colors.bgCanvas },
  body: { paddingHorizontal: t.spacing.screenPadding, paddingTop: 16, gap: 16 },
  title: { ...t.type.h1, color: t.colors.textPrimary },
  barTitle: { ...t.type.h3, color: t.colors.textPrimary, flex: 1 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  metaText: { ...t.type.caption, color: t.colors.textSecondary },
  price: { ...t.type.display, color: t.colors.textPrimary },
  priceUnit: { ...t.type.body, color: t.colors.textSecondary },
  avail: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: t.radius.lg },
  availText: { ...t.type.labelStrong, color: t.colors.textPrimary, flex: 1 },
  link: { ...t.type.labelStrong, color: t.colors.textLink },
  h: { ...t.type.h3, color: t.colors.textPrimary },
  specs: { flexDirection: 'row', flexWrap: 'wrap', padding: 16, rowGap: 14, borderRadius: t.radius.card, backgroundColor: t.colors.bgSurface, borderWidth: 1, borderColor: t.colors.borderSubtle },
  spec: { width: '50%', gap: 2, paddingRight: 8 },
  specK: { ...t.type.small, color: t.colors.textSecondary },
  specV: { ...t.type.bodyBold, color: t.colors.textPrimary },
  text: { ...t.type.body, color: t.colors.textPrimary },
  where: { gap: 10, padding: 16, borderRadius: t.radius.card, backgroundColor: t.colors.bgSurface, borderWidth: 1, borderColor: t.colors.borderSubtle },
  note: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  noteText: { ...t.type.small, color: t.colors.textSecondary, flex: 1 },
}));

const HERO_H = 280;

/** Consecutive `YYYY-MM-DD` days starting at the first one, as [from, to]. */
function firstRange(days: string[]): [string, string] | null {
  if (days.length === 0) return null;
  const sorted = [...days].sort();
  const next = (d: string) => {
    const x = new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10) + 1));
    return x.toISOString().slice(0, 10);
  };
  let end = sorted[0];
  for (const d of sorted.slice(1)) {
    if (d === next(end)) end = d;
    else break;
  }
  return [sorted[0], end];
}

function directionsUrl(l: Listing): string | null {
  if (l.latitude === null || l.longitude === null) return null;
  const ll = `${l.latitude},${l.longitude}`;
  return Platform.OS === 'android' ? `geo:${ll}?q=${ll}(${encodeURIComponent(l.title ?? '')})` : `https://maps.apple.com/?ll=${ll}`;
}

function specValue(t: (k: string, o?: Record<string, unknown>) => string, f: CategoryView['fields'][number], v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'boolean') return v ? t('customer.detail.yes') : t('customer.detail.no');
  if (f.type === 'select') {
    const code = String(v);
    const camel = code.toLowerCase().replace(/_([a-z0-9])/g, (_m, c: string) => c.toUpperCase());
    return t(`attrs.${code === 'PROVINCE' ? 'coverageProvince' : camel}`, { defaultValue: code });
  }
  return f.unit ? `${String(v)} ${f.unit}` : String(v);
}

export function ListingDetail() {
  const s = useStyles();
  const { colors, scheme, type } = useAppTheme();
  const { t } = useTranslation();
  const locale = useLocale();
  const nav = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  // Past the hero the floating buttons get a solid bar (title, plain buttons) so nothing runs under the status bar.
  const scrollY = useRef(new Animated.Value(0)).current;
  const [solid, setSolid] = useState(false);
  const toast = useToast();
  const requireAuth = useRequireAuth();
  const openChat = useOpenChat();
  const { params } = useRoute<RouteProp<RootStackParamList, 'ListingDetail'>>();
  const query = useListing(params.id);
  const categories = useCategories();
  const { isSaved, toggle } = useSaves();
  const [sheet, setSheet] = useState<null | 'share' | 'book' | 'calendar'>(null);
  const [heroIdx, setHeroIdx] = useState(0);
  const { width } = Dimensions.get('window');

  const listing: ListingListItem | Listing | undefined = query.data ?? params.item;
  const full = query.data;
  const cat = categories.data?.find((c) => c.key === listing?.category);
  const rentable = !!cat?.rentable;
  const similar = useSimilar(params.id, !!full);
  const avail = useAvailability(params.id, rentable && sheet !== null);
  const isBooked = useIsBooked(avail.data?.busy, listing?.busy_dates);

  // One view per open; the engine dedupes per visitor.
  const counted = useRef(false);
  useEffect(() => {
    if (counted.current) return;
    counted.current = true;
    track(ANALYTICS_EVENTS.LISTING_OPENED, { post_id: params.id });
    api('/posts/' + params.id + '/views', { method: 'PUT', visitor: true }).catch(() => undefined);
  }, [params.id]);

  const missing = query.isError && isMissing(query.error);
  if (missing) {
    return (
      <View style={s.screen}>
        <View style={{ paddingTop: insets.top, paddingLeft: 4 }}>
          <IconButton icon="arrow-left" label={t('common.back')} variant="ghost" onPress={() => nav.goBack()} />
        </View>
        <EmptyState
          icon="circle-alert"
          title={t('customer.detail.unavailableTitle')}
          body={t('customer.detail.unavailableBody')}
          actionLabel={params.item && cat ? t('customer.detail.seeCategory', { category: cat.label }) : t('customer.detail.backToSearch')}
          actionVariant="secondary"
          onAction={() => {
            if (params.item && cat) setBrowse({ category: cat.key, family: undefined, subcategory: undefined, q: '' });
            nav.navigate('Tabs', { screen: 'browse' });
          }}
        />
        {params.item && cat ? <Button label={t('customer.detail.backToSearch')} variant="outline" size="medium" onPress={() => nav.navigate('Tabs', { screen: 'browse' })} style={{ alignSelf: 'center' }} /> : null}
      </View>
    );
  }

  if (!listing) {
    return (
      <View style={s.screen}>
        <View style={{ paddingTop: insets.top, paddingLeft: 4 }}>
          <IconButton icon="arrow-left" label={t('common.back')} variant="ghost" onPress={() => nav.goBack()} />
        </View>
        {query.isError ? (
          <EmptyState icon="wifi-off" title={t('customer.browse.loadFailed')} body={errorText(query.error)} actionLabel={t('common.retry')} onAction={() => void query.refetch()} />
        ) : (
          <View style={{ padding: 16, gap: 12 }}><SkeletonListingRow /><SkeletonListingRow /></View>
        )}
      </View>
    );
  }

  const images = listing.images ?? [];
  const catFill = categoryColor(listing.category, scheme);
  const parts = listing.price_amount !== null ? formatPriceParts(listing.price_amount, listing.price_unit, locale) : null;
  const operatorField = cat?.fields.find((f) => f.key === 'with_operator');
  const withOperator = operatorField && listing.attributes?.with_operator === true;
  const subLabel = cat?.subcategories.find((x) => x.value === listing.subcategory)?.label;
  const place = placeLabel(t, listing.province, listing.district);
  const mode: 'book' | 'call' | 'sos' = cat?.primary_action === 'BOOK' ? 'book' : cat?.primary_action === 'CALL_NOW' ? 'sos' : 'call';
  const saved = isSaved(listing.id);

  const b = getBrowse();
  const searchDates = b.date_from && b.date_to ? { from: b.date_from, to: b.date_to } : null;
  const busyRange = firstRange(listing.busy_dates ?? []);

  const call = () => {
    if (!listing.contact_phone) {
      toast.show({ message: t('posts.noPhone'), kind: 'error' });
      return;
    }
    track(ANALYTICS_EVENTS.CONTACT_CALL, { post_id: listing.id });
    recordCall(listing.id);
    void Linking.openURL(`tel:${listing.contact_phone}`).catch(() => toast.show({ message: t('errors.unknown'), kind: 'error' }));
  };
  const chat = () =>
    requireAuth('message', () => {
      track(ANALYTICS_EVENTS.CONTACT_MESSAGE, { post_id: listing.id });
      void openChat(listing.id, chat);
    });
  const pending = !!full?.my_pending_booking_id;
  const book = () => (pending ? nav.navigate('MyBookings') : requireAuth('book', () => setSheet('book')));

  const specs = (cat?.fields ?? [])
    .map((f) => ({ f, v: specValue(t as never, f, listing.attributes?.[f.key]) }))
    .filter((x): x is { f: CategoryView['fields'][number]; v: string } => x.v !== null)
    .slice(0, 8);
  const url = directionsUrl(full ?? (listing as Listing));
  const sellerName = listing.user?.company?.name ?? [listing.user?.parent_name, listing.user?.given_name].filter(Boolean).join(' ');

  return (
    <View style={s.screen}>
      <Animated.ScrollView
        contentContainerStyle={{ paddingBottom: LISTING_ACTION_BAR_HEIGHT + insets.bottom + 24 }}
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
          useNativeDriver: true,
          listener: (e: { nativeEvent: { contentOffset: { y: number } } }) => {
            const next = e.nativeEvent.contentOffset.y > HERO_H - insets.top - 56;
            if (next !== solid) setSolid(next);
          },
        })}
      >
        {/* Hero: photos paged horizontally; no photo shows the category tile. */}
        <View style={{ height: HERO_H, backgroundColor: catFill.fill + '29' }}>
          {images.length > 0 ? (
            <FlatList
              data={images}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              keyExtractor={(u, i) => `${i}${u}`}
              onMomentumScrollEnd={(e) => setHeroIdx(Math.round(e.nativeEvent.contentOffset.x / width))}
              renderItem={({ item, index }) => (
                <Pressable accessibilityRole="imagebutton" accessibilityLabel={listing.title ?? ''} onPress={() => nav.navigate('Gallery', { images, index, title: listing.title ?? '' })}>
                  <Image source={{ uri: item }} style={{ width, height: HERO_H }} resizeMode="cover" accessibilityIgnoresInvertColors />
                </Pressable>
              )}
            />
          ) : (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', opacity: 0.7 }}>
              <Icon name={cat?.icon ?? 'package'} categoryKey={listing.category} size={96} color={catFill.fill} />
            </View>
          )}
          {images.length > 1 ? (
            <View style={{ position: 'absolute', right: 12, bottom: 12, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 9999, backgroundColor: colors.bgMediaScrim }} accessibilityLabel={t('customer.detail.counter', { index: heroIdx + 1, total: images.length })}>
              <Text style={[s.metaText, { color: colors.textOnMedia }]}>{t('customer.detail.counter', { index: heroIdx + 1, total: images.length })}</Text>
            </View>
          ) : null}
        </View>

        <View style={s.body}>
          {cat ? <Text style={{ ...type.overline, color: catFill.text }}>{[cat.label, subLabel].filter(Boolean).join(' · ')}</Text> : null}
          <Text style={s.title} accessibilityRole="header">{listing.title}</Text>
          <View style={s.meta}>
            <Icon name="map-pin" size={16} color={colors.iconSecondary} />
            <Text style={s.metaText}>{place ?? t('common.locationUnknown')}</Text>
            <Icon name="eye" size={16} color={colors.iconSecondary} />
            <Text style={s.metaText} accessibilityLabel={`${t('analytics.views')}: ${listing.views}`}>{String(listing.views)}</Text>
          </View>
          {parts ? (
            <Text style={s.price}>
              {parts.amount}
              {parts.unit ? <Text style={s.priceUnit}>{` / ${parts.unit}`}</Text> : null}
              {withOperator ? <Text style={s.priceUnit}>{`, ${operatorField.label.toLowerCase()}`}</Text> : null}
            </Text>
          ) : null}

          {rentable ? (
            <View style={[s.avail, { backgroundColor: colors.statusSuccessTint }]}>
              <Icon name="calendar" size={20} color={colors.statusSuccess} />
              <Text style={s.availText}>
                {searchDates
                  ? t('customer.detail.freeOn', { from: shortDate(searchDates.from, locale), to: shortDate(searchDates.to, locale) })
                  : busyRange
                    ? t('customer.detail.bookedOn', { from: shortDate(busyRange[0], locale), to: shortDate(busyRange[1], locale) })
                    : t('posts.availabilityFreeLabel')}
              </Text>
              <Pressable accessibilityRole="button" hitSlop={12} onPress={() => setSheet('calendar')}>
                <Text style={s.link}>{t('customer.detail.calendar')}</Text>
              </Pressable>
            </View>
          ) : null}

          <SellerCard
            name={sellerName || t('common.user')}
            logoUri={listing.user?.company?.logo ?? listing.user?.profile_picture}
            meta={[listing.user?.date_created ? t('customer.detail.memberSince', { date: formatDate(listing.user.date_created, locale).slice(0, 7) }) : null, serviceAreaText(t, listing.user)].filter(Boolean).join('\n') || undefined}
            rating={listing.user?.rating_average != null && (listing.user.rating_count ?? 0) > 0 ? { value: listing.user.rating_average, count: listing.user.rating_count ?? 0 } : null}
            replyText={replyText(t, listing.user?.reply_minutes)}
            onPress={listing.user?.id ? () => nav.navigate('Seller', { id: listing.user!.id }) : undefined}
          />

          {specs.length > 0 ? (
            <View style={{ gap: 10 }}>
              <Text style={s.h} accessibilityRole="header">{t('customer.detail.specs')}</Text>
              <View style={s.specs}>
                {specs.map(({ f, v }) => (
                  <View key={f.key} style={s.spec}>
                    <Text style={s.specK}>{f.label}</Text>
                    <Text style={s.specV}>{v}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {full?.details ? (
            <View style={{ gap: 8 }}>
              <Text style={s.h} accessibilityRole="header">{t('posts.sectionDescription')}</Text>
              <Text style={s.text}>{full.details}</Text>
            </View>
          ) : null}

          <View style={{ gap: 10 }}>
            <Text style={s.h} accessibilityRole="header">{t('posts.sectionLocation')}</Text>
            <View style={s.where}>
              <View style={s.meta}>
                <Icon name="map-pin" size={18} color={colors.iconAccent} />
                <Text style={[s.text, { flex: 1 }]}>{[place, listing.address].filter(Boolean).join(', ') || t('common.locationUnknown')}</Text>
              </View>
              {url ? (
                <Button label={t('customer.detail.directions')} icon="navigation" variant="outline" size="medium" onPress={() => void Linking.openURL(url).catch(() => undefined)} />
              ) : (
                <Text style={s.metaText}>{t('posts.noLocation')}</Text>
              )}
            </View>
          </View>

          {query.isError && full === undefined ? <Banner tone="offline" title={t('offline.noConnection')} actionLabel={t('common.retry')} onAction={() => void query.refetch()} /> : null}

          {similar.data && similar.data.length > 0 ? (
            <View style={{ gap: 10 }}>
              <Text style={s.h} accessibilityRole="header">{t('posts.similarTitle')}</Text>
              {similar.data.map((i) => (
                <ListingRow key={i.id} item={i} saved={isSaved(i.id)} onToggleSave={(x) => void toggle(x)} onOpen={(x) => nav.push('ListingDetail', { id: x.id, item: x })} />
              ))}
            </View>
          ) : null}

          {mode === 'book' ? (
            <View style={s.note}>
              <Icon name="lock" size={16} color={colors.iconSecondary} />
              <Text style={s.noteText}>{t('posts.phoneAfterBooking')}</Text>
            </View>
          ) : null}
        </View>
      </Animated.ScrollView>

      {/* Header buttons float over the hero; past it a solid bar fades in under them. */}
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: insets.top + 56, backgroundColor: colors.bgCanvas,
          borderBottomWidth: 1, borderBottomColor: colors.borderSubtle,
          opacity: scrollY.interpolate({ inputRange: [HERO_H - insets.top - 96, HERO_H - insets.top - 56], outputRange: [0, 1], extrapolate: 'clamp' }),
        }}
      />
      <View style={{ position: 'absolute', top: insets.top + 4, left: 8, right: 8, flexDirection: 'row', alignItems: 'center', gap: 8 }} pointerEvents="box-none">
        <IconButton icon="arrow-left" label={t('common.back')} variant={solid ? 'ghost' : 'media'} onPress={() => nav.goBack()} />
        <Text style={[s.barTitle, { opacity: solid ? 1 : 0 }]} numberOfLines={1} accessibilityElementsHidden={!solid}>{listing.title ?? ''}</Text>
        <IconButton icon="share-2" label={t('customer.share.title')} variant={solid ? 'ghost' : 'media'} onPress={() => setSheet('share')} />
        <IconButton icon="heart" label={t('common.save')} variant={solid ? 'ghost' : 'media'} filled={saved} onPress={() => void toggle(listing as ListingListItem)} />
      </View>

      <ListingActionBar
        mode={mode}
        price={listing.price_amount !== null ? { amount: listing.price_amount, unit: listing.price_unit } : null}
        onBook={book}
        onCall={call}
        onMessage={chat}
        pending={pending}
      />

      <ShareSheet visible={sheet === 'share'} onClose={() => setSheet(null)} listing={{ id: listing.id, title: listing.title }} />
      <AvailabilitySheet visible={sheet === 'calendar'} onClose={() => setSheet(null)} isBooked={isBooked} />
      {full ? <BookingSheet visible={sheet === 'book'} onClose={() => setSheet(null)} listing={full} initial={searchDates ?? undefined} onNeedsAuth={book} /> : null}
    </View>
  );
}

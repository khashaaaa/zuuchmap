import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { AvailabilityResponse, BlockDaysResponse } from '@zuuchmap/core';
import { themedStyles, useAppTheme } from '../../design/theme';
import { api, errorText } from '../../lib/api';
import { shortRange, toYmd } from '../../lib/dates';
import { invalidateProvider, listingState, useMyListings } from '../../lib/provider';
import { useCategories } from '../../lib/queries';
import type { Nav, RootStackParamList } from '../../nav';
import { AppHeader } from '../../ui/AppHeader';
import { Button } from '../../ui/Button';
import { Chip } from '../../ui/Chip';
import { DateRangeCalendar, type DateRange } from '../../ui/DateRangeCalendar';
import { EmptyState } from '../../ui/EmptyState';
import { useToast } from '../../ui/Toast';
import { useLocale } from '../../ui/useLocale';

const useStyles = themedStyles((t) => ({
  screen: { flex: 1, backgroundColor: t.colors.bgCanvas },
  content: { paddingHorizontal: t.spacing.screenPadding, paddingBottom: 32, gap: 16 },
  h: { ...t.type.h3, color: t.colors.textPrimary },
  body: { ...t.type.caption, color: t.colors.textSecondary },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  li: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  liText: { ...t.type.small, color: t.colors.textSecondary },
  range: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12 },
  rangeText: { ...t.type.bodyMedium, color: t.colors.textPrimary, flex: 1 },
}));

const inRanges = (d: Date, ranges: Array<{ start_date: string; end_date: string }>) => {
  const y = toYmd(d);
  return ranges.some((r) => r.start_date.slice(0, 10) <= y && y <= r.end_date.slice(0, 10));
};

/** E4: close days across one or several listings; tap a closed range to open it again (one listing). */
export function BlockDays() {
  const s = useStyles();
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const locale = useLocale();
  const nav = useNavigation<Nav>();
  const toast = useToast();
  const qc = useQueryClient();
  const { params } = useRoute<RouteProp<RootStackParamList, 'BlockDays'>>();
  const list = useMyListings();
  const cats = useCategories();
  const rentable = useMemo(
    () => (list.data ?? []).filter((p) => ['live', 'editing', 'refused', 'pending'].includes(listingState(p)) && cats.data?.find((c) => c.key === p.category)?.has_availability_dates),
    [list.data, cats.data],
  );
  const [picked, setPicked] = useState<number[] | null>(params?.postId ? [params.postId] : null);
  const [range, setRange] = useState<DateRange>({ start: null, end: null });
  const [busy, setBusy] = useState(false);
  const ids = picked ?? rentable.map((p) => p.id);
  const allOn = ids.length === rentable.length && rentable.length > 0;

  const avail = useQueries({
    queries: ids.map((id) => ({ queryKey: ['availability', id], queryFn: () => api<AvailabilityResponse>(`/posts/${id}/availability`) })),
  });
  const busyRanges = avail.flatMap((q) => q.data?.busy ?? []);
  const booked = busyRanges.filter((b) => b.kind === 'BOOKED');
  const blocked = busyRanges.filter((b) => b.kind === 'BLOCKED');
  const single = ids.length === 1;

  const toggle = (id: number) => setPicked((cur) => {
    const base = cur ?? rentable.map((p) => p.id);
    const next = base.includes(id) ? base.filter((x) => x !== id) : [...base, id];
    return next.length === 0 ? base : next;
  });

  const end = range.end ?? range.start;
  const days = range.start && end ? Math.round((end.getTime() - range.start.getTime()) / 86_400_000) + 1 : 0;

  const save = async () => {
    if (!range.start || !end) return;
    setBusy(true);
    try {
      await api<BlockDaysResponse>('/posts/availability/block', { method: 'POST', body: { post_ids: ids, start_date: toYmd(range.start), end_date: toYmd(end) } });
      toast.show({ message: t('prov.block.saved'), kind: 'success' });
      setRange({ start: null, end: null });
      invalidateProvider(qc);
    } catch (e) {
      toast.show({ message: errorText(e), kind: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const unblock = async (id: number) => {
    try {
      await api(`/posts/availability/block/${id}`, { method: 'DELETE' });
      toast.show({ message: t('prov.block.unblocked'), kind: 'success' });
      invalidateProvider(qc);
    } catch (e) {
      toast.show({ message: errorText(e), kind: 'error' });
    }
  };

  const dot = (fill: string, label: string, dashed?: boolean) => (
    <View style={s.li}>
      <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: fill, borderWidth: 1, borderColor: colors.borderStrong, borderStyle: dashed ? 'dashed' : 'solid' }} />
      <Text style={s.liText}>{label}</Text>
    </View>
  );

  return (
    <View style={s.screen}>
      <AppHeader variant="pushed" title={t('prov.block.title')} onBack={() => nav.goBack()} />
      {list.isLoading ? null : rentable.length === 0 ? (
        <EmptyState icon="calendar" title={t('prov.block.title')} body={t('prov.block.hint')} actionLabel={t('prov.listings.add')} onAction={() => nav.navigate('Wizard')} />
      ) : (
        <>
          <ScrollView contentContainerStyle={s.content}>
            <View style={{ gap: 8 }}>
              <Text style={s.h} accessibilityRole="header">{t('prov.block.which')}</Text>
              <View style={s.wrap}>
                <Chip label={t('prov.block.allListings', { count: rentable.length })} selected={allOn} onPress={() => setPicked(null)} />
                {rentable.map((p) => <Chip key={p.id} label={p.title ?? String(p.id)} selected={!allOn && ids.includes(p.id)} onPress={() => (allOn ? setPicked([p.id]) : toggle(p.id))} />)}
              </View>
              <Text style={s.body}>{t('prov.block.hint')}</Text>
            </View>
            <DateRangeCalendar
              value={range}
              onChange={setRange}
              isBooked={(d) => inRanges(d, booked)}
              isBlocked={(d) => inRanges(d, blocked)}
              hideLegend
            />
            <View style={s.legend}>
              {dot(colors.bgSurface, t('prov.block.free'))}
              {dot(colors.bgSurfaceSunken, t('prov.block.blocked'), true)}
              {dot(colors.statusInfoTint, t('prov.block.booked'))}
            </View>
            {single && blocked.length > 0 ? (
              <View style={{ gap: 4 }}>
                <Text style={s.h}>{t('prov.block.blocked')}</Text>
                {blocked.map((b) => (
                  <Pressable key={b.id} accessibilityRole="button" style={s.range} onPress={() => void unblock(b.id)}>
                    <Text style={s.rangeText}>{shortRange(b.start_date.slice(0, 10), b.end_date.slice(0, 10), locale)}</Text>
                    <Text style={{ color: colors.textLink }}>{t('prov.block.unblock')}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
            {range.start ? <Text style={s.body}>{t('prov.block.summary', { range: shortRange(toYmd(range.start), toYmd(end ?? range.start), locale), listings: ids.length, days })}</Text> : null}
          </ScrollView>
          <View style={{ padding: 16 }}>
            <Button label={t('prov.block.save')} fullWidth loading={busy} disabled={!range.start} onPress={() => void save()} />
          </View>
        </>
      )}
    </View>
  );
}

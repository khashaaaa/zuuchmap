import { useEffect, useMemo, useState } from 'react';
import { FlatList, Image, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { formatPrice, type AdminListing, type ListingRevision } from '@zuuchmap/core';
import { themedStyles, useAppTheme } from '../../design/theme';
import { errorText } from '../../lib/api';
import { queuedAt, useAdminListings, useApprove, useReject, useReports, waited } from '../../lib/admin';
import { placeLabel } from '../../lib/browse';
import { optionLabel } from '../../lib/provider';
import { useCategories } from '../../lib/queries';
import type { Nav, RootStackParamList } from '../../nav';
import { AppHeader } from '../../ui/AppHeader';
import { Banner } from '../../ui/Banner';
import { BottomSheet } from '../../ui/BottomSheet';
import { Button } from '../../ui/Button';
import { Chip } from '../../ui/Chip';
import { EmptyState } from '../../ui/EmptyState';
import { Icon } from '../../ui/Icon';
import { SkeletonListingRow } from '../../ui/SkeletonListingRow';
import { TextField } from '../../ui/TextField';
import { useToast, useToastClearance } from '../../ui/Toast';
import { useLocale } from '../../ui/useLocale';

export const useAdminStyles = themedStyles((t) => ({
  screen: { flex: 1, backgroundColor: t.colors.bgCanvas },
  content: { padding: t.spacing.screenPadding, gap: 12, paddingBottom: 40 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: t.radius.card, backgroundColor: t.colors.bgSurface, borderWidth: 1, borderColor: t.colors.borderSubtle },
  panel: { gap: 8, padding: 16, borderRadius: t.radius.card, backgroundColor: t.colors.bgSurface },
  thumb: { width: 56, height: 56, borderRadius: t.radius.md, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: t.colors.bgSurfaceSunken },
  title: { ...t.type.labelStrong, color: t.colors.textPrimary },
  h: { ...t.type.h2, color: t.colors.textPrimary },
  h3: { ...t.type.labelStrong, color: t.colors.textPrimary },
  cap: { ...t.type.small, color: t.colors.textSecondary },
  body: { ...t.type.body, color: t.colors.textSecondary },
  badge: { ...t.type.badge, paddingHorizontal: 6, paddingVertical: 2, borderRadius: t.radius.sm, overflow: 'hidden', alignSelf: 'flex-start' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chips: { flexDirection: 'row', gap: 8 },
  before: { flexDirection: 'row', gap: 8, padding: 10, borderRadius: t.radius.md, backgroundColor: t.colors.statusDangerTint },
  after: { flexDirection: 'row', gap: 8, padding: 10, borderRadius: t.radius.md, backgroundColor: t.colors.statusSuccessTint },
  footer: { flexDirection: 'row', gap: 12, padding: t.spacing.screenPadding, borderTopWidth: 1, borderTopColor: t.colors.borderSubtle, backgroundColor: t.colors.bgSurfaceRaised },
}));

const ownerName = (p: AdminListing): string => p.user?.company?.name ?? ([p.user?.parent_name, p.user?.given_name].filter(Boolean).join(' ') || p.user?.phone_number || '');
const revisionOf = (p: AdminListing) => p.pending_revision as ListingRevision | null | undefined;

export function Thumb({ p }: { p: AdminListing }) {
  const s = useAdminStyles();
  const { colors } = useAppTheme();
  const photo = revisionOf(p)?.images[0] ?? p.images?.[0];
  return (
    <View style={s.thumb}>
      {photo ? <Image source={{ uri: photo }} style={{ width: 56, height: 56 }} /> : <Icon name="package" categoryKey={p.category} size={24} color={colors.iconSecondary} />}
    </View>
  );
}

/** Figma J1: new listings and edits, oldest first; the queue's counts by kind. */
export function Queue() {
  const s = useAdminStyles();
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const nav = useNavigation<Nav>();
  const q = useAdminListings('PENDING', '', 100);
  const reports = useReports('OPEN');
  const [kind, setKind] = useState<'all' | 'new' | 'edit'>('all');
  const items = useMemo(() => q.data?.items ?? [], [q.data]);
  const edits = items.filter((p) => !!p.pending_revision).length;
  const shown = items.filter((p) => (kind === 'all' ? true : kind === 'edit' ? !!p.pending_revision : !p.pending_revision));

  return (
    <View style={s.screen}>
      <AppHeader variant="root" title={t('admin.queue.title')} />
      <View style={{ paddingHorizontal: 16, gap: 10, paddingBottom: 8 }}>
        <Text style={s.cap}>{t('admin.queue.oldestFirst')}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
          <Chip label={`${t('admin.queue.tabNew')} ${String(items.length - edits)}`} selected={kind === 'new'} onPress={() => setKind(kind === 'new' ? 'all' : 'new')} />
          <Chip label={`${t('admin.queue.tabEdit')} ${String(edits)}`} selected={kind === 'edit'} onPress={() => setKind(kind === 'edit' ? 'all' : 'edit')} />
          <Chip label={`${t('report.queue')} ${String(reports.data?.total ?? 0)}`} onPress={() => nav.navigate('Tabs', { screen: 'reports' })} />
        </ScrollView>
      </View>
      {q.isLoading ? (
        <View style={{ padding: 16, gap: 12 }}><SkeletonListingRow /><SkeletonListingRow /></View>
      ) : (
        <FlatList
          data={shown}
          keyExtractor={(p) => String(p.id)}
          contentContainerStyle={s.content}
          refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />}
          ListEmptyComponent={<EmptyState icon="shield-check" title={t('admin.noPending')} body={t('admin.noPendingDesc')} />}
          renderItem={({ item: p }) => {
            const edit = !!p.pending_revision;
            const w = waited(queuedAt(p));
            return (
              <Pressable accessibilityRole="button" style={s.card} onPress={() => nav.navigate('AdminReview', { id: p.id })}>
                <Thumb p={p} />
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={[s.badge, edit ? { backgroundColor: colors.statusWarningTint, color: colors.statusWarning } : { backgroundColor: colors.statusInfoTint, color: colors.statusInfo }]}>
                    {t(edit ? 'admin.queue.badgeEdit' : 'admin.queue.badgeNew')}
                  </Text>
                  <Text style={s.title} numberOfLines={1}>{revisionOf(p)?.title ?? p.title}</Text>
                  <Text style={s.cap} numberOfLines={1}>{[ownerName(p), edit ? null : t('admin.queue.firstListing')].filter(Boolean).join(' · ')}</Text>
                  <Text style={s.cap}>{t(`admin.queue.waited${w.unit}`, { count: w.count })}</Text>
                </View>
                <Icon name="chevron-right" size={20} color={colors.iconSecondary} />
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

interface Row { key: string; label: string; before: string; after: string; images?: string[]; added?: string[] }

const REASONS = ['poorImage', 'incomplete', 'wrongCategory', 'noContact', 'wrongPrice', 'duplicate'];
const FIELDS: Array<{ key: string | null; label: string }> = [
  { key: 'price_amount', label: 'admin.review.price' },
  { key: 'details', label: 'admin.review.description' },
  { key: 'images', label: 'admin.review.photos' },
  { key: 'subcategory', label: 'prov.wizard.rowCategory' },
  { key: 'title', label: 'prov.wizard.titleLabel' },
  { key: null, label: 'admin.reject.whole' },
];

/** Figma J2 (an edit, before and after) and J9 (a new listing); J3 the rejection. */
export function AdminReview() {
  const s = useAdminStyles();
  const { colors, spacing } = useAppTheme();
  const { t } = useTranslation();
  const locale = useLocale();
  const nav = useNavigation<Nav>();
  const { params } = useRoute<RouteProp<RootStackParamList, 'AdminReview'>>();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const clearance = useToastClearance();
  const q = useAdminListings('PENDING', '', 100);
  const cats = useCategories();
  const approve = useApprove();
  const reject = useReject();
  const [rejecting, setRejecting] = useState(false);
  const [field, setField] = useState<string | null>(null);
  const [preset, setPreset] = useState<string | null>(null);
  const [text, setText] = useState('');
  const items = q.data?.items ?? [];
  const index = items.findIndex((p) => p.id === params.id);
  const p = index >= 0 ? items[index] : null;
  useEffect(() => {
    setField(null);
    setPreset(null);
    setText('');
  }, [params.id]);

  const next = () => {
    const n = items[index + 1] ?? items[index - 1];
    if (n && n.id !== params.id) nav.replace('AdminReview', { id: n.id });
    else nav.goBack();
  };

  if (!p) {
    return (
      <View style={s.screen}>
        <AppHeader variant="pushed" title={t('admin.review.newTitle')} onBack={() => nav.goBack()} />
        {q.isLoading ? <View style={{ padding: 16 }}><SkeletonListingRow /></View> : <EmptyState icon="shield-check" title={t('admin.noPending')} />}
      </View>
    );
  }

  const edit = !!p.pending_revision;
  const r = revisionOf(p);
  const cat = cats.data?.find((c) => c.key === p.category);
  const show = (v: unknown, key?: string): string => {
    if (v === null || v === undefined || v === '') return '—';
    const fd = key ? cat?.fields.find((x) => x.key === key) : undefined;
    if (typeof v === 'boolean') return t(v ? 'customer.detail.yes' : 'customer.detail.no');
    if (Array.isArray(v)) return v.map((x) => (fd ? optionLabel(t, fd, String(x)) : String(x))).join(', ');
    if (fd && typeof v === 'string') return optionLabel(t, fd, v);
    return `${String(v)}${fd?.unit ? ` ${fd.unit}` : ''}`;
  };
  const changed = new Set((p.edit_diff ?? []).map((d) => d.field));
  const rows: Row[] = [];
  if (r) {
    if (changed.has('title')) rows.push({ key: 'title', label: t('prov.wizard.titleLabel'), before: show(p.title), after: show(r.title) });
    if (changed.has('price_amount') || changed.has('price_unit')) rows.push({ key: 'price', label: t('admin.review.price'), before: formatPrice(p.price_amount, p.price_unit, locale) ?? '—', after: formatPrice(r.price_amount, r.price_unit, locale) ?? '—' });
    if (changed.has('details')) rows.push({ key: 'details', label: t('admin.review.description'), before: show(p.details), after: show(r.details) });
    if (changed.has('subcategory')) rows.push({ key: 'sub', label: t('prov.wizard.rowCategory'), before: show(p.subcategory), after: show(r.subcategory) });
    if (['province', 'district', 'address'].some((f) => changed.has(f))) {
      rows.push({ key: 'place', label: t('prov.wizard.rowLocation'), before: [placeLabel(t, p.province, p.district), p.address].filter(Boolean).join(' · ') || '—', after: [placeLabel(t, r.province, r.district), r.address].filter(Boolean).join(' · ') || '—' });
    }
    if (changed.has('attributes')) {
      const a = p.attributes ?? {};
      const b = r.attributes ?? {};
      for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
        if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) rows.push({ key: `a.${k}`, label: cat?.fields.find((x) => x.key === k)?.label ?? k, before: show(a[k], k), after: show(b[k], k) });
      }
    }
    if (changed.has('images')) rows.push({ key: 'images', label: t('admin.review.photosMore', { count: Math.max(0, r.images.length - (p.images?.length ?? 0)) }), before: '', after: '', images: r.images, added: r.images.filter((x) => !(p.images ?? []).includes(x)) });
  }
  const specs = Object.entries(p.attributes ?? {}).map(([k, v]) => ({ label: cat?.fields.find((x) => x.key === k)?.label ?? k, value: show(v, k) }));
  const reason = preset === 'other' ? text.trim() : preset ? t(`admin.reasonTypes.${preset}`) : '';
  const fail = (e: unknown) => toast.show({ message: errorText(e), kind: 'error' });

  return (
    <View style={s.screen}>
      <AppHeader variant="pushed" title={edit ? t('admin.review.editTitle') : t('admin.review.newTitle')} subtitle={t('admin.review.position', { index: index + 1, total: items.length })} onBack={() => nav.goBack()} />
      <ScrollView contentContainerStyle={s.content}>
        <View style={[s.card, { borderWidth: 0 }]}>
          <Thumb p={p} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={s.title}>{r?.title ?? p.title}</Text>
            <Text style={s.cap}>{ownerName(p)}</Text>
          </View>
        </View>
        {edit ? (
          <>
            <Banner tone="info" title={t('admin.review.liveNote')} body={t('admin.review.liveHint')} />
            <Text style={s.cap}>{t('admin.review.changed', { count: rows.length })}</Text>
            {rows.map((row) => (
              <View key={row.key} style={s.panel}>
                <Text style={s.h3}>{row.label}</Text>
                {row.images ? (
                  <View style={s.wrap}>
                    {row.images.map((src) => <Image key={src} source={{ uri: src }} style={{ width: 56, height: 56, borderRadius: 8, borderWidth: row.added?.includes(src) ? 2 : 0, borderColor: colors.statusSuccess }} />)}
                  </View>
                ) : (
                  <>
                    <View style={s.before}><Text style={{ color: colors.statusDanger }}>−</Text><Text style={[s.body, { flex: 1, textDecorationLine: 'line-through' }]}>{row.before}</Text></View>
                    <View style={s.after}><Text style={{ color: colors.statusSuccess }}>+</Text><Text style={[s.body, { flex: 1, color: colors.textPrimary }]}>{row.after}</Text></View>
                  </>
                )}
              </View>
            ))}
          </>
        ) : (
          <>
            <Banner tone="info" title={t('admin.review.newNote')} body={t('admin.review.newHint')} />
            {specs.length ? (
              <View style={s.panel}>
                <Text style={s.h3}>{t('admin.review.specs')}</Text>
                <View style={s.wrap}>
                  {specs.map((x) => (
                    <View key={x.label} style={{ width: '47%', gap: 2 }}>
                      <Text style={s.cap}>{x.label}</Text>
                      <Text style={s.title}>{x.value}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}
            <View style={s.panel}>
              <Text style={s.h3}>{t('admin.review.price')}</Text>
              <Text style={s.body}>{formatPrice(p.price_amount, p.price_unit, locale) ?? '—'}</Text>
            </View>
            {p.details ? <View style={s.panel}><Text style={s.h3}>{t('admin.review.description')}</Text><Text style={s.body}>{p.details}</Text></View> : null}
            {(p.images?.length ?? 0) > 0 ? (
              <View style={s.panel}>
                <Text style={s.h3}>{t('admin.review.photos')}</Text>
                <View style={s.wrap}>{p.images?.map((src) => <Image key={src} source={{ uri: src }} style={{ width: 72, height: 72, borderRadius: 8 }} />)}</View>
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
      <View style={[s.footer, { paddingBottom: spacing.screenPadding + insets.bottom }]} onLayout={clearance}>
        <View style={{ flex: 1 }}><Button label={t('admin.review.reject')} variant="outline" fullWidth onPress={() => setRejecting(true)} /></View>
        <View style={{ flex: 1 }}>
          <Button
            label={t('admin.review.approve')}
            fullWidth
            loading={approve.isPending}
            onPress={() => approve.mutate(p.id, { onSuccess: () => { toast.show({ message: t('admin.review.approved'), kind: 'success' }); next(); }, onError: fail })}
          />
        </View>
      </View>
      <BottomSheet
        visible={rejecting}
        onClose={() => setRejecting(false)}
        title={t('admin.reject.what')}
        footerLabel={edit ? t('admin.reject.submitEdit') : t('admin.reject.submitNew')}
        footerDisabled={!reason || reject.isPending}
        onFooter={() => reject.mutate({ id: p.id, reason, field_key: field }, {
          onSuccess: () => { setRejecting(false); toast.show({ message: t('admin.review.rejected'), kind: 'success' }); next(); },
          onError: fail,
        })}
      >
        <View style={{ gap: 12 }}>
          <Text style={s.cap}>{t('admin.reject.whatHint')}</Text>
          <View style={s.wrap}>{FIELDS.map((f) => <Chip key={f.key ?? 'whole'} label={t(f.label)} selected={field === f.key} onPress={() => setField(f.key)} />)}</View>
          <Text style={s.h3}>{t('admin.reject.reason')}</Text>
          <View style={s.wrap}>
            {REASONS.map((x) => <Chip key={x} label={t(`admin.reasonTypes.${x}`)} selected={preset === x} onPress={() => setPreset(x)} />)}
            <Chip label={t('admin.reject.other')} selected={preset === 'other'} onPress={() => setPreset('other')} />
          </View>
          {preset === 'other' ? <TextField label={t('admin.reject.reason')} value={text} onChangeText={setText} multiline /> : null}
          {reason ? <Text style={s.cap}>{`“${reason}”`}</Text> : null}
        </View>
      </BottomSheet>
    </View>
  );
}

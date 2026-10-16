import { useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { formatDate, formatPrice, groupThousands, type AdminUser, type AdminUserFilter, type ReportGroup } from '@zuuchmap/core';
import { useAppTheme } from '../../design/theme';
import { errorText, signOut } from '../../lib/api';
import { useAdminListings, useAdminUsers, useAnalytics, useOverview, usePlanActions, useReports, useResolveReport, waited, type QueueStatus } from '../../lib/admin';
import { useAuth } from '../../lib/auth';
import { placeLabel } from '../../lib/browse';
import { useCategories } from '../../lib/queries';
import { unregisterDevice } from '../../lib/push';
import type { Nav } from '../../nav';
import { AppHeader } from '../../ui/AppHeader';
import { Avatar } from '../../ui/Avatar';
import { Button } from '../../ui/Button';
import { Chip } from '../../ui/Chip';
import { EmptyState } from '../../ui/EmptyState';
import { Icon } from '../../ui/Icon';
import { Modal } from '../../ui/Modal';
import { SearchBar } from '../../ui/SearchBar';
import { SegmentedControl } from '../../ui/SegmentedControl';
import { SkeletonListingRow } from '../../ui/SkeletonListingRow';
import { StatTile } from '../../ui/StatTile';
import { StatusBadge, type Status } from '../../ui/StatusBadge';
import { useToast } from '../../ui/Toast';
import { useLocale } from '../../ui/useLocale';
import { Thumb, useAdminStyles } from './Queue';

const statusOf = (p: { approval_status: string | null; pending_revision?: unknown; status: string | null; expires_at: string | null }): Status => {
  if (p.approval_status === 'REJECTED') return 'rejected';
  if (p.approval_status === 'PENDING' || p.pending_revision) return 'pending';
  if (p.status === 'EXPIRED' || (p.expires_at && new Date(p.expires_at).getTime() < Date.now())) return 'expired';
  return 'live';
};
const nameOf = (u: Pick<AdminUser, 'company' | 'parent_name' | 'given_name' | 'phone_number'> | null | undefined): string =>
  u?.company?.name ?? ([u?.parent_name, u?.given_name].filter(Boolean).join(' ') || u?.phone_number || '');
const phoneOf = (p: string | null | undefined) => (p ? `${p.slice(0, 4)} ${p.slice(4)}` : '');

const FILTERS: Array<{ key: QueueStatus; label: string }> = [
  { key: '', label: 'admin.browse.all' },
  { key: 'PENDING', label: 'admin.browse.pending' },
  { key: 'APPROVED', label: 'admin.dash.approved' },
  { key: 'REJECTED', label: 'admin.dash.rejected' },
];

/** Figma J5: every listing by title, phone or category. */
export function AdminBrowse() {
  const s = useAdminStyles();
  const { t } = useTranslation();
  const locale = useLocale();
  const nav = useNavigation<Nav>();
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<QueueStatus>('');
  const q = useAdminListings(status, query);
  const pending = useAdminListings('PENDING', '', 1);
  return (
    <View style={s.screen}>
      <AppHeader variant="root" title={t('admin.browse.title')} />
      <View style={{ paddingHorizontal: 16, gap: 10, paddingBottom: 8 }}>
        <SearchBar value={text} onChangeText={(v) => { setText(v); if (!v) setQuery(''); }} onSubmit={(v) => setQuery(v.trim())} placeholder={t('admin.browse.placeholder')} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
          {FILTERS.map((f) => (
            <Chip key={f.key || 'all'} label={f.key === 'PENDING' && pending.data ? `${t(f.label)} · ${String(pending.data.total)}` : t(f.label)} selected={status === f.key} onPress={() => setStatus(f.key)} />
          ))}
        </ScrollView>
        <Text style={s.cap}>{t('admin.browse.count', { count: q.data?.total ?? 0 })}</Text>
      </View>
      <FlatList
        data={q.data?.items ?? []}
        keyExtractor={(p) => String(p.id)}
        contentContainerStyle={s.content}
        refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />}
        ListEmptyComponent={q.isLoading ? <SkeletonListingRow /> : <EmptyState icon="search" title={t('admin.browse.count', { count: 0 })} />}
        renderItem={({ item: p }) => {
          const st = statusOf(p);
          const meta = st === 'rejected' ? (p.rejection_reason ? `“${p.rejection_reason}”` : '')
            : p.pending_revision ? t('admin.queue.badgeEdit')
            : st === 'expired' && p.expires_at ? t('admin.browse.endedOn', { date: formatDate(p.expires_at, locale) })
            : st === 'live' ? t('admin.browse.live', { count: p.views }) : t('admin.queue.firstListing');
          return (
            <Pressable accessibilityRole="button" style={s.card} onPress={() => (st === 'pending' ? nav.navigate('AdminReview', { id: p.id }) : nav.navigate('ListingDetail', { id: p.id }))}>
              <Thumb p={p} />
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={s.title} numberOfLines={1}>{p.title}</Text>
                <Text style={s.cap} numberOfLines={1}>{[placeLabel(t, p.province, p.district), nameOf(p.user as AdminUser | null)].filter(Boolean).join(' · ')}</Text>
                <Text style={s.cap} numberOfLines={1}>{formatPrice(p.price_amount, p.price_unit, locale) ?? ''}</Text>
                <Text style={s.cap} numberOfLines={1}>{meta}</Text>
              </View>
              <StatusBadge status={st} />
            </Pressable>
          );
        }}
      />
    </View>
  );
}

/** Figma J4: a card per reported subject; keep it or take it down. */
export function AdminReports() {
  const s = useAdminStyles();
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const locale = useLocale();
  const toast = useToast();
  const [tab, setTab] = useState<'OPEN' | 'CLOSED'>('OPEN');
  const open = useReports('OPEN');
  const closed = useReports('CLOSED');
  const q = tab === 'OPEN' ? open : closed;
  const resolve = useResolveReport();
  const act = (g: ReportGroup, action: 'KEEP' | 'TAKE_DOWN') => resolve.mutate({ id: g.id, action }, {
    onSuccess: () => toast.show({ message: t(action === 'KEEP' ? 'report.resolvedKeep' : 'report.resolvedTaken'), kind: 'success' }),
    onError: (e) => toast.show({ message: errorText(e), kind: 'error' }),
  });
  return (
    <View style={s.screen}>
      <AppHeader variant="root" title={t('report.queue')} />
      <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
        <SegmentedControl value={tab} onChange={setTab} segments={[{ value: 'OPEN', label: t('report.openCount', { count: open.data?.total ?? 0 }) }, { value: 'CLOSED', label: t('report.status.RESOLVED') }]} />
      </View>
      <FlatList
        data={q.data?.items ?? []}
        keyExtractor={(g) => g.id}
        contentContainerStyle={s.content}
        refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />}
        ListEmptyComponent={q.isLoading ? <SkeletonListingRow /> : <EmptyState icon="flag" title={t('report.queueEmpty')} />}
        renderItem={({ item: g }) => {
          const post = g.kind === 'POST';
          return (
            <View style={s.panel}>
              <View style={[s.wrap, { alignItems: 'center' }]}>
                <Text style={[s.badge, { backgroundColor: post ? colors.statusInfoTint : colors.statusWarningTint, color: post ? colors.statusInfo : colors.statusWarning }]}>{post ? t('report.kindPost') : t('report.kindReview')}</Text>
                {g.reasons.map((r) => <Text key={r} style={[s.badge, { backgroundColor: colors.statusDangerTint, color: colors.statusDanger }]}>{t(`report.reasons.${r}`)}</Text>)}
                <Text style={s.cap}>{t('report.reporters', { count: g.reporters })}</Text>
              </View>
              <Text style={s.title}>{(post ? g.post?.title : null) ?? g.subject ?? t('report.subjectGone')}</Text>
              <Text style={s.cap}>{[nameOf(g.owner as AdminUser | null), formatDate(g.first_at, locale)].filter(Boolean).join(' · ')}</Text>
              {g.detail ? <Text style={s.body}>{`“${g.detail}”`}</Text> : null}
              {g.status === 'OPEN' ? (
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 1 }}><Button label={t('report.keep')} variant="outline" size="medium" fullWidth disabled={resolve.isPending} onPress={() => act(g, 'KEEP')} /></View>
                  <View style={{ flex: 1 }}><Button label={post ? t('report.takeDownShort') : t('report.removeReview')} variant="danger" size="medium" fullWidth disabled={resolve.isPending} onPress={() => act(g, 'TAKE_DOWN')} /></View>
                </View>
              ) : (
                <Text style={s.cap}>{[t(`report.status.${g.status}`), g.resolved_at ? formatDate(g.resolved_at, locale) : null].filter(Boolean).join(' · ')}</Text>
              )}
            </View>
          );
        }}
      />
    </View>
  );
}

/** Figma J8: who is signed in, users and analytics, help, sign-out; configuration is on the web. */
export function AdminProfile() {
  const s = useAdminStyles();
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const nav = useNavigation<Nav>();
  const qc = useQueryClient();
  const toast = useToast();
  const { user } = useAuth();
  const o = useOverview().data;
  const [confirm, setConfirm] = useState(false);
  const row = (icon: string, label: string, onPress: () => void, hint?: string) => (
    <Pressable accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56 }} onPress={onPress}>
      <Icon name={icon} size={22} color={colors.iconPrimary} />
      <View style={{ flex: 1 }}>
        <Text style={s.title}>{label}</Text>
        {hint ? <Text style={s.cap}>{hint}</Text> : null}
      </View>
      <Icon name="chevron-right" size={20} color={colors.iconSecondary} />
    </Pressable>
  );
  return (
    <View style={s.screen}>
      <AppHeader variant="root" title={t('nav.profile')} />
      <ScrollView contentContainerStyle={s.content}>
        <View style={[s.panel, { flexDirection: 'row', alignItems: 'center', gap: 12 }]}>
          <Avatar size="large" name={user?.phone_number ?? ''} />
          <View style={{ flex: 1 }}>
            <Text style={s.h}>{t('admin.role')}</Text>
            <Text style={s.cap}>{t('admin.me.rights', { phone: phoneOf(user?.phone_number) })}</Text>
          </View>
        </View>
        <Text style={s.cap}>{t('admin.me.manage')}</Text>
        <View style={s.panel}>
          {row('users', t('admin.users'), () => nav.navigate('AdminUsers'), o ? t('admin.me.usersLine', { users: o.users.total, providers: o.users.providers }) : undefined)}
          {row('bar-chart-3', t('analytics.title'), () => nav.navigate('AdminAnalytics'), t('admin.me.analyticsLine'))}
        </View>
        <View style={s.panel}>
          {row('help-circle', t('legal.helpRow'), () => nav.navigate('Help'))}
          {row('shield-check', t('legal.privacy.title'), () => nav.navigate('Privacy'))}
          {row('file-text', t('legal.terms.title'), () => nav.navigate('Terms'))}
        </View>
        <Button label={t('nav.logout')} variant="outline" icon="log-out" fullWidth onPress={() => setConfirm(true)} />
        <Text style={s.cap}>{t('admin.me.webNote')}</Text>
      </ScrollView>
      <Modal
        visible={confirm}
        onClose={() => setConfirm(false)}
        title={t('nav.logout')}
        body={t('nav.logoutConfirmMessage')}
        icon="log-out"
        iconTone="warning"
        cancelLabel={t('common.cancel')}
        confirmLabel={t('nav.logout')}
        destructive={false}
        onConfirm={() => {
          setConfirm(false);
          void unregisterDevice().then(signOut).then(() => {
            qc.clear();
            toast.show({ message: t('customer.signin.signedOut'), kind: 'info' });
          });
        }}
      />
    </View>
  );
}

const USER_FILTERS: Array<{ key: AdminUserFilter | ''; label: string }> = [
  { key: '', label: 'admin.browse.all' },
  { key: 'PROVIDER', label: 'admin.people.providers' },
  { key: 'CUSTOMER', label: 'admin.people.customers' },
  { key: 'ADMIN', label: 'admin.people.admins' },
];

/** Figma J6: users by phone or name; a provider's plan can be extended a month or cancelled. */
export function AdminUsers() {
  const s = useAdminStyles();
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const locale = useLocale();
  const nav = useNavigation<Nav>();
  const toast = useToast();
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  const [type, setType] = useState<AdminUserFilter | ''>('');
  const [open, setOpen] = useState<string | null>(null);
  const [cancel, setCancel] = useState<AdminUser | null>(null);
  const q = useAdminUsers(query, type);
  const plans = usePlanActions();
  const role = (u: AdminUser) => (u.is_admin ? t('admin.people.admins') : u.type === 'PROVIDER' ? t('admin.people.providers') : t('admin.people.customers'));
  const fail = (e: unknown) => toast.show({ message: errorText(e), kind: 'error' });
  return (
    <View style={s.screen}>
      <AppHeader variant="pushed" title={t('admin.users')} onBack={() => nav.goBack()} />
      <View style={{ paddingHorizontal: 16, gap: 10, paddingBottom: 8 }}>
        <SearchBar value={text} onChangeText={(v) => { setText(v); if (!v) setQuery(''); }} onSubmit={(v) => setQuery(v.trim())} placeholder={t('admin.searchUsers')} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
          {USER_FILTERS.map((f) => <Chip key={f.key || 'all'} label={t(f.label)} selected={type === f.key} onPress={() => setType(f.key)} />)}
        </ScrollView>
        <Text style={s.cap}>{t('admin.people.count', { count: q.data?.total ?? 0 })}</Text>
      </View>
      <FlatList
        data={q.data?.items ?? []}
        keyExtractor={(u) => u.id}
        contentContainerStyle={s.content}
        ListEmptyComponent={q.isLoading ? <SkeletonListingRow /> : <EmptyState icon="users" title={t('admin.noUsers')} />}
        renderItem={({ item: u }) => {
          const expanded = open === u.id && u.type === 'PROVIDER';
          return (
            <View style={s.panel}>
              <Pressable accessibilityRole="button" accessibilityState={{ expanded }} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }} onPress={() => setOpen(expanded ? null : u.id)}>
                <Avatar name={nameOf(u)} uri={u.company?.logo ?? u.profile_picture} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={s.title} numberOfLines={1}>{nameOf(u)}</Text>
                  <Text style={s.cap} numberOfLines={1}>
                    {[phoneOf(u.phone_number), role(u), u.type === 'PROVIDER' ? (u.plan === 'PROVIDER' ? t('billing.planProvider') : t('billing.planFree')) : t('admin.people.since', { date: formatDate(u.date_created, locale).slice(0, 7) })].join(' · ')}
                  </Text>
                </View>
                {u.type === 'PROVIDER' ? <Icon name="chevron-down" size={18} color={colors.iconSecondary} /> : null}
              </Pressable>
              {expanded ? (
                <View style={{ gap: 10, paddingTop: 6 }}>
                  <View style={{ flexDirection: 'row', gap: 16 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.cap}>{t('admin.people.currentPlan')}</Text>
                      <Text style={s.title}>{u.plan === 'PROVIDER' && u.plan_expires_at ? `${t('billing.planProvider')} · ${formatDate(u.plan_expires_at, locale)}` : t('billing.planFree')}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.cap}>{t('admin.people.listings')}</Text>
                      <Text style={s.title}>{t('admin.people.listingsLine', { count: u.total_posts, live: u.active_posts })}</Text>
                    </View>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <View style={{ flex: 1 }}>
                      <Button label={t('admin.people.extend')} size="medium" fullWidth loading={plans.extend.isPending} onPress={() => plans.extend.mutate({ id: u.id, months: 1 }, { onSuccess: () => toast.show({ message: t('admin.user.planGranted'), kind: 'success' }), onError: fail })} />
                    </View>
                    {u.plan === 'PROVIDER' ? (
                      <View style={{ flex: 1 }}><Button label={t('admin.revokePlan')} variant="outline" size="medium" fullWidth onPress={() => setCancel(u)} /></View>
                    ) : null}
                  </View>
                </View>
              ) : null}
            </View>
          );
        }}
      />
      <Modal
        visible={!!cancel}
        onClose={() => setCancel(null)}
        title={t('admin.revokePlan')}
        body={nameOf(cancel)}
        icon="credit-card"
        cancelLabel={t('common.cancel')}
        confirmLabel={t('admin.revokePlan')}
        onConfirm={() => {
          const u = cancel;
          setCancel(null);
          if (u) plans.cancel.mutate(u.id, { onSuccess: () => toast.show({ message: t('admin.user.planRevoked'), kind: 'success' }), onError: fail });
        }}
      />
    </View>
  );
}

const DAYS = ['7', '30', '90'] as const;

/** Figma J7: users, listings, the queue, accepted bookings; funnel; categories; search gaps. */
export function AdminAnalytics() {
  const s = useAdminStyles();
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const nav = useNavigation<Nav>();
  const cats = useCategories();
  const [days, setDays] = useState<(typeof DAYS)[number]>('7');
  const a = useAnalytics(Number(days)).data;
  const wait = a?.pending.oldest_at ? waited(a.pending.oldest_at) : null;
  const change = a && a.bookings_accepted.previous > 0 ? Math.round(((a.bookings_accepted.count - a.bookings_accepted.previous) / a.bookings_accepted.previous) * 100) : null;
  const steps = a ? [
    { label: t('analytics.views'), n: a.funnel.viewed },
    { label: t('analytics.contacted'), n: a.funnel.contacted },
    { label: t('analytics.requested'), n: a.funnel.requested },
    { label: t('analytics.accepted'), n: a.funnel.accepted },
  ] : [];
  const top = Math.max(1, ...steps.map((x) => x.n));
  const catTop = Math.max(1, ...(a?.by_category ?? []).map((x) => x.count));
  const bar = (label: string, n: number, max: number) => (
    <View key={label} style={{ gap: 4 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={s.cap}>{label}</Text>
        <Text style={s.title}>{groupThousands(n)}</Text>
      </View>
      <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.bgSurfaceSunken, overflow: 'hidden' }}>
        <View style={{ width: `${String(Math.round((n / max) * 100))}%` as `${number}%`, height: 8, borderRadius: 4, backgroundColor: colors.actionPrimary }} />
      </View>
    </View>
  );
  return (
    <View style={s.screen}>
      <AppHeader variant="pushed" title={t('analytics.title')} onBack={() => nav.goBack()} />
      <ScrollView contentContainerStyle={s.content}>
        <SegmentedControl value={days} onChange={setDays} segments={DAYS.map((d) => ({ value: d, label: t('analytics.days', { count: Number(d) }) }))} />
        <View style={s.wrap}>
          <View style={{ width: '48%' }}><StatTile icon="users" label={t('analytics.users')} value={a ? groupThousands(a.users.total) : '—'} delta={a ? { text: t('analytics.newCount', { count: a.users.new }), trend: 'up' } : undefined} /></View>
          <View style={{ width: '48%' }}><StatTile icon="eye" label={t('analytics.liveListings')} value={a ? groupThousands(a.live.total) : '—'} delta={a ? { text: t('analytics.newCount', { count: a.live.new }), trend: 'up' } : undefined} /></View>
          <View style={{ width: '48%' }}><StatTile icon="clock" label={t('analytics.pendingQueue')} value={a ? groupThousands(a.pending.count) : '—'} delta={wait ? { text: t('analytics.oldestWait', { time: t(`admin.queue.${wait.unit.toLowerCase()}`, { count: wait.count }) }), trend: 'flat' } : undefined} /></View>
          <View style={{ width: '48%' }}><StatTile icon="calendar" label={t('analytics.acceptedBookings')} value={a ? groupThousands(a.bookings_accepted.count) : '—'} delta={change !== null ? { text: t('analytics.vsPrevious', { pct: `${change >= 0 ? '+' : ''}${String(change)}` }), trend: change >= 0 ? 'up' : 'flat' } : undefined} /></View>
        </View>
        <View style={s.panel}>
          <Text style={s.h3}>{t('analytics.funnelTitle')}</Text>
          <Text style={s.cap}>{t('analytics.funnelHint')}</Text>
          {steps.map((x) => bar(x.label, x.n, top))}
        </View>
        <View style={s.panel}>
          <Text style={s.h3}>{t('analytics.byCategory')}</Text>
          <Text style={s.cap}>{t('analytics.byCategoryHint')}</Text>
          {(a?.by_category ?? []).slice(0, 6).map((c) => bar(cats.data?.find((x) => x.key === c.key)?.label ?? c.key, c.count, catTop))}
        </View>
        <View style={s.panel}>
          <Text style={s.h3}>{t('analytics.searchGaps')}</Text>
          <Text style={s.cap}>{t('analytics.searchGapsHint')}</Text>
          {(a?.search_gaps ?? []).length === 0 ? <Text style={s.cap}>{t('analytics.noData')}</Text> : null}
          {(a?.search_gaps ?? []).map((g) => (
            <View key={`${g.query}:${g.province ?? ''}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 }}>
              <View style={{ flex: 1 }}>
                <Text style={s.title}>{g.query}</Text>
                <Text style={s.cap}>{t('analytics.gapCount', { count: g.count })}</Text>
              </View>
              {g.province ? <Text style={s.cap}>{placeLabel(t, g.province, null)}</Text> : null}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}


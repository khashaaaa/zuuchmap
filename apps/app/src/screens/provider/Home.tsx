import { useState, type ReactElement } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { formatPrice, formatRelativeAge, replyTimeKey, type CategoryView, type ProviderHome } from '@zuuchmap/core';
import { themedStyles, useAppTheme } from '../../design/theme';
import { displayName } from '../../lib/deal';
import { changeText, daysLeft, useProfile, useProviderHome } from '../../lib/provider';
import { useAuth } from '../../lib/auth';
import { useBell } from '../../lib/notifications';
import { openSystemSettings, usePermission } from '../../lib/push';
import type { Nav } from '../../nav';
import { AppHeader } from '../../ui/AppHeader';
import { Banner } from '../../ui/Banner';
import { Button } from '../../ui/Button';
import { EmptyState } from '../../ui/EmptyState';
import { Icon } from '../../ui/Icon';
import { SkeletonListingRow } from '../../ui/SkeletonListingRow';
import { StatTile } from '../../ui/StatTile';
import { TaskCard } from '../../ui/TaskCard';
import { useLocale } from '../../ui/useLocale';
import { RenewSheet, type RenewTarget } from './RenewSheet';

const useStyles = themedStyles((t) => ({
  screen: { flex: 1, backgroundColor: t.colors.bgCanvas },
  content: { paddingHorizontal: t.spacing.screenPadding, paddingBottom: 32, gap: 16 },
  hello: { ...t.type.h2, color: t.colors.textPrimary },
  sub: { ...t.type.caption, color: t.colors.textSecondary },
  h: { ...t.type.h3, color: t.colors.textPrimary },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  link: { ...t.type.labelStrong, color: t.colors.textLink },
  value: { gap: 4, padding: 16, borderRadius: t.radius.card, backgroundColor: t.colors.bgSurface, flexDirection: 'row', alignItems: 'center' },
  big: { ...t.type.h1, color: t.colors.textPrimary, fontVariant: ['tabular-nums'] },
  top: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12 },
  topTitle: { ...t.type.bodyMedium, color: t.colors.textPrimary, flex: 1 },
  topNum: { ...t.type.caption, color: t.colors.textSecondary },
  rule: { height: 1, backgroundColor: t.colors.borderSubtle },
}));

/** Human name of a rejected field, from the category schema or the base form labels. */
export function fieldLabel(t: (k: string) => string, key: string | null, cat?: CategoryView): string {
  if (!key) return '';
  const base: Record<string, string> = {
    title: 'form.postTitle', details: 'form.postDetails', price_amount: 'form.priceAmount', price_unit: 'form.priceUnit', images: 'posts.rejectedFieldImages',
    province: 'common.province', district: 'common.district', address: 'common.address', latitude: 'posts.rejectedFieldLocation', longitude: 'posts.rejectedFieldLocation',
    subcategory: 'posts.category', attributes: 'form.categoryDetails',
  };
  if (base[key]) return t(base[key]);
  return cat?.fields.find((f) => f.key === key)?.label ?? key;
}

/** E1 / E11: what needs the provider now, the month's booking value and the week. */
export function ProviderHomeScreen() {
  const s = useStyles();
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const locale = useLocale();
  const nav = useNavigation<Nav>();
  const { user } = useAuth();
  const profile = useProfile();
  const bell = useBell();
  const perm = usePermission();
  const q = useProviderHome();
  const [renew, setRenew] = useState<RenewTarget | null>(null);
  const h: ProviderHome | undefined = q.data;
  const name = profile.data?.given_name || displayName(profile.data, '');

  const tasks: Array<{ key: string; node: ReactElement }> = [];
  if (h) {
    if (h.pending_requests.count > 0) {
      tasks.push({
        key: 'req',
        node: (
          <TaskCard
            type="request"
            title={t('prov.home.requests', { count: h.pending_requests.count })}
            subtitle={h.pending_requests.oldest_at ? t('prov.home.oldest', { age: formatRelativeAge(h.pending_requests.oldest_at, (k, o) => t(k, o) as string) }) : undefined}
            actionLabel={t('prov.home.view')}
            onAction={() => nav.navigate('BookingRequests')}
          />
        ),
      });
    }
    for (const f of h.to_fix) {
      tasks.push({
        key: `fix${f.id}`,
        node: (
          <TaskCard
            type="rejected"
            title={t(f.revision ? 'prov.home.editRefused' : 'prov.home.rejected', { title: f.title ?? '' })}
            subtitle={t('prov.home.fieldReason', { field: fieldLabel(t, f.rejection_field), reason: f.rejection_reason ?? '' })}
            actionLabel={t('prov.home.fix')}
            onAction={() => nav.navigate('Wizard', { edit: f.id })}
          />
        ),
      });
    }
    if (h.unread_chats.count > 0) {
      tasks.push({
        key: 'chat',
        node: (
          <TaskCard
            type="request"
            icon="message-circle"
            title={t('prov.home.unread', { count: h.unread_chats.count })}
            subtitle={h.unread_chats.reply_minutes != null ? t('prov.home.avgReply', { time: t(replyTimeKey(h.unread_chats.reply_minutes).key, { count: replyTimeKey(h.unread_chats.reply_minutes).count }) }) : undefined}
            actionLabel={t('prov.home.reply')}
            onAction={() => nav.navigate('Tabs', { screen: 'messages' })}
          />
        ),
      });
    }
    if (h.expiring.length > 0) {
      const first = h.expiring[0];
      const days = Math.max(0, Math.min(...h.expiring.map((e) => daysLeft(e.expires_at) ?? 0)));
      tasks.push({
        key: 'exp',
        node: (
          <TaskCard
            type="expiring"
            title={t('prov.home.expiring', { count: h.expiring.length, days })}
            subtitle={t('prov.home.expiringBody')}
            actionLabel={t('prov.home.renew')}
            onAction={() => (h.expiring.length === 1 ? setRenew({ id: first.id, title: first.title, expires_at: first.expires_at, category: undefined }) : nav.navigate('Tabs', { screen: 'myPosts' }))}
          />
        ),
      });
    }
    if (h.unanswered_reviews > 0 && user) {
      tasks.push({
        key: 'rev',
        node: (
          <TaskCard
            type="request"
            icon="star"
            title={t('prov.home.reviews', { count: h.unanswered_reviews })}
            actionLabel={t('prov.home.reply')}
            onAction={() => nav.navigate('Reviews', { id: user.id, name: displayName(profile.data, name) })}
          />
        ),
      });
    }
  }

  const cur = h?.week.totals.current;
  const prev = h?.week.totals.previous;
  const delta = (a?: number, b?: number) => {
    if (a === undefined || b === undefined) return undefined;
    const c = changeText(a, b);
    return c ? { text: t('prov.home.vsPrev', { change: c.text }), trend: c.up ? ('up' as const) : ('flat' as const) } : { text: t('prov.home.same'), trend: 'flat' as const };
  };
  const top = h?.week.posts.slice(0, 3) ?? [];

  return (
    <View style={s.screen}>
      <AppHeader variant="brand" action={bell} />
      <ScrollView contentContainerStyle={s.content} refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} tintColor={colors.iconSecondary} />}>
        <View style={{ gap: 2 }}>
          <Text style={s.hello} accessibilityRole="header">{t('prov.home.greeting', { name })}</Text>
          {h ? <Text style={s.sub}>{tasks.length > 0 ? t('prov.home.waiting', { count: tasks.length }) : t('prov.home.allDone')}</Text> : null}
        </View>

        {perm === 'denied' ? <Banner tone="info" title={t('push.blockedTitle')} body={t('push.blockedBody')} actionLabel={t('push.openSettings')} onAction={openSystemSettings} /> : null}

        {q.isLoading ? (
          <View style={{ gap: 12 }}><SkeletonListingRow /><SkeletonListingRow /></View>
        ) : q.isError || !h ? (
          <EmptyState icon="wifi-off" title={t('deal.mine.errorTitle')} body={t('deal.mine.errorBody')} actionLabel={t('deal.retry')} onAction={() => void q.refetch()} />
        ) : (
          <>
            {tasks.length === 0 ? <Banner tone="info" title={t('prov.home.allDone')} /> : tasks.map((x) => <View key={x.key}>{x.node}</View>)}

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('prov.home.bookingValue')}
              onPress={() => nav.navigate('BookingValue')}
              style={s.value}
            >
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={s.sub}>{t('prov.home.bookingValue')}</Text>
                <Text style={s.big}>{formatPrice(h.booking_value.total, 'TOTAL', locale) ?? '0₮'}</Text>
                <Text style={s.sub}>{t('prov.home.confirmed', { count: h.booking_value.count })}</Text>
              </View>
              <Icon name="chevron-right" size={20} color={colors.iconSecondary} />
            </Pressable>

            <View style={{ gap: 10 }}>
              <View style={s.row}>
                <Text style={s.h} accessibilityRole="header">{t('prov.home.thisWeek')}</Text>
                <Text accessibilityRole="link" suppressHighlighting style={s.link} onPress={() => nav.navigate('Tabs', { screen: 'myPosts' })}>{`${t('prov.home.all')} ›`}</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <StatTile icon="eye" label={t('prov.home.views')} value={String(cur?.views ?? 0)} delta={delta(cur?.views, prev?.views)} />
                <StatTile icon="phone" label={t('prov.home.contacts')} value={String(cur?.contacts ?? 0)} delta={delta(cur?.contacts, prev?.contacts)} />
              </View>
              {top.length > 0 ? (
                <View style={{ borderRadius: 16, paddingHorizontal: 16, backgroundColor: colors.bgSurface }}>
                  {top.map((p, i) => (
                    <View key={p.id}>
                      {i > 0 ? <View style={s.rule} /> : null}
                      <Pressable accessibilityRole="button" style={s.top} onPress={() => nav.navigate('Performance', { id: p.id })}>
                        <Text style={s.topTitle} numberOfLines={1}>{p.title}</Text>
                        <Text style={s.topNum}>{`${p.current.views} ${t('prov.home.views').toLowerCase()}`}</Text>
                        <Icon name="chevron-right" size={18} color={colors.iconSecondary} />
                      </Pressable>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
            <Button label={t('prov.tab.add')} icon="plus" variant="outline" onPress={() => nav.navigate('Wizard')} />
          </>
        )}
      </ScrollView>
      <RenewSheet target={renew} onClose={() => setRenew(null)} />
    </View>
  );
}

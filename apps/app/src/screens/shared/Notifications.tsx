import { useMemo } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { formatDate, formatRelativeAge, notificationCopy, type AppNotification } from '@zuuchmap/core';
import { themedStyles, useAppTheme } from '../../design/theme';
import { useAuth } from '../../lib/auth';
import { flattenNotifications, rowType, useMarkRead, useNotifications, useOpenNotification } from '../../lib/notifications';
import type { Nav } from '../../nav';
import { AppHeader } from '../../ui/AppHeader';
import { EmptyState } from '../../ui/EmptyState';
import { NotificationRow } from '../../ui/NotificationRow';
import { SkeletonListingRow } from '../../ui/SkeletonListingRow';
import { useLocale } from '../../ui/useLocale';

const useStyles = themedStyles((t) => ({
  screen: { flex: 1, backgroundColor: t.colors.bgCanvas },
  group: { ...t.type.overline, color: t.colors.textSecondary, paddingHorizontal: t.spacing.screenPadding, paddingTop: 16, paddingBottom: 8 },
  sep: { height: 1, marginLeft: 68, backgroundColor: t.colors.borderSubtle },
}));

type Item = { kind: 'group'; key: string; label: string } | { kind: 'row'; key: string; n: AppNotification; today: boolean };

const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** I3: the notification centre. Today / earlier groups, infinite paging, pull to refresh. */
export function Notifications() {
  const s = useStyles();
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const locale = useLocale();
  const nav = useNavigation<Nav>();
  const { token } = useAuth();
  const q = useNotifications();
  const markAll = useMarkRead();
  const open = useOpenNotification();
  const rows = useMemo(() => flattenNotifications(q.data?.pages), [q.data]);
  const hasUnread = rows.some((n) => !n.read_at);

  const items = useMemo<Item[]>(() => {
    const now = new Date();
    const out: Item[] = [];
    let last: boolean | null = null;
    for (const n of rows) {
      const today = sameDay(new Date(n.created_at), now);
      if (today !== last) out.push({ kind: 'group', key: today ? 'g-today' : 'g-earlier', label: today ? t('notif.today') : t('notif.earlier') });
      last = today;
      out.push({ kind: 'row', key: n.id, n, today });
    }
    return out;
  }, [rows, t]);

  return (
    <View style={s.screen}>
      <AppHeader
        variant="pushed"
        title={t('notif.title')}
        onBack={() => nav.goBack()}
        action={hasUnread ? { icon: 'check-check', label: t('notif.markAllRead'), onPress: () => markAll.mutate(undefined) } : undefined}
      />
      {!token ? (
        <EmptyState icon="bell" title={t('notif.empty')} body={t('notif.emptyBody')} actionLabel={t('auth.title')} actionVariant="secondary" onAction={() => nav.navigate('SignIn')} />
      ) : q.isLoading ? (
        <View style={{ padding: 16, gap: 12 }}><SkeletonListingRow /><SkeletonListingRow /><SkeletonListingRow /></View>
      ) : q.isError && rows.length === 0 ? (
        <EmptyState icon="wifi-off" title={t('deal.chat.loadFailedTitle')} body={t('deal.chat.loadFailedBody')} actionLabel={t('deal.retry')} onAction={() => void q.refetch()} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.key}
          refreshControl={<RefreshControl refreshing={q.isRefetching && !q.isFetchingNextPage} onRefresh={() => void q.refetch()} tintColor={colors.iconSecondary} />}
          contentContainerStyle={{ flexGrow: 1 }}
          onEndReachedThreshold={0.6}
          onEndReached={() => {
            if (q.hasNextPage && !q.isFetchingNextPage) void q.fetchNextPage();
          }}
          ListEmptyComponent={<EmptyState icon="bell" title={t('notif.empty')} body={t('notif.emptyBody')} />}
          ListFooterComponent={q.isFetchingNextPage ? <ActivityIndicator style={{ padding: 16 }} color={colors.iconSecondary} /> : null}
          renderItem={({ item, index }) => {
            if (item.kind === 'group') return <Text accessibilityRole="header" style={s.group}>{item.label}</Text>;
            const n = item.n;
            const prev = items[index - 1];
            return (
              <View>
                {prev?.kind === 'row' ? <View style={s.sep} /> : null}
                <NotificationRow
                  type={rowType(n.kind)}
                  text={notificationCopy(n, (k, o) => t(k, o) as string).body}
                  time={item.today ? formatRelativeAge(n.created_at, (k, o) => t(k, o) as string) : formatDate(n.created_at, locale)}
                  unread={!n.read_at}
                  onPress={() => open(n)}
                />
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

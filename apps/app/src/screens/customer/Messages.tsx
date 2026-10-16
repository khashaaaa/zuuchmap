import { FlatList, RefreshControl, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { themedStyles, useAppTheme } from '../../design/theme';
import { useAuth } from '../../lib/auth';
import { displayName, messageText, useInbox } from '../../lib/deal';
import type { Nav } from '../../nav';
import { AppHeader } from '../../ui/AppHeader';
import { EmptyState } from '../../ui/EmptyState';
import { InboxRow } from '../../ui/InboxRow';
import { SkeletonListingRow } from '../../ui/SkeletonListingRow';

const useStyles = themedStyles((t) => ({
  screen: { flex: 1, backgroundColor: t.colors.bgCanvas },
  sep: { height: 1, marginLeft: 84, backgroundColor: t.colors.borderSubtle },
}));

/** I1/M1/M2: the Чат inbox, newest thread first; only threads that have a message. */
export function Messages() {
  const s = useStyles();
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const nav = useNavigation<Nav>();
  const { token, user } = useAuth();
  const isProvider = user?.type === 'PROVIDER';
  const inbox = useInbox();
  const items = inbox.data ?? [];

  return (
    <View style={s.screen}>
      <AppHeader variant="root" title={t('messages.title')} />
      {!token ? (
        <EmptyState icon="message-circle" title={t('messages.empty')} body={t('messages.emptyHint')} actionLabel={t('auth.title')} actionVariant="secondary" onAction={() => nav.navigate('SignIn')} />
      ) : inbox.isLoading ? (
        <View style={{ padding: 16, gap: 12 }}><SkeletonListingRow /><SkeletonListingRow /><SkeletonListingRow /></View>
      ) : inbox.isError && items.length === 0 ? (
        <EmptyState icon="wifi-off" title={t('deal.chat.loadFailedTitle')} body={t('deal.chat.loadFailedBody')} actionLabel={t('deal.retry')} onAction={() => void inbox.refetch()} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(c) => c.id}
          refreshControl={<RefreshControl refreshing={inbox.isRefetching} onRefresh={() => void inbox.refetch()} tintColor={colors.iconSecondary} />}
          ItemSeparatorComponent={() => <View style={s.sep} />}
          contentContainerStyle={{ flexGrow: 1 }}
          ListEmptyComponent={
            <EmptyState icon="message-circle" title={t('messages.empty')} body={t('messages.emptyHint')} actionLabel={t('deal.chat.emptyAction')} onAction={() => nav.navigate('Tabs', { screen: isProvider ? 'home' : 'browse' })} />
          }
          renderItem={({ item: c }) => {
            const text = messageText(t, c.last_message_kind, c.last_message_preview);
            const mine = c.last_message_mine && (c.last_message_kind ?? 'TEXT') === 'TEXT';
            return (
              <InboxRow
                name={displayName(c.other, t('common.user'))}
                avatarUri={c.other.profile_picture}
                listing={c.post_title ?? t('messages.deletedListing')}
                preview={mine ? t('deal.chat.youPrefix', { text }) : text}
                time={c.last_message_at ?? c.date_created}
                unread={c.unread}
                onPress={() => nav.navigate('Thread', { id: c.id, conversation: c })}
              />
            );
          }}
        />
      )}
    </View>
  );
}

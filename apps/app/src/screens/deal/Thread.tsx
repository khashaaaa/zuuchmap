import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, Text, TextInput, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { MESSAGE_MAX_LENGTH, formatDate, formatPriceParts, type Message } from '@zuuchmap/core';
import { themedStyles, useAppTheme } from '../../design/theme';
import { api, errorText } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { getBrowse } from '../../lib/browse';
import { setOpenThread } from '../../lib/notifications';
import { shortRange } from '../../lib/dates';
import { displayName, flattenMessages, messageText, replyText, useConversation, useMessages } from '../../lib/deal';
import { useCategories } from '../../lib/queries';
import { pushMessage } from '../../lib/realtime';
import type { Nav, RootStackParamList } from '../../nav';
import { AppHeader } from '../../ui/AppHeader';
import { Chip } from '../../ui/Chip';
import { EmptyState } from '../../ui/EmptyState';
import { Icon } from '../../ui/Icon';
import { IconButton } from '../../ui/IconButton';
import { KeyboardAvoider } from '../../ui/KeyboardAvoider';
import { MessageBubble } from '../../ui/MessageBubble';
import { useToast, useToastClearance } from '../../ui/Toast';
import { useLocale } from '../../ui/useLocale';

const useStyles = themedStyles((t) => ({
  screen: { flex: 1, backgroundColor: t.colors.bgCanvas },
  about: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 16, marginBottom: 8, padding: 10, borderRadius: t.radius.card, backgroundColor: t.colors.bgSurface, borderWidth: 1, borderColor: t.colors.borderSubtle },
  photo: { width: 56, height: 56, borderRadius: t.radius.lg, backgroundColor: t.colors.bgSurfaceSunken, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  aboutCap: { ...t.type.overline, color: t.colors.textSecondary },
  aboutTitle: { ...t.type.labelStrong, color: t.colors.textPrimary },
  aboutPrice: { ...t.type.caption, color: t.colors.textSecondary },
  list: { paddingHorizontal: 16, paddingVertical: 8 },
  day: { alignSelf: 'center', paddingHorizontal: 12, paddingVertical: 4, marginVertical: 8, borderRadius: 9999, backgroundColor: t.colors.bgSurfaceSunken },
  dayText: { ...t.type.small, color: t.colors.textSecondary },
  system: { ...t.type.small, color: t.colors.textSecondary, textAlign: 'center', alignSelf: 'center', marginVertical: 6, paddingHorizontal: 24 },
  meta: { ...t.type.small, color: t.colors.textSecondary, alignSelf: 'flex-end', marginTop: 2 },
  failed: { ...t.type.small, color: t.colors.statusDanger, alignSelf: 'flex-end', marginTop: 2 },
  firstBody: { ...t.type.caption, color: t.colors.textSecondary, textAlign: 'center' },
  quickCap: { ...t.type.overline, color: t.colors.textSecondary, textAlign: 'center' },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingTop: 8, paddingHorizontal: 12, backgroundColor: t.colors.bgSurface, borderTopWidth: 1, borderTopColor: t.colors.borderSubtle },
  input: { ...t.type.body, flex: 1, maxHeight: 120, minHeight: 44, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 10, borderRadius: 22, backgroundColor: t.colors.bgSurfaceSunken, color: t.colors.textPrimary },
}));

interface Pending { key: string; body: string; at: string; failed: boolean }

const DRAFT = (id: string) => `zm_draft_${id}`;
const dayKey = (iso: string) => {
  const d = new Date(iso);
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
};

type Row =
  | { kind: 'msg'; key: string; msg: Message; mine: boolean; read: boolean; lastRead: boolean }
  | { kind: 'pending'; key: string; p: Pending };

/** I2/M4/M5: one thread. Newest first in an inverted list; the composer sits in the keyboard avoider. */
export function Thread() {
  const s = useStyles();
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const locale = useLocale();
  const nav = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const clearance = useToastClearance();
  const qc = useQueryClient();
  const { user } = useAuth();
  const { params } = useRoute<RouteProp<RootStackParamList, 'Thread'>>();
  const id = params.id;
  const conv = useConversation(id, params.conversation).data;
  const msgs = useMessages(id);
  const categories = useCategories();
  const [pending, setPending] = useState<Pending[]>([]);
  const [draft, setDraft] = useState('');
  const draftLoaded = useRef(false);

  const messages = useMemo(() => flattenMessages(msgs.data?.pages), [msgs.data]);
  const post = conv?.post ?? null;
  const cat = categories.data?.find((c) => c.key === post?.category);
  const name = conv ? displayName(conv.other, t('common.user')) : '';

  // A message for the open thread is not announced as a notification.
  useEffect(() => {
    setOpenThread(id);
    return () => setOpenThread(null);
  }, [id]);

  // The draft survives leaving the thread.
  useEffect(() => {
    AsyncStorage.getItem(DRAFT(id)).then((v) => {
      if (v) setDraft((d) => d || v);
    }).catch(() => undefined).finally(() => {
      draftLoaded.current = true;
    });
  }, [id]);
  const setDraftSaved = (v: string) => {
    setDraft(v);
    if (draftLoaded.current) (v ? AsyncStorage.setItem(DRAFT(id), v) : AsyncStorage.removeItem(DRAFT(id))).catch(() => undefined);
  };

  // Mark read on open and whenever a new incoming message lands while the thread is open.
  const newestIncoming = messages.find((m) => m.sender_id !== null && m.sender_id !== user?.id && m.kind === 'TEXT')?.id;
  useEffect(() => {
    if (!msgs.isSuccess) return;
    api(`/conversations/${id}/read`, { method: 'PUT' })
      .then(() => {
        void qc.invalidateQueries({ queryKey: ['badges'] });
        void qc.invalidateQueries({ queryKey: ['conversations'] });
      })
      .catch(() => undefined);
  }, [id, msgs.isSuccess, newestIncoming, qc]);

  const send = useCallback(
    async (body: string, key?: string) => {
      const text = body.trim();
      if (!text) return;
      const k = key ?? `p${Date.now()}`;
      setPending((p) => (key ? p.map((x) => (x.key === key ? { ...x, failed: false } : x)) : [{ key: k, body: text, at: new Date().toISOString(), failed: false }, ...p]));
      try {
        const m = await api<Message>(`/conversations/${id}/messages`, { method: 'POST', body: { body: text } });
        pushMessage(qc, m);
        setPending((p) => p.filter((x) => x.key !== k));
        void qc.invalidateQueries({ queryKey: ['conversations'] });
      } catch (e) {
        setPending((p) => p.map((x) => (x.key === k ? { ...x, failed: true } : x)));
        toast.show({ message: errorText(e), kind: 'error' });
      }
    },
    [id, qc, toast],
  );

  const submit = () => {
    const text = draft;
    setDraftSaved('');
    void send(text);
  };

  // Rows, newest first, with "Уншсан" on the last own message the other side has read.
  const rows: Row[] = useMemo(() => {
    const out: Row[] = pending.map((p) => ({ kind: 'pending', key: p.key, p }));
    const lastOwn = messages.find((m) => m.kind === 'TEXT' && m.sender_id === user?.id);
    for (const m of messages) out.push({ kind: 'msg', key: m.id, msg: m, mine: m.kind === 'TEXT' && m.sender_id === user?.id, read: !!m.read_at, lastRead: m === lastOwn && !!m.read_at });
    return out;
  }, [messages, pending, user?.id]);

  const stampOf = (r: Row) => (r.kind === 'msg' ? r.msg.date_created : r.p.at);
  const dayLabel = (iso: string) => {
    const k = dayKey(iso);
    const now = new Date();
    if (k === dayKey(now.toISOString())) return t('deal.chat.today');
    const y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    if (k === dayKey(y.toISOString())) return t('deal.chat.yesterday');
    return formatDate(iso, locale);
  };

  const empty = msgs.isSuccess && messages.length === 0 && pending.length === 0;
  const browse = getBrowse();
  const quick: string[] = [];
  if (empty) {
    quick.push(browse.date_from && browse.date_to ? t('deal.chat.qDates', { dates: shortRange(browse.date_from, browse.date_to, locale) }) : t('deal.chat.qAvailable'));
    if (cat?.rentable) quick.push(t('deal.chat.qOperator'), t('deal.chat.qDelivery'));
  }
  const parts = post && post.price_amount !== null ? formatPriceParts(post.price_amount, post.price_unit, locale) : null;
  const photo = post?.images?.[0];

  const listing = post || conv?.post_title ? (
    <Pressable
      accessibilityRole="button"
      disabled={!post}
      onPress={() => post && nav.navigate('ListingDetail', { id: post.id, item: post })}
      style={s.about}
    >
      <View style={s.photo}>
        {photo ? <Image source={{ uri: photo }} style={{ width: '100%', height: '100%' }} accessibilityIgnoresInvertColors /> : <Icon name={cat?.icon ?? 'package'} categoryKey={post?.category} size={24} color={colors.iconSecondary} />}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={s.aboutCap}>{t('messages.aboutListing')}</Text>
        <Text style={s.aboutTitle} numberOfLines={2}>{post?.title ?? conv?.post_title ?? t('messages.deletedListing')}</Text>
        {parts ? <Text style={s.aboutPrice}>{parts.unit ? `${parts.amount} / ${parts.unit}` : parts.amount}</Text> : null}
      </View>
      {post ? <Icon name="chevron-right" size={20} color={colors.iconSecondary} /> : null}
    </Pressable>
  ) : null;

  return (
    <View style={s.screen}>
      <AppHeader
        variant="chat"
        name={name}
        avatarUri={conv?.other.profile_picture}
        replyText={replyText(t, conv?.other.reply_minutes)}
        onBack={() => nav.goBack()}
        action={conv?.other.id ? { icon: 'user', label: name, onPress: () => nav.navigate('Seller', { id: conv.other.id }) } : undefined}
      />
      <KeyboardAvoider>
        {listing}
        <View style={{ flex: 1 }}>
          {msgs.isLoading ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={colors.iconSecondary} /></View>
          ) : msgs.isError && messages.length === 0 ? (
            <EmptyState icon="wifi-off" title={t('deal.chat.loadFailedTitle')} body={t('deal.chat.loadFailedBody')} actionLabel={t('deal.retry')} onAction={() => void msgs.refetch()} />
          ) : empty ? (
            <View style={{ flex: 1, justifyContent: 'center', gap: 12, paddingHorizontal: 24 }}>
              <Text accessibilityRole="header" style={[s.aboutTitle, { textAlign: 'center' }]}>{t('deal.chat.firstTitle')}</Text>
              <Text style={s.firstBody}>{t('deal.chat.firstBody')}</Text>
              <Text style={s.quickCap}>{t('deal.chat.quick')}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 }}>
                {quick.map((q) => <Chip key={q} label={q} onPress={() => void send(q)} />)}
              </View>
            </View>
          ) : (
            <FlatList
              inverted
              data={rows}
              keyExtractor={(r) => r.key}
              contentContainerStyle={s.list}
              keyboardShouldPersistTaps="handled"
              onEndReachedThreshold={0.4}
              onEndReached={() => {
                if (msgs.hasNextPage && !msgs.isFetchingNextPage) void msgs.fetchNextPage();
              }}
              ListFooterComponent={
                msgs.hasNextPage ? (
                  <Pressable accessibilityRole="button" onPress={() => void msgs.fetchNextPage()} style={{ alignSelf: 'center', padding: 12 }}>
                    {msgs.isFetchingNextPage ? <ActivityIndicator color={colors.iconSecondary} /> : <Text style={s.dayText}>{t('messages.loadOlder')}</Text>}
                  </Pressable>
                ) : null
              }
              renderItem={({ item: r, index }) => {
                const older = rows[index + 1];
                const sep = !older || dayKey(stampOf(older)) !== dayKey(stampOf(r));
                return (
                  <View>
                    {sep ? <View style={s.day}><Text style={s.dayText}>{dayLabel(stampOf(r))}</Text></View> : null}
                    {r.kind === 'pending' ? (
                      <View style={{ marginTop: 6 }}>
                        <MessageBubble direction="out" text={r.p.body} time={r.p.at} status="sending" />
                        {r.p.failed ? (
                          <Pressable accessibilityRole="button" onPress={() => void send(r.p.body, r.p.key)}>
                            <Text style={s.failed}>{t('messages.retry')}</Text>
                          </Pressable>
                        ) : null}
                      </View>
                    ) : r.msg.kind !== 'TEXT' ? (
                      <Text style={s.system}>{messageText(t, r.msg.kind, r.msg.body)}</Text>
                    ) : (
                      <View style={{ marginTop: 6 }}>
                        <MessageBubble direction={r.mine ? 'out' : 'in'} text={r.msg.body} time={r.msg.date_created} status={r.read ? 'read' : 'sent'} />
                        {r.lastRead ? <Text style={s.meta}>{t('deal.chat.read')}</Text> : null}
                      </View>
                    )}
                  </View>
                );
              }}
            />
          )}
        </View>
        <View style={[s.composer, { paddingBottom: 8 + insets.bottom }]} onLayout={clearance}>
          <TextInput
            value={draft}
            onChangeText={setDraftSaved}
            placeholder={t('messages.placeholder')}
            placeholderTextColor={colors.textTertiary}
            multiline
            maxLength={MESSAGE_MAX_LENGTH}
            selectionColor={colors.borderFocus}
            cursorColor={colors.borderFocus}
            accessibilityLabel={t('messages.placeholder')}
            style={s.input}
          />
          <IconButton icon="send" label={t('messages.send')} variant="primary" disabled={!draft.trim()} onPress={submit} />
        </View>
      </KeyboardAvoider>
    </View>
  );
}

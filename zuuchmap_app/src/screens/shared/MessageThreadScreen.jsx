import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    View, Text, FlatList, TextInput, TouchableOpacity,
    Platform, StyleSheet, Keyboard, ActivityIndicator, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { spacing, typography, radius, isTablet, interactions } from '../../design/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '../../hooks/useAppTheme';
import { usePullRefresh } from '../../hooks/usePullRefresh';
import CustomSafeAreaView from '../../components/CustomSafeAreaView';
import KeyboardAvoider from '../../components/KeyboardAvoider';
import ScreenHeader from '../../components/ScreenHeader';
import ScreenError from '../../components/ScreenError';
import messageService, {
    CONVERSATIONS_KEY, UNREAD_KEY, messagesKey, threadKey, flattenMessages, messageCursor,
} from '../../services/api/messageService';
import { showErrorModal } from '../../utils/errorManager';
import { maybeAskForPush } from '../../utils/pushPrompt';
import { formatDate, formatTime } from '../../utils/displayUtils';


/** Page 0 is the newest page — that is where the live tail (and optimistic rows) live. */
const patchNewest = (old, fn) => {
    if (!old) return old;
    const pages = [...old.pages];
    pages[0] = fn(pages[0] ?? []);
    return { ...old, pages };
};

/**
 * One conversation.
 *
 * Sends are optimistic: on a Mongolian mobile connection the round trip is long
 * enough that a message which only appears after the server answers reads as
 * one that failed, and people send it twice.
 */
const MessageThreadScreen = ({ navigation, route }) => {
    const { id, title } = route.params ?? {};
    const { colors, isDark } = useAppTheme();
    const insets = useSafeAreaInsets();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const { t } = useTranslation();
    const qc = useQueryClient();
    const [draft, setDraft] = useState('');
    // The navigation-bar inset under the composer only applies while the
    // keyboard is down; with it up the keyboard covers the bar, and keeping the
    // inset pushed the composer's lower edge under the keyboard.
    const [keyboardUp, setKeyboardUp] = useState(false);
    useEffect(() => {
        const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardUp(true));
        const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardUp(false));
        return () => { show.remove(); hide.remove(); };
    }, []);

    // The inbox row is this same object. Arriving from the inbox it is already
    // in cache, so the header paints with it and — while that list is fresh —
    // the detail request is not made at all.
    const { data: thread } = useQuery({
        queryKey: threadKey(id),
        queryFn: () => messageService.detail(id),
        enabled: Boolean(id),
        initialData: () => qc.getQueryData(CONVERSATIONS_KEY)?.pages?.flat().find((c) => c.id === id),
        initialDataUpdatedAt: () => qc.getQueryState(CONVERSATIONS_KEY)?.dataUpdatedAt,
    });

    const {
        data, isLoading, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage,
    } = useInfiniteQuery({
        queryKey: messagesKey(id),
        queryFn: ({ pageParam }) => messageService.history(id, pageParam),
        initialPageParam: undefined,
        getNextPageParam: messageCursor,
        enabled: Boolean(id),
    });
    const messages = useMemo(() => flattenMessages(data?.pages), [data]);
    const [pulling, onPull] = usePullRefresh(refetch);

    // Clearing the badge touches the reader's own side only, and the endpoint
    // is idempotent — safe to call on every open, and again whenever a new
    // message from the other side lands while the thread is on screen;
    // otherwise the badge stays lit for a message the reader is looking at.
    const latestTheirs = useMemo(
        () => [...messages].reverse().find((m) => !m.mine && !m.pending)?.id ?? null,
        [messages]
    );
    useEffect(() => {
        if (!id) return;
        messageService
            .markRead(id)
            .then(() => {
                qc.invalidateQueries({ queryKey: CONVERSATIONS_KEY });
                qc.invalidateQueries({ queryKey: UNREAD_KEY });
            })
            .catch(() => { });
    }, [id, latestTheirs, qc]);

    // Newest first, rendered into an inverted list.
    //
    // A chat list has to open at its newest message, and a normal FlatList
    // cannot be made to do that reliably: it reports its content size several
    // times while it measures rows in batches, so a `scrollToEnd` lands
    // wherever the measurement happened to be, and `maintainVisibleContentPosition`
    // — needed so prepending older history does not jump — actively undoes the
    // scroll by anchoring the top row. Both together left a 34-message thread
    // parked near its top: you opened a conversation and saw its oldest page,
    // and sending a message scrolled nowhere near the bubble you had just
    // added. Inverting turns "scroll to the bottom" into "render index 0",
    // which needs no scrolling and cannot drift, and turns loading older
    // history into an append that never moves the viewport.
    const ordered = useMemo(() => [...messages].reverse(), [messages]);

    const send = useMutation({
        mutationFn: ({ body }) => messageService.send(id, body),
        onMutate: async ({ body, tempId }) => {
            await qc.cancelQueries({ queryKey: messagesKey(id) });
            qc.setQueryData(messagesKey(id), (old) =>
                patchNewest(old ?? { pages: [[]], pageParams: [undefined] }, (page) => [
                    ...page.filter((m) => m.id !== tempId),
                    { id: tempId, body, mine: true, pending: true, date_created: new Date().toISOString() },
                ])
            );
        },
        onError: (_e, { tempId }) => {
            // Keep the bubble, flagged failed and tappable to retry — discarding
            // it is how a message ends up typed twice.
            qc.setQueryData(messagesKey(id), (old) =>
                patchNewest(old, (page) =>
                    page.map((m) => (m.id === tempId ? { ...m, pending: false, failed: true } : m))
                )
            );
            showErrorModal(t('common.error'), t('messages.failed'));
        },
        // The response is the stored message: swap it in for the pending
        // bubble. Invalidating instead refetched every page of history the
        // reader had scrolled back through, to learn the one row just returned.
        onSuccess: (saved, { tempId }) => {
            qc.setQueryData(messagesKey(id), (old) =>
                patchNewest(old, (page) => [
                    ...page.filter((m) => m.id !== tempId && m.id !== saved?.id),
                    ...(saved ? [saved] : []),
                ])
            );
            qc.invalidateQueries({ queryKey: CONVERSATIONS_KEY });
            // A reply is coming and it is worth nothing if it arrives unseen.
            // Asks once, ever, and only if the OS will still show the dialog.
            maybeAskForPush('push.reasonMessage');
        },
    });

    const submit = useCallback(() => {
        const body = draft.trim();
        if (!body) return;
        setDraft('');
        send.mutate({ body, tempId: `pending-${Date.now()}` });
    }, [draft, send]);

    const retry = useCallback((m) => send.mutate({ body: m.body, tempId: m.id }), [send]);

    // A bubble carries the time only, so a thread that spans days needs the
    // day said once, above the first message of each — without it an August
    // conversation read 00:14 → 21:38 → 17:55 → 00:49 and looked out of order.
    // `ordered` is newest-first, so the message *above* a row is index + 1.
    const renderItem = ({ item, index }) => {
        const day = formatDate(item.date_created);
        const above = ordered[index + 1];
        const startsDay = !above || formatDate(above.date_created) !== day;
        return (
        <View>
        {startsDay && <Text style={styles.daySeparator}>{day}</Text>}
        <View style={[styles.bubbleRow, item.mine ? styles.bubbleRowMine : styles.bubbleRowTheirs]}>
            <TouchableOpacity
                disabled={!item.failed}
                onPress={() => retry(item)}
                activeOpacity={interactions.activeOpacityLight}
                accessibilityRole={item.failed ? 'button' : undefined}
                accessibilityLabel={item.failed ? t('messages.retry') : undefined}
                style={[
                    styles.bubble,
                    item.mine
                        ? { backgroundColor: colors.primary }
                        : { backgroundColor: colors.surfaceElevated },
                    item.pending && { opacity: 0.6 },
                    item.failed && { opacity: 0.6, borderWidth: 1.5, borderColor: colors.danger },
                ]}
            >
                <Text style={[styles.bubbleText, { color: item.mine ? colors.onPrimary : colors.text.primary }]}>
                    {item.body}
                </Text>
                <Text style={[styles.bubbleTime, { color: item.mine ? colors.onPrimary : colors.text.tertiary }]}>
                    {item.failed ? t('messages.retry') : item.pending ? t('messages.sending') : formatTime(item.date_created)}
                </Text>
            </TouchableOpacity>
        </View>
        </View>
        );
    };

    const loadOlder = hasNextPage && !isLoading ? (
        <TouchableOpacity activeOpacity={interactions.activeOpacity}
            onPress={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            hitSlop={interactions.hitSlop}
            accessibilityRole="button"
            style={[styles.loadOlder, isFetchingNextPage && { opacity: 0.5 }]}
        >
            <Text style={styles.loadOlderText}>{t('messages.loadOlder')}</Text>
        </TouchableOpacity>
    ) : null;

    return (
        <CustomSafeAreaView
            backgroundColor={colors.background}
            statusBarColor={colors.surface}
            statusBarStyle={isDark ? 'light-content' : 'dark-content'}
        >
            {/* ScreenHeader takes a single title, so the listing this thread is
                about is shown on its own line below rather than invented as a
                new header prop. */}
            <ScreenHeader
                title={title || thread?.other_party?.given_name || t('messages.title')}
                onBack={() => navigation.goBack()}
            />
            {/* A link to the listing, as on the web: it is where the review
                form is, and a chat is how most customers earn one. */}
            {thread && (thread.post ? (
                <TouchableOpacity
                    activeOpacity={interactions.activeOpacityLight}
                    accessibilityRole="link"
                    hitSlop={interactions.hitSlop}
                    onPress={() => navigation.navigate('PostDetailScreen', {
                        postId: thread.post.id,
                        role: thread.role === 'PROVIDER' ? 'provider' : 'customer',
                    })}
                >
                    <Text style={[styles.aboutListing, { color: colors.text.link }]} numberOfLines={1}>
                        {thread.post.title}
                    </Text>
                </TouchableOpacity>
            ) : (
                <Text style={styles.aboutListing} numberOfLines={1}>
                    {t('messages.deletedListing')}
                </Text>
            ))}

            {/* Shrinking the view (rather than letting app.json's "pan" mode
                slide the window) keeps the header on screen and the whole
                thread scrollable above the composer. */}
            <KeyboardAvoider style={styles.flex} iosOffset={90}>
                {isError ? (
                    <ScreenError onRetry={refetch} />
                ) : isLoading ? (
                    // The first load had only the list's refresh puck: untinted,
                    // and — the list being inverted — drawn at the bottom over
                    // the composer, under an otherwise empty screen.
                    <View style={styles.loading}>
                        <ActivityIndicator size="large" color={colors.iconAccent} />
                    </View>
                ) : (
                    <FlatList
                        inverted
                        data={ordered}
                        renderItem={renderItem}
                        keyExtractor={(item) => String(item.id)}
                        contentContainerStyle={styles.list}
                        // Inverted, so the footer is what the reader sees at
                        // the top of the thread.
                        ListFooterComponent={loadOlder}
                        refreshControl={
                            <RefreshControl refreshing={pulling} onRefresh={onPull} tintColor={colors.iconAccent} colors={[colors.iconAccent]} progressBackgroundColor={colors.surface} />
                        }
                    />
                )}

                {/* `edgeToEdgeEnabled` puts the app behind the Android
                    navigation bar, so a pinned footer has to hold its own
                    inset — without this the composer sat *under* the nav
                    buttons and the input could not be tapped at all. */}
                <View style={[styles.composer, { paddingBottom: keyboardUp ? spacing.md : Math.max(insets.bottom, spacing.md) }]}>
                    <View style={styles.composerInner}>
                    <TextInput
                        style={styles.input}
                        value={draft}
                        onChangeText={setDraft}
                        placeholder={t('messages.placeholder')}
                        placeholderTextColor={colors.text.placeholder}
                        maxLength={2000}
                        multiline
                        accessibilityLabel={t('messages.placeholder')}
                    />
                    <TouchableOpacity
                        onPress={submit}
                        disabled={!draft.trim() || send.isPending}
                        hitSlop={interactions.hitSlop}
                        activeOpacity={interactions.activeOpacityLight}
                        accessibilityRole="button"
                        accessibilityLabel={t('messages.send')}
                        style={[
                            styles.sendBtn,
                            { backgroundColor: colors.primary },
                            (!draft.trim() || send.isPending) && { opacity: 0.5 },
                        ]}
                    >
                        <Ionicons name="send" size={16} color={colors.onPrimary} />
                    </TouchableOpacity>
                    </View>
                </View>
            </KeyboardAvoider>
        </CustomSafeAreaView>
    );
};

const createStyles = (colors) => StyleSheet.create({
    flex: { flex: 1 },
    loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    aboutListing: {
        ...typography.styles.caption,
        color: colors.text.tertiary,
        paddingHorizontal: spacing.lg,
        paddingBottom: spacing.xs,
    },
    list: {
        padding: spacing.lg,
        gap: spacing.xs,
        ...(isTablet ? { maxWidth: 680, alignSelf: 'center', width: '100%' } : {}),
    },
    bubbleRow: { flexDirection: 'row' },
    bubbleRowMine: { justifyContent: 'flex-end' },
    bubbleRowTheirs: { justifyContent: 'flex-start' },
    bubble: {
        maxWidth: '80%',
        borderRadius: radius.card,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        gap: spacing.xxs,
    },
    daySeparator: { ...typography.styles.micro, color: colors.text.tertiary, alignSelf: 'center', paddingVertical: spacing.sm },
    loadOlder: { alignSelf: 'center', paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
    loadOlderText: { ...typography.styles.label, color: colors.text.link },
    bubbleText: { ...typography.styles.body },
    bubbleTime: { ...typography.styles.micro },
    composer: {
        padding: spacing.md,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: colors.border.light,
        backgroundColor: colors.surface,
    },
    // Same column as `list` (its padding is lg, ours md — hence the correction),
    // or the input row runs the full tablet width under a 680 thread.
    composerInner: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap: spacing.sm,
        ...(isTablet ? { maxWidth: 680 - 2 * (spacing.lg - spacing.md), alignSelf: 'center', width: '100%' } : {}),
    },
    input: {
        flex: 1,
        maxHeight: 120,

        minHeight: 42,
        borderRadius: radius.button,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        backgroundColor: colors.surfaceElevated,
        color: colors.text.primary,
        ...typography.styles.body,
    },
    sendBtn: {
        width: 42, height: 42, borderRadius: radius.pill,
        alignItems: 'center', justifyContent: 'center',
    },
});

export default MessageThreadScreen;

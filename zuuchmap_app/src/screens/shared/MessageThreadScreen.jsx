import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    View, Text, FlatList, TextInput, TouchableOpacity,
    KeyboardAvoidingView, Platform, StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { spacing, typography, radius, isTablet, interactions } from '../../design/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '../../hooks/useAppTheme';
import CustomSafeAreaView from '../../components/CustomSafeAreaView';
import ScreenHeader from '../../components/ScreenHeader';
import ScreenError from '../../components/ScreenError';
import messageService, {
    CONVERSATIONS_KEY, UNREAD_KEY, messagesKey, threadKey, flattenMessages, messageCursor,
} from '../../services/api/messageService';
import { showErrorModal } from '../../utils/errorManager';
import { maybeAskForPush } from '../../utils/pushPrompt';

const pad = (n) => String(n).padStart(2, '0');
/** Built by hand — RN's JSC has no full ICU on Android, so Intl silently falls back to en-US there. */
const clock = (value) => {
    const d = new Date(value);
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

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

    const { data: thread } = useQuery({
        queryKey: threadKey(id),
        queryFn: () => messageService.detail(id),
        enabled: Boolean(id),
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
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: messagesKey(id) });
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

    const renderItem = ({ item }) => (
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
                    {item.failed ? t('messages.retry') : item.pending ? t('messages.sending') : clock(item.date_created)}
                </Text>
            </TouchableOpacity>
        </View>
    );

    const loadOlder = hasNextPage && !isLoading ? (
        <TouchableOpacity
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
            {thread && (
                <Text style={styles.aboutListing} numberOfLines={1}>
                    {thread.post?.title || t('messages.deletedListing')}
                </Text>
            )}

            <KeyboardAvoidingView
                style={styles.flex}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                // Android resizes the window itself; adding an offset there
                // double-counts the keyboard and leaves a gap under the input.
                keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
            >
                {isError ? (
                    <ScreenError onRetry={refetch} />
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
                        refreshing={isLoading}
                        onRefresh={refetch}
                    />
                )}

                {/* `edgeToEdgeEnabled` puts the app behind the Android
                    navigation bar, so a pinned footer has to hold its own
                    inset — without this the composer sat *under* the nav
                    buttons and the input could not be tapped at all. */}
                <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
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
            </KeyboardAvoidingView>
        </CustomSafeAreaView>
    );
};

const createStyles = (colors) => StyleSheet.create({
    flex: { flex: 1 },
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
        width: 42, height: 42, borderRadius: radius.full,
        alignItems: 'center', justifyContent: 'center',
    },
});

export default MessageThreadScreen;

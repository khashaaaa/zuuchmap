import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    View, Text, FlatList, TextInput, TouchableOpacity,
    KeyboardAvoidingView, Platform, StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { spacing, typography, radius, isTablet, interactions } from '../../design/theme';
import { useAppTheme } from '../../hooks/useAppTheme';
import CustomSafeAreaView from '../../components/CustomSafeAreaView';
import ScreenHeader from '../../components/ScreenHeader';
import ScreenError from '../../components/ScreenError';
import messageService, { CONVERSATIONS_KEY, UNREAD_KEY, messagesKey, threadKey } from '../../services/api/messageService';
import { showErrorModal } from '../../utils/errorManager';

const pad = (n) => String(n).padStart(2, '0');
/** Built by hand — RN's JSC has no full ICU on Android, so Intl silently falls back to en-US there. */
const clock = (value) => {
    const d = new Date(value);
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
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
    const styles = useMemo(() => createStyles(colors), [colors]);
    const { t } = useTranslation();
    const qc = useQueryClient();
    const [draft, setDraft] = useState('');
    const listRef = useRef(null);

    const { data: thread } = useQuery({
        queryKey: threadKey(id),
        queryFn: () => messageService.detail(id),
        enabled: Boolean(id),
    });

    const { data: messages = [], isLoading, isError, refetch } = useQuery({
        queryKey: messagesKey(id),
        queryFn: () => messageService.history(id),
        enabled: Boolean(id),
    });

    // Clearing the badge touches the reader's own side only, and the endpoint
    // is idempotent — safe to call on every open.
    useEffect(() => {
        if (!id) return;
        messageService
            .markRead(id)
            .then(() => {
                qc.invalidateQueries({ queryKey: CONVERSATIONS_KEY });
                qc.invalidateQueries({ queryKey: UNREAD_KEY });
            })
            .catch(() => { });
    }, [id, qc]);

    const send = useMutation({
        mutationFn: (body) => messageService.send(id, body),
        onMutate: async (body) => {
            await qc.cancelQueries({ queryKey: messagesKey(id) });
            const previous = qc.getQueryData(messagesKey(id));
            qc.setQueryData(messagesKey(id), (old = []) => [
                ...old,
                { id: `pending-${Date.now()}`, body, mine: true, pending: true, date_created: new Date().toISOString() },
            ]);
            return { previous };
        },
        onError: (_e, body, context) => {
            // Put the text back in the box rather than leaving a message that
            // looks sent but never was.
            qc.setQueryData(messagesKey(id), context?.previous);
            setDraft(body);
            showErrorModal(t('common.error'), t('messages.failed'));
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: messagesKey(id) });
            qc.invalidateQueries({ queryKey: CONVERSATIONS_KEY });
        },
    });

    const submit = useCallback(() => {
        const body = draft.trim();
        if (!body) return;
        setDraft('');
        send.mutate(body);
    }, [draft, send]);

    const renderItem = ({ item }) => (
        <View style={[styles.bubbleRow, item.mine ? styles.bubbleRowMine : styles.bubbleRowTheirs]}>
            <View
                style={[
                    styles.bubble,
                    item.mine
                        ? { backgroundColor: colors.primary }
                        : { backgroundColor: colors.surfaceElevated },
                    item.pending && { opacity: 0.6 },
                ]}
            >
                <Text style={[styles.bubbleText, { color: item.mine ? colors.onPrimary : colors.text.primary }]}>
                    {item.body}
                </Text>
                <Text style={[styles.bubbleTime, { color: item.mine ? colors.onPrimary : colors.text.tertiary }]}>
                    {item.pending ? t('messages.sending') : clock(item.date_created)}
                </Text>
            </View>
        </View>
    );

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
                        ref={listRef}
                        data={messages}
                        renderItem={renderItem}
                        keyExtractor={(item) => String(item.id)}
                        contentContainerStyle={styles.list}
                        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
                        refreshing={isLoading}
                        onRefresh={refetch}
                    />
                )}

                <View style={styles.composer}>
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
    bubbleText: { ...typography.styles.body },
    bubbleTime: { ...typography.styles.micro },
    composer: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap: spacing.sm,
        padding: spacing.md,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: colors.border.light,
        backgroundColor: colors.surface,
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

import React, { useCallback, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { View, Text, FlatList, TouchableOpacity, RefreshControl, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { spacing, typography, radius, interactions, isTablet } from '../../design/theme';
import { useAppTheme } from '../../hooks/useAppTheme';
import { ScreenLayout, EmptyState, SkeletonItem, SelectionPop } from '../../components';
import Button from '../../components/Button';
import TextInput from '../../components/TextInput';
import reportService, { REPORTS_KEY } from '../../services/api/reportService';
import { invalidatePostData } from '../../services/queryClient';
import { formatDateTime } from '../../utils/displayUtils';
import { showErrorModal, getErrorMessage } from '../../utils/errorManager';
import { useListBottomPadding } from '../../hooks/useListBottomPadding';

const TABS = ['OPEN', 'RESOLVED', 'DISMISSED'];
const PAGE_SIZE = 50;

/**
 * The moderation queue for reports users filed on live listings — the app
 * counterpart of the web's AdminReports. Oldest first, same as pending posts.
 * Paged: a single 50-row fetch left everything past the oldest fifty
 * unreachable. A report is about a listing or a review; `subject` is what it
 * read as when filed, so the card still reads after the owner deleted it.
 */
const AdminReports = ({ navigation }) => {
    const insets = useSafeAreaInsets();
    const listBottom = useListBottomPadding();
    const { colors } = useAppTheme();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const { t } = useTranslation();
    const qc = useQueryClient();
    const [tab, setTab] = useState('OPEN');
    const [notes, setNotes] = useState({});

    const { data, isLoading, isRefetching, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
        queryKey: [...REPORTS_KEY, tab],
        queryFn: ({ pageParam }) => reportService.list({ status: tab, page: pageParam, limit: PAGE_SIZE }),
        initialPageParam: 1,
        getNextPageParam: (last, pages) =>
            pages.reduce((n, p) => n + p.items.length, 0) < last.total ? pages.length + 1 : undefined,
        staleTime: 30 * 1000,
    });
    useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

    const resolveMut = useMutation({
        mutationFn: ({ id, status, takeDown }) => reportService.resolve(id, status, notes[id]?.trim() || undefined, takeDown),
        onSuccess: (_, { takeDown }) => {
            qc.invalidateQueries({ queryKey: REPORTS_KEY });
            if (takeDown) {
                qc.invalidateQueries({ queryKey: ['reviews'] });
                invalidatePostData();
            }
        },
        onError: (error) => showErrorModal(t('common.error'), getErrorMessage(error)),
    });

    const items = data?.pages.flatMap((p) => p.items) ?? [];
    const total = data?.pages[0]?.total ?? 0;

    const renderItem = useCallback(({ item }) => (
        <View style={[styles.card, colors.elevation.sm]}>
            <View style={styles.cardHead}>
                <Text style={styles.reason}>{t(`report.reasons.${item.reason}`)}</Text>
                <Text style={styles.date}>{formatDateTime(item.date_created)}</Text>
            </View>
            {item.kind === 'REVIEW' ? (
                <View style={styles.reviewSubject}>
                    <Text style={styles.muted}>{t('report.kindReview')}</Text>
                    {item.review ? (
                        <>
                            <View style={styles.ratingRow}>
                                <Text style={styles.detail}>{item.review.rating}</Text>
                                <Ionicons name="star" size={12} color={colors.warning} />
                            </View>
                            <Text style={styles.detail}>{item.review.comment || '—'}</Text>
                        </>
                    ) : (
                        <Text style={styles.muted}>{t('report.subjectGone')} · {item.subject || '—'}</Text>
                    )}
                </View>
            ) : item.post ? (
                <TouchableOpacity
                    onPress={() => navigation.navigate('PostDetailScreen', { postId: item.post.id, role: 'admin' })}
                    activeOpacity={interactions.activeOpacity}
                    hitSlop={{ top: 6, bottom: 6 }}
                >
                    <Text style={styles.postLink} numberOfLines={1}>#{item.post.id} · {item.post.title || '—'}</Text>
                </TouchableOpacity>
            ) : (
                <Text style={styles.muted} numberOfLines={1}>{t('report.subjectGone')} · {item.subject || '—'}</Text>
            )}
            {!!item.detail && <Text style={styles.detail}>{item.detail}</Text>}
            <Text style={styles.muted}>
                {t('report.reporter')}: {item.reporter?.phone_number ?? '—'} · {t('report.against')}: {item.owner?.phone_number ?? '—'}
            </Text>

            {tab === 'OPEN' ? (
                <View style={styles.actions}>
                    <TextInput
                        value={notes[item.id] ?? ''}
                        onChangeText={(v) => setNotes((n) => ({ ...n, [item.id]: v.slice(0, 500) }))}
                        placeholder={t('report.resolutionPlaceholder')}
                    />
                    {(item.post || item.review) && (
                        <Button
                            title={item.post ? t('report.takeDownPost') : t('report.takeDownReview')}
                            size="sm"
                            variant="danger"
                            onPress={() => resolveMut.mutate({ id: item.id, status: 'RESOLVED', takeDown: true })}
                            disabled={resolveMut.isPending}
                        />
                    )}
                    <View style={styles.buttons}>
                        <Button
                            title={t('report.resolve')}
                            size="sm"
                            onPress={() => resolveMut.mutate({ id: item.id, status: 'RESOLVED' })}
                            disabled={resolveMut.isPending}
                            style={styles.button}
                        />
                        <Button
                            title={t('report.dismiss')}
                            size="sm"
                            variant="secondary"
                            onPress={() => resolveMut.mutate({ id: item.id, status: 'DISMISSED' })}
                            disabled={resolveMut.isPending}
                            style={styles.button}
                        />
                    </View>
                </View>
            ) : (
                !!item.resolution && <Text style={styles.resolution}>{item.resolution}</Text>
            )}
        </View>
    ), [styles, colors, t, tab, notes, resolveMut, navigation]);

    return (
        <ScreenLayout
            title={t('report.queue')}
            showBack={false}
            error={isError}
            onRetry={refetch}
        >
            <View style={styles.tabs} accessibilityRole="tablist">
                {TABS.map((value) => (
                    <SelectionPop key={value} selected={tab === value}>
                        <TouchableOpacity
                            style={[
                                styles.tab,
                                { borderColor: colors.border.light },
                                tab === value && { borderColor: colors.primary, backgroundColor: colors.opacity.background.primary },
                            ]}
                            onPress={() => setTab(value)}
                            activeOpacity={interactions.activeOpacity}
                            accessibilityRole="tab"
                            accessibilityState={{ selected: tab === value }}
                        >
                            <Text style={[styles.tabText, { color: tab === value ? colors.text.link : colors.text.secondary }]}>
                                {t(`report.status.${value}`)}
                                {value === 'OPEN' && tab === 'OPEN' && total > 0 ? ` · ${total}` : ''}
                            </Text>
                        </TouchableOpacity>
                    </SelectionPop>
                ))}
            </View>

            {isLoading ? (
                <View style={styles.list}>
                    {[0, 1, 2].map((i) => <SkeletonItem key={i} style={{ marginBottom: spacing.md }} />)}
                </View>
            ) : (
                <FlatList
                    data={items}
                    keyExtractor={(item) => String(item.id)}
                    renderItem={renderItem}
                    contentContainerStyle={[styles.list, { paddingBottom: listBottom }]}
                    refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.iconAccent} />}
                    ListEmptyComponent={<EmptyState icon="flag-outline" title={t('report.queueEmpty')} />}
                    onEndReached={() => { if (hasNextPage && !isFetchingNextPage) fetchNextPage(); }}
                    onEndReachedThreshold={0.5}
                    ListFooterComponent={hasNextPage ? (
                        <Button
                            title={t('report.loadMore')}
                            variant="secondary"
                            size="sm"
                            onPress={() => fetchNextPage()}
                            loading={isFetchingNextPage}
                        />
                    ) : null}
                    keyboardShouldPersistTaps="handled"
                />
            )}
        </ScreenLayout>
    );
};

const createStyles = (colors) => StyleSheet.create({
    tabs: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border.light },
    tab: { height: 36, paddingHorizontal: spacing.md, borderRadius: radius.pill, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
    tabText: { ...typography.styles.label, includeFontPadding: false },
    list: { padding: spacing.lg, maxWidth: isTablet ? 720 : undefined, alignSelf: isTablet ? 'center' : 'stretch', width: '100%' },
    card: { backgroundColor: colors.surface, borderRadius: radius.card, padding: spacing.md, marginBottom: spacing.md, gap: spacing.xs },
    cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.sm },
    reason: { ...typography.styles.title, color: colors.text.primary, flex: 1 },
    date: { ...typography.styles.small, color: colors.text.tertiary },
    postLink: { ...typography.styles.label, color: colors.text.link },
    detail: { ...typography.styles.body, color: colors.text.primary },
    muted: { ...typography.styles.small, color: colors.text.tertiary },
    resolution: { ...typography.styles.caption, color: colors.text.secondary, fontStyle: 'italic' },
    actions: { marginTop: spacing.sm, gap: spacing.sm },
    buttons: { flexDirection: 'row', gap: spacing.sm },
    button: { flex: 1 },
    reviewSubject: { gap: spacing.xxs },
    ratingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxs },
});

export default AdminReports;

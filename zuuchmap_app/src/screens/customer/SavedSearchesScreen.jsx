import React, { useMemo, useCallback, useState } from 'react';
import { View, Text, FlatList, RefreshControl, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { spacing, typography, radius, isTablet, interactions } from '../../design/theme';
import { useAppTheme } from '../../hooks/useAppTheme';
import ScreenError from '../../components/ScreenError';
import { ScreenLayout, EmptyState, SkeletonItem, PressableScale } from '../../components';
import { SkeletonCrossfade } from '../../components/SkeletonItem';
import { useSavedSearchSummary } from '../../components/SavedSearchSheet';
import savedSearchService, { SAVED_SEARCHES_KEY } from '../../services/api/savedSearchService';
import { showErrorModal, showWarningModal, getErrorMessage } from '../../utils/errorManager';
import { formatDate } from '../../utils/displayUtils';

const SavedSearchRow = ({ item, index, onOpen, onDelete, deleting, styles, colors, t }) => {
    const chips = useSavedSearchSummary(item);
    return (
            <PressableScale style={styles.card} onPress={() => onOpen(item)} accessibilityRole="button">
                <View style={styles.cardHead}>
                    <View style={[styles.iconWrap, { backgroundColor: colors.opacity.background.primary }]}>
                        <Ionicons name="bookmark" size={16} color={colors.iconAccent} />
                    </View>
                    <View style={styles.cardBody}>
                        <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
                        <Text style={styles.summary} numberOfLines={2}>
                            {chips.length ? chips.map((c) => c.label).join(' · ') : t('savedSearch.noFilters')}
                        </Text>
                        <Text style={styles.meta}>
                            {item.last_notified_at
                                ? `${t('savedSearch.lastAlert')}: ${formatDate(item.last_notified_at)}`
                                : `${t('savedSearch.created')}: ${formatDate(item.created_at)}`}
                        </Text>
                    </View>
                    <TouchableOpacity
                        onPress={() => onDelete(item)}
                        disabled={deleting}
                        hitSlop={interactions.hitSlop}
                        activeOpacity={interactions.activeOpacityLight}
                        accessibilityRole="button"
                        accessibilityLabel={t('common.delete')}
                        style={[styles.deleteBtn, deleting && { opacity: 0.5 }]}
                    >
                        <Ionicons name="trash-outline" size={18} color={colors.danger} />
                    </TouchableOpacity>
                </View>
            </PressableScale>
    );
};

const SavedSearchesScreen = ({ navigation }) => {
    const insets = useSafeAreaInsets();
    const { colors } = useAppTheme();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const { t } = useTranslation();
    const qc = useQueryClient();
    const [deletingId, setDeletingId] = useState(null);

    const { data: searches = [], isLoading, isRefetching, isError, refetch } = useQuery({
        queryKey: SAVED_SEARCHES_KEY,
        queryFn: savedSearchService.list,
        staleTime: 60 * 1000,
    });

    const del = useMutation({
        mutationFn: (id) => savedSearchService.remove(id),
        onMutate: (id) => setDeletingId(id),
        onSettled: () => setDeletingId(null),
        onSuccess: (_, id) => {
            qc.setQueryData(SAVED_SEARCHES_KEY, (old) => (old || []).filter((s) => s.id !== id));
            qc.invalidateQueries({ queryKey: SAVED_SEARCHES_KEY });
        },
        onError: (e) => showErrorModal(t('common.error'), getErrorMessage(e) || t('common.error')),
    });

    const confirmDelete = useCallback((item) => {
        showWarningModal(t('savedSearch.deleteTitle'), t('savedSearch.deleteMessage'), [
            { text: t('common.cancel'), style: 'cancel' },
            { text: t('common.delete'), style: 'destructive', onPress: () => del.mutate(item.id) },
        ]);
    }, [t, del]);

    const open = useCallback((item) => {
        navigation.navigate('CustomerPostList', savedSearchService.toRouteParams(item));
    }, [navigation]);

    const showSkeleton = isLoading;

    return (
        <ScreenLayout title={t('savedSearch.title')} onBack={() => navigation.goBack()}>
            <SkeletonCrossfade
                loading={showSkeleton}
                skeleton={(
                    <FlatList
                        data={Array(4).fill({})}
                        renderItem={() => <SkeletonItem variant="booking" />}
                        keyExtractor={(_, i) => `sk-${i}`}
                        contentContainerStyle={styles.list}
                        scrollEnabled={false}
                    />
                )}
            >
                {isError ? (
                    <ScreenError onRetry={refetch} />
                ) : searches.length === 0 ? (
                    <EmptyState
                        icon="bookmark-outline"
                        iconSize={64}
                        variant="invitation"
                        title={t('savedSearch.empty')}
                        subtitle={t('savedSearch.emptyHint')}
                        actionButton={{
                            icon: 'search',
                            text: t('posts.browse'),
                            onPress: () => navigation.navigate('CustomerDashboard', { screen: 'AllPosts' }),
                        }}
                    />
                ) : (
                    <FlatList
                        data={searches}
                        renderItem={({ item, index }) => (
                            <SavedSearchRow
                                item={item}
                                index={index}
                                onOpen={open}
                                onDelete={confirmDelete}
                                deleting={deletingId === item.id}
                                styles={styles}
                                colors={colors}
                                t={t}
                            />
                        )}
                        keyExtractor={(item) => String(item.id)}
                        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + spacing.xxxxl }]}
                        refreshControl={
                            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} colors={[colors.primary]} />
                        }
                        showsVerticalScrollIndicator={false}
                    />
                )}
            </SkeletonCrossfade>
        </ScreenLayout>
    );
};

const createStyles = (colors) => StyleSheet.create({
    list: { padding: spacing.lg, ...(isTablet ? { maxWidth: 680, alignSelf: 'center', width: '100%' } : {}) },
    card: {
        ...colors.elevation.sm,
        backgroundColor: colors.surface,
        borderRadius: radius.card,
        padding: spacing.lg,
        marginBottom: spacing.md,
    },
    cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
    iconWrap: {
        width: 36, height: 36, borderRadius: radius.full,
        alignItems: 'center', justifyContent: 'center',
    },
    cardBody: { flex: 1, gap: spacing.xxs },
    name: { ...typography.styles.title, color: colors.text.primary },
    summary: { ...typography.styles.caption, color: colors.text.secondary },
    meta: { ...typography.styles.small, color: colors.text.tertiary, marginTop: spacing.xxs },
    deleteBtn: { padding: spacing.xs },
});

export default SavedSearchesScreen;

import React, { useCallback, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { View, Text, FlatList, TouchableOpacity, RefreshControl, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { spacing, typography, radius, interactions, isTablet } from '../../design/theme';
import { useAppTheme } from '../../hooks/useAppTheme';
import { ScreenLayout, EmptyState, SkeletonItem, SelectionPop } from '../../components';
import Button from '../../components/Button';
import TextInput from '../../components/TextInput';
import reportService, { REPORTS_KEY } from '../../services/api/reportService';
import { formatDateTime } from '../../utils/displayUtils';
import { showErrorModal, getErrorMessage } from '../../utils/errorManager';

const TABS = ['OPEN', 'RESOLVED', 'DISMISSED'];

/**
 * The moderation queue for reports users filed on live listings — the app
 * counterpart of the web's AdminReports. Oldest first, same as pending posts.
 */
const AdminReports = ({ navigation }) => {
    const insets = useSafeAreaInsets();
    const { colors } = useAppTheme();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const { t } = useTranslation();
    const qc = useQueryClient();
    const [tab, setTab] = useState('OPEN');
    const [notes, setNotes] = useState({});

    const { data, isLoading, isRefetching, isError, refetch } = useQuery({
        queryKey: [...REPORTS_KEY, tab],
        queryFn: () => reportService.list({ status: tab }),
        staleTime: 30 * 1000,
    });
    useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

    const resolveMut = useMutation({
        mutationFn: ({ id, status }) => reportService.resolve(id, status, notes[id]?.trim() || undefined),
        onSuccess: () => qc.invalidateQueries({ queryKey: REPORTS_KEY }),
        onError: (error) => showErrorModal(t('common.error'), getErrorMessage(error)),
    });

    const items = data?.items ?? [];

    const renderItem = useCallback(({ item }) => (
        <View style={[styles.card, colors.elevation.sm]}>
            <View style={styles.cardHead}>
                <Text style={styles.reason}>{t(`report.reasons.${item.reason}`)}</Text>
                <Text style={styles.date}>{formatDateTime(item.date_created)}</Text>
            </View>
            {item.post ? (
                <TouchableOpacity
                    onPress={() => navigation.navigate('PostDetailScreen', { postId: item.post.id, role: 'admin' })}
                    activeOpacity={interactions.activeOpacity}
                    hitSlop={{ top: 6, bottom: 6 }}
                >
                    <Text style={styles.postLink} numberOfLines={1}>#{item.post.id} · {item.post.title || '—'}</Text>
                </TouchableOpacity>
            ) : (
                <Text style={styles.muted}>—</Text>
            )}
            {!!item.detail && <Text style={styles.detail}>{item.detail}</Text>}
            <Text style={styles.muted}>{t('report.reporter')}: {item.reporter?.phone_number ?? '—'}</Text>

            {tab === 'OPEN' ? (
                <View style={styles.actions}>
                    <TextInput
                        value={notes[item.id] ?? ''}
                        onChangeText={(v) => setNotes((n) => ({ ...n, [item.id]: v.slice(0, 500) }))}
                        placeholder={t('report.resolutionPlaceholder')}
                    />
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
                                {value === 'OPEN' && tab === 'OPEN' && data?.total > 0 ? ` · ${data.total}` : ''}
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
                    contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 96 }]}
                    refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.iconAccent} />}
                    ListEmptyComponent={<EmptyState icon="flag-outline" title={t('report.queueEmpty')} />}
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
    card: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md, gap: spacing.xs },
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
});

export default AdminReports;

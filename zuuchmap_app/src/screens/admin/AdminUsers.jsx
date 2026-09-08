import React, { useCallback, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { View, Text, FlatList, TouchableOpacity, RefreshControl, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { spacing, typography, radius, interactions, isTablet } from '../../design/theme';
import { useAppTheme } from '../../hooks/useAppTheme';
import { ScreenLayout, EmptyState, SkeletonItem, SelectionPop, BaseModal, SearchInput } from '../../components';
import Button from '../../components/Button';
import adminService from '../../services/api/adminService';
import { formatDate } from '../../utils/displayUtils';
import { showErrorModal, getErrorMessage } from '../../utils/errorManager';

export const ADMIN_USERS_KEY = ['admin', 'users'];

const TYPE_FILTERS = ['', 'PROVIDER', 'CUSTOMER'];
// The endpoint accepts 1–24 and extends from the existing expiry rather than
// replacing it, so offering a few durations costs nothing and saves an admin
// granting the same month twelve times.
const PLAN_MONTHS = [1, 3, 12];

/**
 * Account administration — the app counterpart of the web's AdminUsers.
 *
 * Both this and AdminAnalytics existed only on the web, so an admin away from a
 * desk could approve a listing and resolve a report but could not look up the
 * account behind either one. Every endpoint here already existed and already
 * had a web caller; only the mobile surface was missing.
 */
const AdminUsers = () => {
    const insets = useSafeAreaInsets();
    const { colors } = useAppTheme();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const { t } = useTranslation();
    const qc = useQueryClient();

    const [search, setSearch] = useState('');
    const [typeFilter, setTypeFilter] = useState('');
    const [selected, setSelected] = useState(null);

    const { data: users = [], isLoading, isRefetching, isError, refetch } = useQuery({
        queryKey: ADMIN_USERS_KEY,
        queryFn: adminService.listUsers,
        staleTime: 30 * 1000,
    });
    useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

    const invalidate = () => {
        qc.invalidateQueries({ queryKey: ADMIN_USERS_KEY });
        qc.invalidateQueries({ queryKey: ['admin', 'stats'] });
    };

    const planMut = useMutation({
        mutationFn: ({ id, plan, months }) => adminService.setPlan(id, plan, months),
        onSuccess: () => { invalidate(); setSelected(null); },
        onError: (error) => showErrorModal(t('common.error'), getErrorMessage(error)),
    });

    const deleteMut = useMutation({
        mutationFn: (id) => adminService.deleteUser(id),
        onSuccess: () => { invalidate(); setSelected(null); },
        onError: (error) => showErrorModal(t('common.error'), getErrorMessage(error)),
    });

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return users.filter((u) => {
            const matchesSearch = !q
                || u.phone_number?.includes(q)
                || u.given_name?.toLowerCase().includes(q)
                || u.parent_name?.toLowerCase().includes(q);
            return matchesSearch && (!typeFilter || u.type === typeFilter);
        });
    }, [users, search, typeFilter]);

    const confirmDelete = (user) => {
        // Deleting an account cascades to their listings. It is the one action
        // here that cannot be undone, so it asks first — the plan grant does not
        // need to, because granting again simply extends.
        showErrorModal(
            t('admin.deleteUser'),
            t('admin.deleteUserConfirm'),
            [
                { text: t('common.cancel') },
                { text: t('common.delete'), style: 'destructive', onPress: () => deleteMut.mutate(user.id) },
            ],
            'warning',
        );
    };

    const renderItem = useCallback(({ item }) => (
        <TouchableOpacity
            style={[styles.row, colors.elevation.sm]}
            onPress={() => setSelected(item)}
            activeOpacity={interactions.activeOpacity}
            accessibilityRole="button"
        >
            <View style={styles.rowMain}>
                <Text style={styles.name} numberOfLines={1}>
                    {item.given_name || t('common.user')}
                    {item.is_admin ? ` · ${t('admin.role')}` : ''}
                </Text>
                <Text style={styles.phone}>+976 {item.phone_number}</Text>
            </View>
            <View style={styles.rowMeta}>
                <Text style={styles.type}>{item.type ? t(`onboarding.${item.type.toLowerCase()}`) : '—'}</Text>
                {item.plan && item.plan !== 'FREE' ? (
                    <Text style={styles.plan}>{item.plan}</Text>
                ) : null}
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.text.tertiary} />
        </TouchableOpacity>
    ), [styles, colors, t]);

    return (
        <ScreenLayout title={t('admin.users')} error={isError} onRetry={refetch}>
            <View style={styles.controls}>
                <SearchInput
                    value={search}
                    onChangeText={setSearch}
                    placeholder={t('admin.searchUsers')}
                />
                <View style={styles.tabs} accessibilityRole="tablist">
                    {TYPE_FILTERS.map((value) => (
                        <SelectionPop key={value || 'all'} selected={typeFilter === value}>
                            <TouchableOpacity
                                style={[
                                    styles.tab,
                                    { borderColor: colors.border.light },
                                    typeFilter === value && { borderColor: colors.primary, backgroundColor: colors.opacity.background.primary },
                                ]}
                                onPress={() => setTypeFilter(value)}
                                activeOpacity={interactions.activeOpacity}
                                accessibilityRole="tab"
                                accessibilityState={{ selected: typeFilter === value }}
                            >
                                <Text style={[styles.tabText, { color: typeFilter === value ? colors.text.link : colors.text.secondary }]}>
                                    {value ? t(`onboarding.${value.toLowerCase()}`) : t('admin.allTypes')}
                                </Text>
                            </TouchableOpacity>
                        </SelectionPop>
                    ))}
                </View>
            </View>

            {isLoading ? (
                <View style={styles.list}>
                    {[0, 1, 2, 3].map((i) => <SkeletonItem key={i} style={{ marginBottom: spacing.md }} />)}
                </View>
            ) : (
                <FlatList
                    data={filtered}
                    keyExtractor={(item) => String(item.id)}
                    renderItem={renderItem}
                    contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 96 }]}
                    refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.iconAccent} />}
                    ListEmptyComponent={<EmptyState icon="people-outline" title={t('admin.noUsers')} />}
                    keyboardShouldPersistTaps="handled"
                />
            )}

            <BaseModal visible={!!selected} onClose={() => setSelected(null)} variant="bottomSheet">
                {selected && (
                    <ScrollView contentContainerStyle={styles.sheet} keyboardShouldPersistTaps="handled">
                        <Text style={styles.sheetTitle} numberOfLines={1}>
                            {selected.given_name || t('common.user')}
                        </Text>
                        <Text style={styles.sheetPhone}>+976 {selected.phone_number}</Text>

                        <View style={styles.detailGrid}>
                            <Detail styles={styles} label={t('admin.userType')} value={selected.type ? t(`onboarding.${selected.type.toLowerCase()}`) : '—'} />
                            <Detail styles={styles} label={t('billing.currentPlan')} value={selected.plan || 'FREE'} />
                            <Detail styles={styles} label={t('profile.memberSince')} value={selected.date_created ? formatDate(selected.date_created) : '—'} />
                            <Detail styles={styles} label={t('admin.verified')} value={selected.is_verified ? t('common.yes') : t('common.no')} />
                        </View>

                        {/* Phase 1 fulfils subscriptions by hand: this grants a
                            plan, it does not take money. */}
                        <Text style={styles.sectionLabel}>{t('admin.grantPlan')}</Text>
                        <View style={styles.planRow}>
                            {PLAN_MONTHS.map((months) => (
                                <Button
                                    key={months}
                                    title={t('admin.planMonths', { months })}
                                    size="sm"
                                    variant="secondary"
                                    style={styles.planButton}
                                    disabled={planMut.isPending}
                                    onPress={() => planMut.mutate({ id: selected.id, plan: 'PROVIDER', months })}
                                />
                            ))}
                        </View>
                        {selected.plan && selected.plan !== 'FREE' ? (
                            <Button
                                title={t('admin.revokePlan')}
                                size="sm"
                                variant="secondary"
                                disabled={planMut.isPending}
                                onPress={() => planMut.mutate({ id: selected.id, plan: 'FREE', months: 1 })}
                            />
                        ) : null}

                        {/* An admin cannot delete themselves out of the console. */}
                        {!selected.is_admin && (
                            <Button
                                title={t('admin.deleteUser')}
                                variant="danger"
                                style={styles.deleteButton}
                                disabled={deleteMut.isPending}
                                onPress={() => confirmDelete(selected)}
                            />
                        )}
                    </ScrollView>
                )}
            </BaseModal>
        </ScreenLayout>
    );
};

const Detail = ({ styles, label, value }) => (
    <View style={styles.detailItem}>
        <Text style={styles.detailLabel}>{label}</Text>
        <Text style={styles.detailValue} numberOfLines={1}>{value}</Text>
    </View>
);

const createStyles = (colors) => StyleSheet.create({
    controls: { paddingHorizontal: spacing.md, paddingTop: spacing.sm, gap: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border.light, paddingBottom: spacing.sm },
    tabs: { flexDirection: 'row', gap: spacing.sm },
    tab: { height: 36, paddingHorizontal: spacing.md, borderRadius: radius.pill, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
    tabText: { ...typography.styles.label, includeFontPadding: false },
    list: { padding: spacing.lg, maxWidth: isTablet ? 720 : undefined, alignSelf: isTablet ? 'center' : 'stretch', width: '100%' },
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm },
    rowMain: { flex: 1, gap: 2 },
    name: { ...typography.styles.title, color: colors.text.primary },
    phone: { ...typography.styles.small, color: colors.text.tertiary },
    rowMeta: { alignItems: 'flex-end', gap: 2 },
    type: { ...typography.styles.small, color: colors.text.secondary },
    plan: { ...typography.styles.badge, color: colors.text.link },
    sheet: { padding: spacing.lg, gap: spacing.sm },
    sheetTitle: { ...typography.styles.h3, color: colors.text.primary },
    sheetPhone: { ...typography.styles.caption, color: colors.text.secondary, marginBottom: spacing.sm },
    detailGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginBottom: spacing.sm },
    detailItem: { minWidth: '40%', gap: 2 },
    detailLabel: { ...typography.styles.overline, color: colors.text.tertiary },
    detailValue: { ...typography.styles.bodyMedium, color: colors.text.primary },
    sectionLabel: { ...typography.styles.overline, color: colors.text.tertiary, marginTop: spacing.sm },
    planRow: { flexDirection: 'row', gap: spacing.sm },
    planButton: { flex: 1 },
    deleteButton: { marginTop: spacing.lg },
});

export default AdminUsers;

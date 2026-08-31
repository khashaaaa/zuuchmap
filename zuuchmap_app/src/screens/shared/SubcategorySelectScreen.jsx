import React, { useState, useMemo, useRef } from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { spacing, typography, safeAreaHelpers, radius, withAlpha, isTablet } from '../../design/theme';
import { ScreenLayout } from '../../components';
import { useAppTheme } from '../../hooks/useAppTheme';
import { useTranslation } from 'react-i18next';
import SearchInput from '../../components/SearchInput';
import WizardSteps from '../../components/WizardSteps';
import EmptyState from '../../components/EmptyState';
import PressableScale from '../../components/PressableScale';

const SubcategoryCard = ({ item, isSelected, onSelect, colors, styles, label }) => {
    const displayName = label;

    return (
        <PressableScale
            style={[
                styles.card,
                { backgroundColor: colors.surface, borderColor: colors.border.light, borderLeftWidth: 3, borderLeftColor: colors.primary },
                isSelected && styles.cardSelected,
            ]}
            onPress={() => onSelect(item)}
            pop
            selected={isSelected}
            accessibilityRole="button"
        >
            <View style={styles.cardContent}>
                <Text style={[styles.cardName, { color: colors.text.primary }]}>{displayName}</Text>
            </View>
            <View style={[styles.arrow, { backgroundColor: withAlpha(colors.primary, isSelected ? 0.13 : 0.06), borderColor: colors.border.light }]}>
                <Ionicons name="chevron-forward" size={20} color={isSelected ? colors.primary : colors.text.secondary} />
            </View>
        </PressableScale>
    );
};

const SubcategorySelectScreen = ({ route, navigation }) => {
    const { colors, styles: gStyles } = useAppTheme();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const { t, i18n } = useTranslation();
    const { role, category, categoryDisplayName, subcategories } = route.params;

    // Schema labels win (admin-editable, localized); client i18n is only the
    // fallback for older hardcoded keys. Items are schema subcategory objects.
    const subLabel = (item) => {
        const value = typeof item === 'object' ? item.value : item;
        const labels = typeof item === 'object' ? item.labels : null;
        return labels?.[i18n.language]
            ?? t(`subcategory.${value}`, { defaultValue: (typeof item === 'object' && item.label) || value });
    };
    const insets = useSafeAreaInsets();
    const [selected, setSelected] = useState(null);
    const [search, setSearch] = useState('');
    const navigatingRef = useRef(false);

    const filtered = useMemo(() => {
        const q = search.toLowerCase().trim();
        if (!q) return subcategories;
        return subcategories.filter(item => {
            const value = typeof item === 'object' ? item.value : item;
            return subLabel(item).toLowerCase().includes(q) || value.toLowerCase().includes(q);
        });
    }, [subcategories, search, t, i18n.language]);

    const handleSelect = (subcategory) => {
        if (subcategory === null) {
            if (navigatingRef.current) return;
            navigatingRef.current = true;
            setTimeout(() => { navigatingRef.current = false; }, 800);
            navigation.navigate('ProviderLocationSelection', { category, subcategory: undefined });
            return;
        }
        // Double-taps land before the transition starts — push only one screen.
        if (navigatingRef.current) return;
        navigatingRef.current = true;
        setTimeout(() => { navigatingRef.current = false; }, 800);
        setSelected(subcategory);
        const subValue = typeof subcategory === 'object' ? subcategory.value : subcategory;

        if (role === 'provider') {
            navigation.navigate('ProviderLocationSelection', { category, subcategory: subValue });
        } else {
            navigation.navigate('CustomerPostList', {
                category,
                subcategory: subValue,
                categoryDisplayName,
                subcategoryDisplayName: subLabel(subcategory),
            });
        }
    };

    return (
        <ScreenLayout title={t('category.subcategoryTitle')} onBack={() => navigation.goBack()}>
            {role === 'provider' && (
                <WizardSteps current={2} labels={[t('provider.stepCategory'), t('provider.stepSubcategory'), t('provider.stepLocation'), t('provider.stepDetails')]} />
            )}

            <View style={[styles.content, { backgroundColor: colors.background }]}>
                <View style={styles.categoryInfo}>
                    <View style={styles.categoryInfoIcon}>
                        <Ionicons name="checkmark-circle" size={24} color={colors.iconAccent} />
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={[styles.categoryLabel, { color: colors.text.secondary }]}>{t('category.selectedLabel')}</Text>
                        <Text style={styles.categoryValue}>{categoryDisplayName}</Text>
                    </View>
                </View>

                <SearchInput
                    value={search}
                    onChangeText={setSearch}
                    placeholder={t('common.search')}
                />

                {filtered.length === 0 && search.trim() ? (
                    <EmptyState
                        icon="search-outline"
                        variant="search"
                        title={t('filter.searchNoResults')}
                        subtitle={t('filter.searchNoResultsDesc')}
                        actionButton={{ text: t('filter.searchClear'), onPress: () => setSearch('') }}
                    />
                ) : (
                    <FlatList
                        data={filtered}
                        keyboardShouldPersistTaps="handled"
                        keyExtractor={(item, i) => (typeof item === 'object' ? item.value : item) + i}
                        renderItem={({ item, index }) => (
                                <SubcategoryCard
                                    item={item}
                                    isSelected={selected === item}
                                    onSelect={handleSelect}
                                    colors={colors}
                                    styles={styles}
                                    label={subLabel(item)}
                                />
                        )}
                        contentContainerStyle={[
                            styles.list,
                            gStyles.scrollViewContentWithBottomInset(safeAreaHelpers.getBottomSafeArea(insets)),
                        ]}
                        showsVerticalScrollIndicator={false}
                        initialNumToRender={10}
                        maxToRenderPerBatch={10}
                        windowSize={10}
                        ListFooterComponent={role === 'provider' ? (
                            <PressableScale
                                style={[styles.skipButton, { borderColor: colors.border.light }]}
                                onPress={() => handleSelect(null)}
                                accessibilityRole="button"
                            >
                                <Text style={[styles.skipText, { color: colors.text.secondary }]}>
                                    {t('provider.skipSubcategory')}
                                </Text>
                            </PressableScale>
                        ) : null}
                    />
                )}
            </View>
        </ScreenLayout>
    );
};

const createStyles = (colors) => StyleSheet.create({
    skipButton: {
        marginTop: spacing.md,
        paddingVertical: spacing.lg,
        borderRadius: radius.card,
        borderWidth: 1,
        borderStyle: 'dashed',
        alignItems: 'center',
    },
    skipText: { ...typography.styles.label },
    content: { flex: 1, padding: spacing.lg },
    categoryInfo: {
        backgroundColor: colors.opacity.background.success,
        padding: spacing.lg,
        borderRadius: radius.card,
        marginBottom: spacing.lg,
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: colors.opacity.background.success,
    },
    categoryInfoIcon: {
        backgroundColor: colors.opacity.background.success,
        borderRadius: radius.xxl,
        padding: spacing.xs,
        marginRight: spacing.sm,
    },
    categoryLabel: {
        ...typography.styles.label,
        color: colors.text.secondary,
        marginBottom: spacing.xxs,
    },
    categoryValue: {
        ...typography.styles.bodyBold,
        color: colors.success,
    },
    list: {
        paddingBottom: spacing.xxl,
        ...(isTablet ? { maxWidth: 680, alignSelf: 'center', width: '100%' } : {}),
    },

    card: {
        ...colors.elevation.sm,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: spacing.lg,
        borderRadius: radius.card,
        marginBottom: spacing.md,
        marginHorizontal: spacing.xs,
        backgroundColor: colors.surface,
    },
    cardSelected: {
        ...colors.elevation.selected,
        backgroundColor: colors.surfaceLight,
    },
    cardContent: { flex: 1, paddingRight: spacing.sm },
    cardName: {
        ...typography.styles.title,
        color: colors.text.primary,
    },
    arrow: {
        borderRadius: radius.card,
        padding: spacing.sm,
        borderWidth: 1,
        borderColor: colors.border.light,
    },
});

export default SubcategorySelectScreen;

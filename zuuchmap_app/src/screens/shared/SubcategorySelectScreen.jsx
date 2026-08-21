import React, { useState, useMemo, useRef } from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { spacing, typography, safeAreaHelpers, radius } from '../../design/theme';
import { useAppTheme } from '../../hooks/useAppTheme';
import { useTranslation } from 'react-i18next';
import CustomSafeAreaView from '../../components/CustomSafeAreaView';
import SearchInput from '../../components/SearchInput';
import ScreenHeader from '../../components/ScreenHeader';
import EmptyState from '../../components/EmptyState';
import PressableScale from '../../components/PressableScale';
import FadeSlideIn from '../../components/FadeSlideIn';

const SubcategoryCard = ({ item, isSelected, onSelect, colors, styles, t }) => {
    const value = typeof item === 'object' ? item.value : item;
    const displayName = t(`subcategory.${value}`, { defaultValue: typeof item === 'object' ? item.display : item });

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
            <View style={[styles.arrow, { backgroundColor: isSelected ? `${colors.primary}20` : `${colors.primary}10`, borderColor: colors.border.light }]}>
                <Ionicons name="chevron-forward" size={20} color={isSelected ? colors.primary : colors.text.secondary} />
            </View>
        </PressableScale>
    );
};

const SubcategorySelectScreen = ({ route, navigation }) => {
    const { colors, isDark, styles: gStyles } = useAppTheme();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const { t } = useTranslation();
    const { role, category, categoryDisplayName, subcategories } = route.params;
    const insets = useSafeAreaInsets();
    const [selected, setSelected] = useState(null);
    const [search, setSearch] = useState('');
    const navigatingRef = useRef(false);

    const filtered = useMemo(() => {
        const q = search.toLowerCase().trim();
        if (!q) return subcategories;
        return subcategories.filter(item => {
            const value = typeof item === 'object' ? item.value : item;
            const translated = t(`subcategory.${value}`, { defaultValue: typeof item === 'object' ? item.display : item });
            return translated.toLowerCase().includes(q) || value.toLowerCase().includes(q);
        });
    }, [subcategories, search, t]);

    const handleSelect = (subcategory) => {
        // Double-taps land before the transition starts — push only one screen.
        if (navigatingRef.current) return;
        navigatingRef.current = true;
        setTimeout(() => { navigatingRef.current = false; }, 800);
        setSelected(subcategory);
        const subValue = typeof subcategory === 'object' ? subcategory.value : subcategory;
        const subDisplay = typeof subcategory === 'object' ? subcategory.display : subcategory;

        if (role === 'provider') {
            navigation.navigate('ProviderLocationSelection', { category, subcategory: subValue });
        } else {
            navigation.navigate('CustomerPostList', {
                category,
                subcategory: subValue,
                categoryDisplayName,
                subcategoryDisplayName: t(`subcategory.${subValue}`, { defaultValue: subValue }),
            });
        }
    };

    return (
        <CustomSafeAreaView backgroundColor={colors.background} statusBarColor={colors.surface} statusBarStyle={isDark ? 'light-content' : 'dark-content'}>
            <ScreenHeader title={t('category.subcategoryTitle')} onBack={() => navigation.goBack()} />

            <View style={[styles.content, { backgroundColor: colors.background }]}>
                <View style={styles.categoryInfo}>
                    <View style={styles.categoryInfoIcon}>
                        <Ionicons name="checkmark-circle" size={24} color={colors.primary} />
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
                        keyExtractor={(item, i) => (typeof item === 'object' ? item.value : item) + i}
                        renderItem={({ item, index }) => (
                            <FadeSlideIn index={index}>
                                <SubcategoryCard
                                    item={item}
                                    isSelected={selected === item}
                                    onSelect={handleSelect}
                                    colors={colors}
                                    styles={styles}
                                    t={t}
                                />
                            </FadeSlideIn>
                        )}
                        contentContainerStyle={[
                            styles.list,
                            gStyles.scrollViewContentWithBottomInset(safeAreaHelpers.getBottomSafeArea(insets)),
                        ]}
                        showsVerticalScrollIndicator={false}
                        initialNumToRender={10}
                        maxToRenderPerBatch={10}
                        windowSize={10}
                    />
                )}
            </View>
        </CustomSafeAreaView>
    );
};

const createStyles = (colors) => StyleSheet.create({
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
    list: { paddingBottom: spacing.xxl },
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

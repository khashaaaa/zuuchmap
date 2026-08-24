import React, { useState, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { View, Text, FlatList, RefreshControl, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { spacing, typography, safeAreaHelpers, radius, isTablet, withAlpha, toneForTheme, categoryColors } from '../../design/theme';
import { useAppTheme } from '../../hooks/useAppTheme';
import { useTranslation } from 'react-i18next';
import CustomSafeAreaView from '../../components/CustomSafeAreaView';
import SearchInput from '../../components/SearchInput';
import ScreenHeader from '../../components/ScreenHeader';
import WizardSteps from '../../components/WizardSteps';
import ScreenError from '../../components/ScreenError';
import ScreenLoading from '../../components/ScreenLoading';
import EmptyState from '../../components/EmptyState';
import { getSchemaLabel } from '../../utils/postUtils';
import PressableScale from '../../components/PressableScale';
import FadeSlideIn from '../../components/FadeSlideIn';
import categoryService from '../../services/api/categoryService';

const CategoryCard = ({ item, isSelected, onSelect, colors, isDark, styles, t }) => {
    // The vertical's own colour distinguishes the thirteen cards; amber is
    // reserved for the selected state so "chosen" stays the only amber thing.
    const catColor = item.schema?.color || categoryColors[item.id] || colors.primary;
    return (
        <PressableScale
            style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border.light }, isSelected && styles.cardSelected]}
            onPress={() => onSelect(item)}
            pop
            selected={isSelected}
            accessibilityRole="button"
        >
            <View style={[styles.iconContainer, { backgroundColor: withAlpha(catColor, isDark ? 0.18 : 0.12) }]}>
                <Ionicons name={item.icon} size={isTablet ? 40 : 32} color={toneForTheme(catColor, isDark)} />
            </View>
            <View style={styles.cardContent}>
                <Text style={[styles.cardName, { color: colors.text.primary }]}>{getSchemaLabel(item.schema)}</Text>
                <View style={[styles.subBadge, { backgroundColor: colors.background, borderColor: colors.border.medium }]}>
                    <Text style={[styles.subBadgeText, { color: colors.text.secondary }]}>{t('category.subcategoryCount', { count: item.subcategories.length })}</Text>
                </View>
            </View>
            <View style={[styles.arrow, { borderColor: colors.border.light }]}>
                <Ionicons name="chevron-forward" size={20} color={colors.text.tertiary} />
            </View>
        </PressableScale>
    );
};

const CategorySelectScreen = ({ route, navigation }) => {
    const { colors, isDark, styles: gStyles } = useAppTheme();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const { t } = useTranslation();
    const { role } = route.params;
    const insets = useSafeAreaInsets();
    const [selected, setSelected] = useState(null);
    const [search, setSearch] = useState('');

    const navigatingRef = useRef(false);

    const { data: schemas = [], isLoading: loading, isRefetching, isError, refetch } = useQuery({
        queryKey: ['categories'],
        queryFn: () => categoryService.getCategories(true),
        staleTime: 5 * 60 * 1000,
        select: (data) => data.filter((s) => s.active !== false),
    });

    const categories = useMemo(() => schemas.map((s) => ({
        id: s.key,
        name: s.key,
        i18nKey: s.key,
        icon: s.icon || 'grid-outline',
        subcategories: s.subcategories || [],
        // Labels resolve from the schema at render time (admin-editable, and
        // reacts to locale switches without rebuilding this list).
        schema: s,
    })), [schemas]);

    const filtered = useMemo(() => {
        const q = search.toLowerCase().trim();
        if (!q) return categories;
        return categories.filter(c => getSchemaLabel(c.schema).toLowerCase().includes(q));
    }, [categories, search, t]);

    const handleSelect = (category) => {
        // Double-taps land before the transition starts — push only one screen.
        if (navigatingRef.current) return;
        navigatingRef.current = true;
        setTimeout(() => { navigatingRef.current = false; }, 800);
        setSelected(category);
        navigation.navigate('SubcategorySelectScreen', {
            role,
            category: category.name,
            categoryDisplayName: getSchemaLabel(category.schema),
            subcategories: category.subcategories,
        });
    };

    return (
        <CustomSafeAreaView backgroundColor={colors.background} statusBarColor={colors.surface} statusBarStyle={isDark ? 'light-content' : 'dark-content'}>
            <ScreenHeader title={t('category.selectTitle')} onBack={() => navigation.goBack()} />
            {role === 'provider' && (
                <WizardSteps current={1} labels={[t('provider.stepCategory'), t('provider.stepSubcategory'), t('provider.stepLocation'), t('provider.stepDetails')]} />
            )}

            <View style={[styles.content, { backgroundColor: colors.background }]}>
                {loading ? (
                    <ScreenLoading />
                ) : isError ? (
                    <ScreenError onRetry={refetch} />
                ) : (<>
                <SearchInput
                    value={search}
                    onChangeText={setSearch}
                    placeholder={t('category.searchPlaceholder')}
                    containerStyle={styles.searchBar}
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
                        keyExtractor={item => item.id}
                        renderItem={({ item, index }) => (
                            <FadeSlideIn index={index}>
                                <CategoryCard
                                    item={item}
                                    isSelected={selected?.id === item.id}
                                    onSelect={handleSelect}
                                    colors={colors}
                                    isDark={isDark}
                                    styles={styles}
                                    t={t}
                                />
                            </FadeSlideIn>
                        )}
                        contentContainerStyle={[
                            styles.list,
                            gStyles.scrollViewContentWithBottomInset(safeAreaHelpers.getBottomSafeArea(insets)),
                        ]}
                        refreshControl={
                            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} colors={[colors.primary]} />
                        }
                        showsVerticalScrollIndicator={false}
                        initialNumToRender={8}
                        maxToRenderPerBatch={5}
                        windowSize={10}
                    />
                )}
                </>)}
            </View>
        </CustomSafeAreaView>
    );
};

const createStyles = (colors) => StyleSheet.create({
    content: { flex: 1, padding: spacing.lg },
    searchBar: { marginBottom: spacing.lg },
    list: { paddingBottom: spacing.xxl },
    card: {
        ...colors.elevation.sm,
        flexDirection: 'row',
        alignItems: 'center',
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
    iconContainer: {
        width: isTablet ? 72 : 60,
        height: isTablet ? 72 : 60,
        borderRadius: radius.pill,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: spacing.lg,
    },
    cardContent: { flex: 1, paddingRight: spacing.sm },
    cardName: {
        ...typography.styles.title,
        color: colors.text.primary,
        marginBottom: spacing.xs,
    },
    subBadge: {
        alignSelf: 'flex-start',
        backgroundColor: colors.background,
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.xs,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.border.medium,
    },
    subBadgeText: {
        ...typography.styles.micro,
        color: colors.text.secondary,
    },
    arrow: {
        borderRadius: radius.card,
        padding: spacing.sm,
        borderWidth: 1,
        borderColor: colors.border.light,
    },
});

export default CategorySelectScreen;

import React, { useState, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { View, Text, TouchableOpacity, FlatList, Animated, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { spacing, typography, shadows, safeAreaHelpers, radius, interactions, isTablet } from '../../design/theme';
import { useAppTheme } from '../../hooks/useAppTheme';
import { useTranslation } from 'react-i18next';
import CustomSafeAreaView from '../../components/CustomSafeAreaView';
import SearchInput from '../../components/SearchInput';
import ScreenHeader from '../../components/ScreenHeader';
import Button from '../../components/Button';
import categoryService from '../../services/api/categoryService';
import { useReducedMotion } from '../../hooks/useReducedMotion';

const CategoryCard = ({ item, isSelected, onSelect, colors, styles, t }) => {
    const scale = useRef(new Animated.Value(1)).current;
    const reduced = useReducedMotion();

    const handlePressIn = () => {
        if (reduced) return;
        Animated.spring(scale, { toValue: 0.95, useNativeDriver: true }).start();
    };
    const handlePressOut = () => {
        if (reduced) return;
        Animated.spring(scale, { toValue: 1, useNativeDriver: true }).start();
    };

    return (
        <Animated.View style={{ transform: [{ scale }] }}>
            <TouchableOpacity
                style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border.light }, isSelected && styles.cardSelected]}
                onPress={() => onSelect(item)}
                onPressIn={handlePressIn}
                onPressOut={handlePressOut}
                activeOpacity={interactions.activeOpacity}
            >
                <View style={styles.iconContainer}>
                    <Ionicons name={item.icon} size={isTablet ? 40 : 32} color={colors.primary} />
                </View>
                <View style={styles.cardContent}>
                    <Text style={[styles.cardName, { color: colors.text.inverse }]}>{t('category.' + item.i18nKey)}</Text>
                    <View style={[styles.subBadge, { backgroundColor: colors.background, borderColor: colors.border.medium }]}>
                        <Text style={[styles.subBadgeText, { color: colors.text.secondary }]}>{t('category.subcategoryCount', { count: item.subcategories.length })}</Text>
                    </View>
                </View>
                <View style={[styles.arrow, { borderColor: colors.border.light, backgroundColor: colors.opacity.background.primary }]}>
                    <Ionicons name="chevron-forward" size={20} color={colors.primary} />
                </View>
            </TouchableOpacity>
        </Animated.View>
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

    const { data: schemas = [], isLoading: loading } = useQuery({
        queryKey: ['categories', 'all'],
        queryFn: () => categoryService.getCategories(),
        staleTime: 10 * 60 * 1000,
        select: (data) => data.filter((s) => s.active !== false),
    });

    const categories = useMemo(() => schemas.map((s) => ({
        id: s.key,
        name: s.key,
        i18nKey: s.key,
        icon: s.icon || 'grid-outline',
        subcategories: s.subcategories || [],
    })), [schemas]);

    const filtered = useMemo(() => {
        const q = search.toLowerCase().trim();
        if (!q) return categories;
        return categories.filter(c => t('category.' + c.i18nKey, { defaultValue: c.i18nKey }).toLowerCase().includes(q));
    }, [categories, search, t]);

    const handleSelect = (category) => {
        setSelected(category);
        navigation.navigate('SubcategorySelectScreen', {
            role,
            category: category.name,
            categoryDisplayName: t('category.' + category.i18nKey),
            subcategories: category.subcategories,
        });
    };

    return (
        <CustomSafeAreaView backgroundColor={colors.background} statusBarColor={colors.surface} statusBarStyle={isDark ? 'light-content' : 'dark-content'}>
            <ScreenHeader title={t('category.selectTitle')} onBack={() => navigation.goBack()} />

            <View style={[styles.content, { backgroundColor: colors.background }]}>
                {loading ? (
                    <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: spacing.xxl }} />
                ) : (<>
                <SearchInput
                    value={search}
                    onChangeText={setSearch}
                    placeholder={t('category.searchPlaceholder')}
                    containerStyle={styles.searchBar}
                />

                {filtered.length === 0 && search.trim() ? (
                    <View style={styles.empty}>
                        <Ionicons name="search-outline" size={56} color={colors.primary} />
                        <Text style={[styles.emptyTitle, { color: colors.text.primary }]}>{t('filter.searchNoResults')}</Text>
                        <Text style={[styles.emptySubtitle, { color: colors.text.secondary }]}>{t('filter.searchNoResultsDesc')}</Text>
                        <Button title={t('filter.searchClear')} onPress={() => setSearch('')} size="sm" />
                    </View>
                ) : (
                    <FlatList
                        data={filtered}
                        keyExtractor={item => item.id}
                        renderItem={({ item }) => (
                            <CategoryCard
                                item={item}
                                isSelected={selected?.id === item.id}
                                onSelect={handleSelect}
                                colors={colors}
                                styles={styles}
                                t={t}
                            />
                        )}
                        contentContainerStyle={[
                            styles.list,
                            gStyles.scrollViewContentWithBottomInset(safeAreaHelpers.getBottomSafeArea(insets)),
                        ]}
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
        flexDirection: 'row',
        alignItems: 'center',
        padding: spacing.lg,
        borderWidth: 1,
        borderColor: colors.border.light,
        borderRadius: radius.card,
        marginBottom: spacing.md,
        marginHorizontal: spacing.xs,
        backgroundColor: colors.surface,
        ...shadows.small,
    },
    cardSelected: {
        borderColor: colors.primary,
        backgroundColor: colors.surfaceLight,
        ...shadows.primary,
    },
    iconContainer: {
        width: isTablet ? 72 : 60,
        height: isTablet ? 72 : 60,
        borderRadius: radius.pill,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: spacing.lg,
        backgroundColor: colors.opacity.background.primary,
    },
    cardContent: { flex: 1, paddingRight: spacing.sm },
    cardName: {
        fontSize: typography.lg,
        fontWeight: '700',
        color: colors.text.inverse,
        marginBottom: spacing.xs,
        letterSpacing: 0.3,
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
        fontSize: typography.xs,
        color: colors.text.secondary,
        fontWeight: '500',
    },
    arrow: {
        borderRadius: radius.card,
        padding: spacing.sm,
        borderWidth: 1,
        borderColor: colors.border.light,
        backgroundColor: colors.opacity.background.primary,
    },
    empty: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: spacing.xl,
    },
    emptyTitle: {
        fontSize: typography.lg,
        fontWeight: '600',
        color: colors.text.primary,
        marginTop: spacing.xl,
        marginBottom: spacing.sm,
    },
    emptySubtitle: {
        fontSize: typography.sm,
        color: colors.text.secondary,
        textAlign: 'center',
        lineHeight: 20,
        marginBottom: spacing.lg,
    },
});

export default CategorySelectScreen;

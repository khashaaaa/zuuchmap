import React, { useState, useMemo, useRef } from 'react';
import { View, Text, TouchableOpacity, FlatList, Animated,
    StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { spacing, typography, shadows, safeAreaHelpers, radius, interactions } from '../../design/theme';
import { useAppTheme } from '../../hooks/useAppTheme';
import { useTranslation } from 'react-i18next';
import CustomSafeAreaView from '../../components/CustomSafeAreaView';
import SearchInput from '../../components/SearchInput';
import ScreenHeader from '../../components/ScreenHeader';
import { useReducedMotion } from '../../hooks/useReducedMotion';

const SubcategoryCard = ({ item, isSelected, onSelect, colors, styles, t }) => {
    const scale = useRef(new Animated.Value(1)).current;
    const reduced = useReducedMotion();
    const value = typeof item === 'object' ? item.value : item;
    const displayName = t(`subcategory.${value}`, { defaultValue: typeof item === 'object' ? item.display : item });

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
                style={[
                    styles.card,
                    { backgroundColor: colors.surface, borderColor: colors.border.light, borderLeftWidth: 3, borderLeftColor: colors.primary },
                    isSelected && styles.cardSelected,
                ]}
                onPress={() => onSelect(item)}
                onPressIn={handlePressIn}
                onPressOut={handlePressOut}
                activeOpacity={interactions.activeOpacity}
            >
                <View style={styles.cardContent}>
                    <Text style={[styles.cardName, { color: colors.text.inverse }]}>{displayName}</Text>
                </View>
                <View style={[styles.arrow, { backgroundColor: isSelected ? `${colors.primary}20` : `${colors.primary}10`, borderColor: colors.border.light }]}>
                    <Ionicons name="chevron-forward" size={18} color={isSelected ? colors.primary : colors.text.secondary} />
                </View>
            </TouchableOpacity>
        </Animated.View>
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
                    <View style={styles.empty}>
                        <Ionicons name="search-outline" size={56} color={colors.primary} />
                        <Text style={styles.emptyTitle}>{t('filter.searchNoResults')}</Text>
                        <Text style={styles.emptySubtitle}>{t('filter.searchNoResultsDesc')}</Text>
                        <TouchableOpacity style={styles.clearBtn} onPress={() => setSearch('')} activeOpacity={interactions.activeOpacityLight}>
                            <Text style={styles.clearBtnText}>{t('filter.searchClear')}</Text>
                        </TouchableOpacity>
                    </View>
                ) : (
                    <FlatList
                        data={filtered}
                        keyExtractor={(item, i) => (typeof item === 'object' ? item.value : item) + i}
                        renderItem={({ item }) => (
                            <SubcategoryCard
                                item={item}
                                isSelected={selected === item}
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
        fontSize: typography.sm,
        color: colors.text.secondary,
        marginBottom: spacing.xxs,
        fontWeight: '500',
    },
    categoryValue: {
        fontSize: typography.md,
        fontWeight: 'bold',
        color: colors.success,
        letterSpacing: 0.3,
    },
    list: { paddingBottom: spacing.xxl },
    card: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
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
    cardContent: { flex: 1, paddingRight: spacing.sm },
    cardName: {
        fontSize: typography.md,
        fontWeight: '600',
        color: colors.text.inverse,
        letterSpacing: 0.2,
    },
    arrow: {
        borderRadius: radius.card,
        padding: spacing.sm,
        borderWidth: 1,
        borderColor: colors.border.light,
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
    clearBtn: {
        backgroundColor: colors.primary,
        paddingHorizontal: spacing.xl,
        paddingVertical: spacing.md,
        borderRadius: radius.xxl,
        ...shadows.small,
    },
    clearBtnText: {
        color: colors.text.inverse,
        fontSize: typography.sm,
        fontWeight: '600',
    },
});

export default SubcategorySelectScreen;

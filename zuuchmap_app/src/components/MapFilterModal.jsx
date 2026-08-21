import React, { useState, useCallback, useMemo } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    TextInput,
    Dimensions,
    Switch,
    StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import BottomSheetModal from './BottomSheetModal';
import Button from './Button';
import SelectionPop from './SelectionPop';
import { spacing, typography, radius, interactions } from '../design/theme';
import { useAppTheme } from '../hooks/useAppTheme';
import { useActiveCategorySchemas } from '../hooks/useCategorySchemas';
import { getSchemaLabel } from '../utils/postUtils';
import { useTranslation } from 'react-i18next';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

const MapFilterModal = ({
    visible,
    onClose,
    onApplyFilters,
    initialFilters = {},
    userLocation = null
}) => {
    const { colors } = useAppTheme();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const { t } = useTranslation();

    // Filter chips are whatever the admin has active, in their sort order —
    // never a list baked into the build.
    const schemas = useActiveCategorySchemas();
    const POST_CATEGORY_DEFS = useMemo(() => schemas.map((schema) => ({
        key: schema.key,
        icon: schema.icon || 'pricetag-outline',
        color: schema.color || colors.primary,
        label: getSchemaLabel(schema),
    })), [schemas, colors]);

    const [selectedCategories, setSelectedCategories] = useState(
        initialFilters.selectedCategories || []
    );
    const [priceRange, setPriceRange] = useState({
        min: initialFilters.priceRange?.min ?? null,
        max: initialFilters.priceRange?.max ?? null,
        enabled: initialFilters.priceRange?.enabled || false
    });
    const [locationFilter, setLocationFilter] = useState({
        enabled: initialFilters.locationFilter?.enabled || false,
        radius: initialFilters.locationFilter?.radius || 10
    });

    const toggleCategory = useCallback((categoryKey) => {
        setSelectedCategories(prev => {
            if (prev.includes(categoryKey)) {
                return prev.filter(key => key !== categoryKey);
            } else {
                return [...prev, categoryKey];
            }
        });
    }, []);

    const selectAllCategories = useCallback(() => {
        setSelectedCategories(POST_CATEGORY_DEFS.map(cat => cat.key));
    }, [POST_CATEGORY_DEFS]);

    const clearAllCategories = useCallback(() => {
        setSelectedCategories([]);
    }, []);

    const handleApplyFilters = useCallback(() => {
        const filters = {
            selectedCategories,
            priceRange: priceRange.enabled ? {
                min: priceRange.min,
                max: priceRange.max,
                enabled: true
            } : null,
            locationFilter: locationFilter.enabled && userLocation ? {
                radius: locationFilter.radius,
                enabled: true
            } : null,
        };

        onApplyFilters(filters);
        onClose();
    }, [
        selectedCategories,
        priceRange,
        locationFilter,
        userLocation,
        onApplyFilters,
        onClose
    ]);

    const handleResetFilters = useCallback(() => {
        setSelectedCategories([]);
        setPriceRange({ min: null, max: null, enabled: false });
        setLocationFilter({ enabled: false, radius: 10 });
    }, []);

    const activeFilterCount = useMemo(() => {
        let count = 0;
        if (selectedCategories.length > 0) count++;
        if (priceRange.enabled) count++;
        if (locationFilter.enabled) count++;
        return count;
    }, [selectedCategories, priceRange, locationFilter]);

    const renderCategoryItem = useCallback((category) => {
        const isSelected = selectedCategories.includes(category.key);

        return (
            <SelectionPop key={category.key} selected={isSelected}>
            <TouchableOpacity
                style={[
                    styles.categoryItem,
                    { backgroundColor: colors.background },
                    isSelected && styles.categoryItemSelected
                ]}
                onPress={() => toggleCategory(category.key)}
                activeOpacity={interactions.activeOpacity}
            >
                <View style={[
                    styles.categoryIcon,
                    { backgroundColor: isSelected ? category.color : colors.border.light }
                ]}>
                    <Ionicons
                        name={category.icon}
                        size={20}
                        color={isSelected ? colors.text.primary : colors.text.secondary}
                    />
                </View>
                <Text style={[
                    styles.categoryLabel,
                    isSelected && styles.categoryLabelSelected
                ]}>
                    {category.label || t(`category.${category.key}`, { defaultValue: category.key })}
                </Text>
                {isSelected && (
                    <Ionicons
                        name="checkmark-circle"
                        size={20}
                        color={category.color}
                    />
                )}
            </TouchableOpacity>
            </SelectionPop>
        );
    }, [selectedCategories, toggleCategory, styles, colors]);

    const titleComponent = (
        <View style={styles.headerLeft}>
            <Text style={{ ...typography.styles.title, color: colors.text.primary, }}>{t('common.filter')}</Text>
            {activeFilterCount > 0 && (
                <View style={styles.filterCountBadge}>
                    <Text style={styles.filterCountText}>
                        {activeFilterCount}
                    </Text>
                </View>
            )}
        </View>
    );

    return (
        <BottomSheetModal
            visible={visible}
            onClose={onClose}
            title={titleComponent}
            showCloseButton={false}
            footer={
                <View style={styles.modalFooterButtons}>
                    <Button
                        title={t('common.clear')}
                        onPress={handleResetFilters}
                        variant="outline"
                        size="medium"
                        style={styles.resetButton}
                    />
                    <Button
                        title={t('common.apply')}
                        onPress={handleApplyFilters}
                        variant="primary"
                        size="medium"
                        style={styles.applyButton}
                    />
                </View>
            }
        >
            <View style={styles.section}>
                <View style={styles.sectionHeader}>
                    <Text style={[styles.sectionTitle, { color: colors.text.primary }]}>{t('posts.category')}</Text>
                    <View style={styles.categoryActions}>
                        <TouchableOpacity
                            onPress={selectAllCategories}
                            style={styles.categoryAction}
                            activeOpacity={interactions.activeOpacityLight}
                            hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
                        >
                            <Text style={styles.categoryActionText}>{t('filter.all')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress={clearAllCategories}
                            style={styles.categoryAction}
                            activeOpacity={interactions.activeOpacityLight}
                            hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
                        >
                            <Text style={styles.categoryActionText}>{t('common.clear')}</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                <View style={styles.categoriesGrid}>
                    {POST_CATEGORY_DEFS.map(renderCategoryItem)}
                </View>
            </View>

            <View style={styles.section}>
                <View style={styles.sectionHeader}>
                    <Text style={[styles.sectionTitle, { color: colors.text.primary }]}>{t('common.price')}</Text>
                    <Switch
                        value={priceRange.enabled}
                        onValueChange={(enabled) =>
                            setPriceRange(prev => ({ ...prev, enabled }))
                        }
                        trackColor={{ false: colors.border.medium, true: colors.primary }}
                        thumbColor={colors.surface}
                    />
                </View>

                {priceRange.enabled && (
                    <View style={styles.priceRangeContent}>
                        <View style={styles.priceInputContainer}>
                            <View style={styles.priceInputGroup}>
                                <Text style={styles.priceLabel}>{t('filter.minPrice')}</Text>
                                <TextInput
                                    style={[styles.priceInput, { backgroundColor: colors.background, color: colors.text.primary, borderColor: colors.border.medium }]}
                                    value={priceRange.min != null ? priceRange.min.toLocaleString() : ''}
                                    onChangeText={(text) => {
                                        const cleaned = text.replace(/,/g, '');
                                        const value = cleaned === '' ? null : (parseInt(cleaned, 10) || 0);
                                        setPriceRange(prev => ({ ...prev, min: value }));
                                    }}
                                    keyboardType="numeric"
                                    placeholder="0"
                                />
                            </View>

                            <View style={styles.priceInputGroup}>
                                <Text style={styles.priceLabel}>{t('filter.maxPrice')}</Text>
                                <TextInput
                                    style={[styles.priceInput, { backgroundColor: colors.background, color: colors.text.primary, borderColor: colors.border.medium }]}
                                    value={priceRange.max != null ? priceRange.max.toLocaleString() : ''}
                                    onChangeText={(text) => {
                                        const cleaned = text.replace(/,/g, '');
                                        const value = cleaned === '' ? null : (parseInt(cleaned, 10) || 0);
                                        setPriceRange(prev => ({ ...prev, max: value }));
                                    }}
                                    keyboardType="numeric"
                                    placeholder="10,000,000"
                                />
                            </View>
                        </View>

                        <View style={styles.sliderContainer}>
                            <Text style={[styles.sliderLabel, { color: colors.text.primary }]}>
                                {(priceRange.min ?? 0).toLocaleString()} ₮ - {priceRange.max != null ? `${priceRange.max.toLocaleString()} ₮` : '∞'}
                            </Text>
                            <Slider
                                style={styles.slider}
                                minimumValue={0}
                                maximumValue={10000000}
                                value={priceRange.max ?? 10000000}
                                onValueChange={(value) =>
                                    setPriceRange(prev => ({ ...prev, max: Math.round(value) }))
                                }
                                minimumTrackTintColor={colors.primary}
                                maximumTrackTintColor={colors.border.medium}
                                thumbStyle={{ backgroundColor: colors.primary }}
                            />
                        </View>
                    </View>
                )}
            </View>

            {userLocation && (
                <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                        <Text style={[styles.sectionTitle, { color: colors.text.primary }]}>{t('map.filter')}</Text>
                        <Switch
                            value={locationFilter.enabled}
                            onValueChange={(enabled) =>
                                setLocationFilter(prev => ({ ...prev, enabled }))
                            }
                            trackColor={{ false: colors.border.medium, true: colors.primary }}
                            thumbColor={colors.surface}
                        />
                    </View>

                    {locationFilter.enabled && (
                        <View style={styles.locationContent}>
                            <Text style={[styles.locationDescription, { color: colors.text.secondary }]}>
                                {t('map.locationRadius', { radius: locationFilter.radius })}
                            </Text>

                            <View style={styles.radiusContainer}>
                                <Text style={[styles.radiusLabel, { color: colors.text.primary }]}>
                                    {t('map.radiusLabel', { radius: locationFilter.radius })}
                                </Text>
                                <Slider
                                    style={styles.slider}
                                    minimumValue={1}
                                    maximumValue={50}
                                    value={locationFilter.radius}
                                    onValueChange={(value) =>
                                        setLocationFilter(prev => ({ ...prev, radius: Math.round(value) }))
                                    }
                                    minimumTrackTintColor={colors.primary}
                                    maximumTrackTintColor={colors.border.medium}
                                    thumbStyle={{ backgroundColor: colors.primary }}
                                />
                            </View>
                        </View>
                    )}
                </View>
            )}
        </BottomSheetModal>
    );
};

const createStyles = (colors) => StyleSheet.create({
    headerLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    modalTitle: {
        ...typography.styles.h3,
        color: colors.text.primary,
        marginRight: spacing.sm,
    },
    filterCountBadge: {
        backgroundColor: colors.primary,
        borderRadius: radius.badge,
        minWidth: 20,
        height: 20,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: spacing.xs,
    },
    filterCountText: {
        color: colors.text.primary,
        ...typography.styles.badge,
    },
    headerButtons: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    resetButton: {
        marginRight: spacing.md,
        paddingVertical: spacing.xs,
        paddingHorizontal: spacing.sm,
    },
    resetButtonText: {
        color: colors.primary,
        ...typography.styles.labelStrong,
    },
    closeButton: {
        padding: spacing.xs,
    },
    section: {
        marginBottom: spacing.xl,
    },
    sectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: spacing.md,
    },
    sectionTitle: {
        ...typography.styles.h3,
        color: colors.text.primary,
    },
    categoryActions: {
        flexDirection: 'row',
    },
    categoryAction: {
        marginLeft: spacing.md,
        paddingVertical: spacing.xs,
        paddingHorizontal: spacing.sm,
    },
    categoryActionText: {
        color: colors.primary,
        ...typography.styles.label,
    },
    categoriesGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        marginHorizontal: -spacing.xs,
    },
    categoryItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: spacing.md,
        marginHorizontal: spacing.xs,
        marginBottom: spacing.sm,
        backgroundColor: colors.background,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.border.light,
        width: (screenWidth - spacing.lg * 2 - spacing.xs * 2) / 2 - spacing.xs,
    },
    categoryItemSelected: {
        borderColor: colors.primary,
        backgroundColor: colors.opacity.background.primary,
    },
    categoryIcon: {
        width: 32,
        height: 32,
        borderRadius: radius.lg,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: spacing.sm,
    },
    categoryLabel: {
        flex: 1,
        ...typography.styles.small,
        color: colors.text.secondary,
    },
    categoryLabelSelected: {
        ...typography.styles.micro,
        color: colors.text.primary,
    },
    priceRangeContent: {
        marginTop: spacing.md,
    },
    priceInputContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: spacing.md,
    },
    priceInputGroup: {
        flex: 1,
        marginHorizontal: spacing.xs,
    },
    priceLabel: {
        ...typography.styles.caption,
        color: colors.text.secondary,
        marginBottom: spacing.xs,
    },
    priceInput: {
        borderWidth: 1,
        borderColor: colors.border.medium,
        borderRadius: radius.sm,
        padding: spacing.md,
        ...typography.styles.body,
        color: colors.text.primary,
        backgroundColor: colors.background,
    },
    sliderContainer: {
        marginTop: spacing.md,
    },
    sliderLabel: {
        ...typography.styles.label,
        color: colors.text.primary,
        textAlign: 'center',
        marginBottom: spacing.sm,
    },
    slider: {
        width: '100%',
        height: 40,
    },
    locationContent: {
        marginTop: spacing.md,
    },
    locationDescription: {
        ...typography.styles.caption,
        color: colors.text.secondary,
        marginBottom: spacing.md,
        textAlign: 'center',
    },
    radiusContainer: {
        marginTop: spacing.sm,
    },
    radiusLabel: {
        ...typography.styles.label,
        color: colors.text.primary,
        textAlign: 'center',
        marginBottom: spacing.sm,
    },
    applyButton: {
        flex: 1,
    },
    modalFooterButtons: {
        flexDirection: 'row',
        gap: spacing.md,
        paddingHorizontal: spacing.lg,
    },
});

export default MapFilterModal;

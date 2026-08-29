import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet } from 'react-native';
import BottomSheetModal from './BottomSheetModal';
import Button from './Button';
import SelectionPop from './SelectionPop';
import { spacing, typography, radius, interactions } from '../design/theme';
import { useAppTheme } from '../hooks/useAppTheme';
import { useTranslation } from 'react-i18next';
import { provinces as PROVINCE_CODES, districts as DISTRICT_CODES } from '../config/app.config';

const SORT_OPTIONS = [
    { value: '' },
    { value: 'price_asc' },
    { value: 'price_desc' },
    { value: 'views' },
];

// Mirrors the engine's Status enum (ACTIVE/RENTED; EXPIRED is filtered out server-side)
const STATUS_OPTIONS = [
    { value: '' },
    { value: 'active' },
    { value: 'rented' },
];

/**
 * Browse-mode filter sheet for CustomerPostList. Every choice applies live —
 * `filters` is the screen's own state, the sheet only edits it. This is a
 * different vocabulary from MapFilterModal (multi-select categories, a price
 * slider, a radius, applied on confirm), so the two stay separate.
 */
const BrowseFilterSheet = ({ visible, onClose, onClear, filters, setFilters, categoryOptions }) => {
    const { colors } = useAppTheme();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const { t } = useTranslation();

    return (
    <BottomSheetModal
        visible={visible}
        onClose={onClose}
        title={t('filter.title')}
        footer={
            <View style={styles.modalFooterButtons}>
                <Button
                    title={t('common.clear')}
                    onPress={onClear}
                    variant="outline"
                    size="medium"
                    style={styles.modalFooterButton}
                />
                <Button
                    title={t('common.done')}
                    onPress={onClose}
                    variant="primary"
                    size="medium"
                    style={styles.modalFooterButton}
                />
            </View>
        }
    >
        <View style={styles.filterSection}>
            <Text style={[styles.filterLabel, { color: colors.text.secondary }]}>{t('filter.category')}</Text>
            <View style={styles.filterOptionsContainer}>
                {categoryOptions.map((cat) => (
                    <SelectionPop key={cat.value} selected={filters.category === cat.value}>
                        <TouchableOpacity
                            style={[
                                styles.filterOption,
                                filters.category === cat.value && styles.filterOptionActive,
                            ]}
                            onPress={() => setFilters(prev => ({ ...prev, category: cat.value }))}
                            activeOpacity={interactions.activeOpacity}
                        >
                            <Text style={[
                                styles.filterOptionText,
                                filters.category === cat.value && styles.filterOptionTextActive,
                            ]}>
                                {cat.label}
                            </Text>
                        </TouchableOpacity>
                    </SelectionPop>
                ))}
            </View>
        </View>

        <View style={styles.filterSection}>
            <Text style={[styles.filterLabel, { color: colors.text.secondary }]}>{t('filter.sortBy')}</Text>
            <View style={styles.filterOptionsContainer}>
                {SORT_OPTIONS.map((opt) => (
                    <SelectionPop key={opt.value} selected={filters.sort === opt.value}>
                        <TouchableOpacity
                            style={[
                                styles.filterOption,
                                filters.sort === opt.value && styles.filterOptionActive,
                            ]}
                            onPress={() => setFilters(prev => ({ ...prev, sort: opt.value }))}
                            activeOpacity={interactions.activeOpacity}
                        >
                            <Text style={[
                                styles.filterOptionText,
                                filters.sort === opt.value && styles.filterOptionTextActive,
                            ]}>
                                {t(`sort.${opt.value || 'newest'}`)}
                            </Text>
                        </TouchableOpacity>
                    </SelectionPop>
                ))}
            </View>
        </View>

        <View style={styles.filterSection}>
            <Text style={[styles.filterLabel, { color: colors.text.secondary }]}>{t('filter.priceRange')}</Text>
            <View style={styles.priceRangeRow}>
                <TextInput
                    style={[styles.locationInput, styles.priceRangeInput, {
                        backgroundColor: colors.background,
                        borderColor: colors.border.light,
                        color: colors.text.primary,
                    }]}
                    value={filters.priceMin}
                    onChangeText={(text) => setFilters(prev => ({ ...prev, priceMin: text.replace(/[^0-9]/g, '') }))}
                    placeholder={t('filter.minPrice')}
                    placeholderTextColor={colors.text.placeholder}
                    keyboardType="number-pad"
                />
                <TextInput
                    style={[styles.locationInput, styles.priceRangeInput, {
                        backgroundColor: colors.background,
                        borderColor: colors.border.light,
                        color: colors.text.primary,
                    }]}
                    value={filters.priceMax}
                    onChangeText={(text) => setFilters(prev => ({ ...prev, priceMax: text.replace(/[^0-9]/g, '') }))}
                    placeholder={t('filter.maxPrice')}
                    placeholderTextColor={colors.text.placeholder}
                    keyboardType="number-pad"
                />
            </View>
        </View>

        <View style={styles.filterSection}>
            <Text style={[styles.filterLabel, { color: colors.text.secondary }]}>{t('filter.status')}</Text>
            <View style={styles.filterOptionsContainer}>
                {STATUS_OPTIONS.map((status) => (
                    <SelectionPop key={status.value} selected={filters.status === status.value}>
                        <TouchableOpacity
                            style={[
                                styles.filterOption,
                                filters.status === status.value && styles.filterOptionActive,
                            ]}
                            onPress={() => setFilters(prev => ({ ...prev, status: status.value }))}
                            activeOpacity={interactions.activeOpacity}
                        >
                            <Text style={[
                                styles.filterOptionText,
                                filters.status === status.value && styles.filterOptionTextActive,
                            ]}>
                                {status.value ? t(`status.${status.value}`, { defaultValue: status.value }) : t('filter.allStatuses')}
                            </Text>
                        </TouchableOpacity>
                    </SelectionPop>
                ))}
            </View>
        </View>

        {/* Province/district are enum codes server-side; the old free-text
            box compared what the user typed ("Баянзүрх") against the raw
            code ("BAYANZURKH") and matched nothing. */}
        <View style={styles.filterSection}>
            <Text style={[styles.filterLabel, { color: colors.text.secondary }]}>{t('common.province')}</Text>
            <View style={styles.filterOptionsContainer}>
                {[''].concat(PROVINCE_CODES).map((code) => {
                    const isActive = filters.province === code;
                    return (
                        <SelectionPop key={code || 'all'} selected={isActive}>
                            <TouchableOpacity
                                style={[styles.filterOption, isActive && styles.filterOptionActive]}
                                onPress={() => setFilters(prev => ({
                                    ...prev,
                                    province: code,
                                    // District only exists inside Ulaanbaatar — never leave a
                                    // stale district narrowing a different province to zero.
                                    district: code === 'ULAANBAATAR' ? prev.district : '',
                                }))}
                                activeOpacity={interactions.activeOpacity}
                            >
                                <Text style={[styles.filterOptionText, isActive && styles.filterOptionTextActive]}>
                                    {code ? t(`province.${code}`, { defaultValue: code }) : t('filter.all')}
                                </Text>
                            </TouchableOpacity>
                        </SelectionPop>
                    );
                })}
            </View>
        </View>

        {filters.province === 'ULAANBAATAR' && (
            <View style={styles.filterSection}>
                <Text style={[styles.filterLabel, { color: colors.text.secondary }]}>{t('common.district')}</Text>
                <View style={styles.filterOptionsContainer}>
                    {[''].concat(DISTRICT_CODES).map((code) => {
                        const isActive = filters.district === code;
                        return (
                            <SelectionPop key={code || 'all'} selected={isActive}>
                                <TouchableOpacity
                                    style={[styles.filterOption, isActive && styles.filterOptionActive]}
                                    onPress={() => setFilters(prev => ({ ...prev, district: code }))}
                                    activeOpacity={interactions.activeOpacity}
                                >
                                    <Text style={[styles.filterOptionText, isActive && styles.filterOptionTextActive]}>
                                        {code ? t(`district.${code}`, { defaultValue: code }) : t('filter.all')}
                                    </Text>
                                </TouchableOpacity>
                            </SelectionPop>
                        );
                    })}
                </View>
            </View>
        )}
    </BottomSheetModal>
    );
};

const createStyles = (colors) => StyleSheet.create({
    filterSection: {
        marginBottom: spacing.xl,
    },
    filterLabel: {
        ...typography.styles.bodyBold,
        color: colors.text.primary,
        marginBottom: spacing.md,
    },
    filterOptionsContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: spacing.sm,
    },
    filterOption: {
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        borderRadius: radius.xxl,
        borderWidth: 1,
        borderColor: colors.border.medium,
        backgroundColor: colors.background,
    },
    filterOptionActive: {
        backgroundColor: colors.primary,
        borderColor: colors.primary,
    },
    filterOptionText: {
        ...typography.styles.caption,
        color: colors.text.primary,
    },
    filterOptionTextActive: {
        ...typography.styles.labelStrong,
        color: colors.onPrimary,
    },
    locationInput: {
        borderWidth: 1,
        borderColor: colors.border.medium,
        borderRadius: radius.input,
        padding: spacing.md,
        ...typography.styles.body,
        lineHeight: undefined,
        color: colors.text.primary,
        backgroundColor: colors.background,
    },
    priceRangeRow: {
        flexDirection: 'row',
        gap: spacing.sm,
    },
    priceRangeInput: {
        flex: 1,
    },
    modalFooterButtons: {
        flexDirection: 'row',
        gap: spacing.md,
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.md,
    },
    modalFooterButton: {
        flex: 1,
    },
});

export default BrowseFilterSheet;

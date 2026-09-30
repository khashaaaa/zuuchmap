import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet } from 'react-native';
import BottomSheetModal from './BottomSheetModal';
import Button from './Button';
import SelectionPop from './SelectionPop';
import { spacing, typography, radius, interactions } from '../design/theme';
import { useAppTheme } from '../hooks/useAppTheme';
import { useTranslation } from 'react-i18next';
import { provinces as PROVINCE_CODES, districts as DISTRICT_CODES } from '../config/app.config';
import { sortByLabel } from '../utils/displayUtils';
import { getSubcategoryLabel } from '../utils/postUtils';
import { fieldLabel, optionLabel } from './DynamicForm';

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
const BrowseFilterSheet = ({ visible, onClose, onClear, filters, setFilters, categoryOptions, schema }) => {
    const { colors } = useAppTheme();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const { t, i18n } = useTranslation();

    // Chips read in Mongolian dictionary order, not in the order the Latin enum
    // codes happen to fall in. Ulaanbaatar stays pinned first.
    const provinceCodes = useMemo(
        () => sortByLabel(PROVINCE_CODES, (c) => t(`province.${c}`, { defaultValue: c }), ['ULAANBAATAR']),
        [t, i18n.language],
    );
    const districtCodes = useMemo(
        () => sortByLabel(DISTRICT_CODES, (c) => t(`district.${c}`, { defaultValue: c })),
        [t, i18n.language],
    );

    // The chosen category's own narrowing: its subcategories and whichever
    // fields the admin marked `filterable`. Schema-driven, like the web's.
    const subcategories = schema?.subcategories ?? [];
    const filterFields = useMemo(() => schema?.fields?.filter((f) => f.filterable) ?? [], [schema]);
    const setAttr = (key, value) => setFilters((prev) => ({ ...prev, attrs: { ...prev.attrs, [key]: value } }));
    const inputStyle = [styles.locationInput, {
        backgroundColor: colors.background,
        borderColor: colors.border.light,
        color: colors.text.primary,
    }];
    const chip = (key, label, isActive, onPress) => (
        <SelectionPop key={key} selected={isActive}>
            <TouchableOpacity
                style={[styles.filterOption, isActive && styles.filterOptionActive]}
                onPress={onPress}
                activeOpacity={interactions.activeOpacity}
            >
                <Text style={[styles.filterOptionText, isActive && styles.filterOptionTextActive]}>{label}</Text>
            </TouchableOpacity>
        </SelectionPop>
    );

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
                            // Subcategory and attribute filters belong to the category being left.
                            onPress={() => setFilters(prev => (prev.category === cat.value
                                ? prev
                                : { ...prev, category: cat.value, subcategory: '', attrs: {} }))}
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

        {subcategories.length > 0 && (
            <View style={styles.filterSection}>
                <Text style={[styles.filterLabel, { color: colors.text.secondary }]}>{t('filter.subcategory')}</Text>
                <View style={styles.filterOptionsContainer}>
                    {chip('all', t('filter.all'), !filters.subcategory, () => setFilters(prev => ({ ...prev, subcategory: '' })))}
                    {subcategories.map((sub) => chip(
                        sub.value,
                        getSubcategoryLabel(sub.value, schema) || sub.value,
                        filters.subcategory === sub.value,
                        () => setFilters(prev => ({ ...prev, subcategory: sub.value })),
                    ))}
                </View>
            </View>
        )}

        {filterFields.length > 0 && (
            <View style={styles.filterSection}>
                <Text style={[styles.filterLabel, { color: colors.text.secondary }]}>{t('filter.specs')}</Text>
                {filterFields.map((f) => (
                    <View key={f.key} style={styles.attrField}>
                        <Text style={[styles.attrLabel, { color: colors.text.secondary }]}>{fieldLabel(f, t, i18n.language)}</Text>
                        {f.type === 'boolean' ? (
                            // The engine matches a real JSON boolean, so this is
                            // yes / no / either — never free text.
                            <View style={styles.filterOptionsContainer}>
                                {chip('all', t('filter.all'), !filters.attrs[f.key], () => setAttr(f.key, ''))}
                                {chip('true', t('common.yes'), filters.attrs[f.key] === 'true', () => setAttr(f.key, 'true'))}
                                {chip('false', t('common.no'), filters.attrs[f.key] === 'false', () => setAttr(f.key, 'false'))}
                            </View>
                        ) : (f.type === 'select' || f.type === 'multiselect') ? (
                            <View style={styles.filterOptionsContainer}>
                                {chip('all', t('filter.all'), !filters.attrs[f.key], () => setAttr(f.key, ''))}
                                {(f.options ?? []).map((o) => chip(
                                    o, optionLabel(o, t), filters.attrs[f.key] === o, () => setAttr(f.key, o),
                                ))}
                            </View>
                        ) : f.type === 'number' ? (
                            <View style={styles.priceRangeRow}>
                                <TextInput
                                    style={[inputStyle, styles.priceRangeInput]}
                                    value={String(filters.attrs[`${f.key}_min`] ?? '')}
                                    onChangeText={(text) => setAttr(`${f.key}_min`, text.replace(/[^0-9.]/g, ''))}
                                    placeholder={t('filter.min')}
                                    placeholderTextColor={colors.text.placeholder}
                                    keyboardType="decimal-pad"
                                />
                                <TextInput
                                    style={[inputStyle, styles.priceRangeInput]}
                                    value={String(filters.attrs[`${f.key}_max`] ?? '')}
                                    onChangeText={(text) => setAttr(`${f.key}_max`, text.replace(/[^0-9.]/g, ''))}
                                    placeholder={t('filter.max')}
                                    placeholderTextColor={colors.text.placeholder}
                                    keyboardType="decimal-pad"
                                />
                            </View>
                        ) : (
                            <TextInput
                                style={inputStyle}
                                value={String(filters.attrs[f.key] ?? '')}
                                onChangeText={(text) => setAttr(f.key, text)}
                                placeholderTextColor={colors.text.placeholder}
                            />
                        )}
                    </View>
                ))}
            </View>
        )}

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
                {[''].concat(provinceCodes).map((code) => {
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
                    {[''].concat(districtCodes).map((code) => {
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
    attrField: {
        marginBottom: spacing.md,
    },
    attrLabel: {
        ...typography.styles.caption,
        marginBottom: spacing.xs,
    },
    priceRangeRow: {
        flexDirection: 'row',
        gap: spacing.sm,
    },
    priceRangeInput: {
        flex: 1,
    },
    // No padding of its own: BottomSheetModal's footer already insets its
    // content by lg, and a second lg here pulled the buttons in past the
    // edge of the chips and fields above them.
    modalFooterButtons: {
        flexDirection: 'row',
        gap: spacing.md,
    },
    modalFooterButton: {
        flex: 1,
    },
});

export default BrowseFilterSheet;

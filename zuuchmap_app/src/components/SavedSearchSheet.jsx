import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { spacing, typography, radius, withAlpha } from '../design/theme';
import { useAppTheme } from '../hooks/useAppTheme';
import { useCategorySchemas } from '../hooks/useCategorySchemas';
import { getSchemaLabel, getSubcategoryLabel, normalizePostType } from '../utils/postUtils';
import savedSearchService, { SAVED_SEARCHES_KEY } from '../services/api/savedSearchService';
import { getErrorMessage } from '../utils/errorManager';
import BottomSheetModal from './BottomSheetModal';
import TextInput from './TextInput';
import Button from './Button';

/**
 * Chips describing the filter set about to be saved — the user should see
 * exactly what they will be alerted for before naming it.
 */
export function useSavedSearchSummary(search) {
    const { t } = useTranslation();
    const schemas = useCategorySchemas();
    return useMemo(() => {
        if (!search) return [];
        const chips = [];
        if (search.category) {
            const key = normalizePostType(search.category);
            const schema = schemas.find((s) => s.key === key);
            let label = schema ? getSchemaLabel(schema) : t(`category.${key}`, { defaultValue: key });
            if (search.subcategory) {
                const sub = schema ? getSubcategoryLabel(search.subcategory, schema) : search.subcategory;
                label = `${label} · ${sub}`;
            }
            chips.push({ icon: 'grid-outline', label });
        }
        if (search.province) {
            let label = t(`province.${search.province}`, { defaultValue: search.province });
            if (search.district) label = `${t(`district.${search.district}`, { defaultValue: search.district })}, ${label}`;
            chips.push({ icon: 'location-outline', label });
        }
        if (search.q) chips.push({ icon: 'search-outline', label: `“${search.q}”` });
        const attrs = search.attrs && typeof search.attrs === 'object' ? Object.entries(search.attrs) : [];
        for (const [k, v] of attrs) {
            if (v === undefined || v === null || v === '') continue;
            const key = k.replace(/^attr\./, '');
            chips.push({ icon: 'options-outline', label: `${key.replace(/_(min|max)$/, (m) => (m === '_min' ? ' ≥' : ' ≤'))} ${v}` });
        }
        return chips;
    }, [search, schemas, t]);
}

const SavedSearchSheet = ({ visible, onClose, filters, onSaved }) => {
    const { colors } = useAppTheme();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const { t } = useTranslation();
    const qc = useQueryClient();
    const [name, setName] = useState('');
    const [error, setError] = useState(null);
    const chips = useSavedSearchSummary(filters);

    useEffect(() => {
        if (visible) { setName(''); setError(null); }
    }, [visible]);

    const mut = useMutation({
        mutationFn: () => savedSearchService.create({ name: name.trim(), ...(filters || {}) }),
        onSuccess: (saved) => {
            qc.invalidateQueries({ queryKey: SAVED_SEARCHES_KEY });
            onSaved?.(saved);
            onClose();
        },
        onError: (e) => {
            setError(savedSearchService.isLimitError(e)
                ? t('savedSearch.limit')
                : (getErrorMessage(e) || t('savedSearch.saveError')));
        },
    });

    const submit = useCallback(() => {
        if (!name.trim() || mut.isPending) return;
        setError(null);
        mut.mutate();
    }, [name, mut]);

    return (
        <BottomSheetModal
            visible={visible}
            onClose={onClose}
            title={t('savedSearch.save')}
            footer={(
                <Button
                    title={t('common.save')}
                    onPress={submit}
                    loading={mut.isPending}
                    disabled={!name.trim() || mut.isPending}
                    icon="bookmark-outline"
                />
            )}
        >
            <Text style={styles.hint}>{t('savedSearch.hint')}</Text>

            <View style={styles.chips}>
                {chips.length === 0 ? (
                    <Text style={styles.noFilters}>{t('savedSearch.noFilters')}</Text>
                ) : chips.map((c, i) => (
                    <View key={`${c.icon}-${i}`} style={styles.chip}>
                        <Ionicons name={c.icon} size={13} color={colors.iconAccent} />
                        <Text style={styles.chipText} numberOfLines={1}>{c.label}</Text>
                    </View>
                ))}
            </View>

            <TextInput
                label={t('savedSearch.nameLabel')}
                value={name}
                onChangeText={(v) => { setName(v); if (error) setError(null); }}
                placeholder={t('savedSearch.namePlaceholder')}
                maxLength={60}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={submit}
                error={error}
            />
        </BottomSheetModal>
    );
};

const createStyles = (colors) => StyleSheet.create({
    hint: {
        ...typography.styles.caption,
        color: colors.text.secondary,
        marginBottom: spacing.md,
    },
    chips: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: spacing.xs,
        marginBottom: spacing.lg,
    },
    chip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xxs,
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.xxs,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: withAlpha(colors.primary, 0.33),
        backgroundColor: colors.opacity.background.primary,
        maxWidth: '100%',
    },
    chipText: {
        ...typography.styles.badge,
        color: colors.text.link,
        flexShrink: 1,
    },
    noFilters: {
        ...typography.styles.caption,
        color: colors.text.tertiary,
        fontStyle: 'italic',
    },
});

export default SavedSearchSheet;

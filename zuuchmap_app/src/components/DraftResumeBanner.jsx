import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { spacing, typography, radius } from '../design/theme';
import { useAppTheme } from '../hooks/useAppTheme';
import PressableScale from './PressableScale';

const MAX_FONT_SCALE = 1.3;

// "saved 5 min ago" — coarse buckets are enough; nobody needs seconds here.
const relativeAge = (savedAt, t) => {
    const mins = Math.max(0, Math.round((Date.now() - savedAt) / 60000));
    if (mins < 1) return t('provider.draftJustNow');
    if (mins < 60) return t('provider.draftMinutesAgo', { count: mins });
    const hours = Math.round(mins / 60);
    if (hours < 24) return t('provider.draftHoursAgo', { count: hours });
    return t('provider.draftDaysAgo', { count: Math.round(hours / 24) });
};

/**
 * Offered at the top of a fresh create form when a draft for this category is
 * on disk. The form stays blank until the provider chooses — silently
 * restoring surprised people who had deliberately abandoned the last attempt.
 */
const DraftResumeBanner = ({ savedAt, onResume, onDiscard }) => {
    const { colors } = useAppTheme();
    const { t } = useTranslation();
    const styles = useMemo(() => createStyles(colors), [colors]);

    return (
        <View style={styles.card} accessibilityRole="alert">
            <View style={styles.iconWrap}>
                <Ionicons name="document-text-outline" size={20} color={colors.iconAccent} />
            </View>
            <View style={styles.body}>
                <Text style={styles.title} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                    {t('provider.draftResumeTitle')}
                </Text>
                <Text style={styles.meta} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                    {t('provider.draftSavedAgo', { time: relativeAge(savedAt, t) })}
                </Text>
                <View style={styles.actions}>
                    <PressableScale style={styles.primary} onPress={onResume} accessibilityRole="button">
                        <Text style={styles.primaryText} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                            {t('provider.draftResume')}
                        </Text>
                    </PressableScale>
                    <PressableScale style={styles.secondary} onPress={onDiscard} accessibilityRole="button">
                        <Text style={styles.secondaryText} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                            {t('provider.draftDiscard')}
                        </Text>
                    </PressableScale>
                </View>
            </View>
        </View>
    );
};

const createStyles = (colors) => StyleSheet.create({
    card: {
        ...colors.elevation.selected,
        flexDirection: 'row',
        gap: spacing.md,
        padding: spacing.md,
        marginBottom: spacing.lg,
        borderRadius: radius.card,
        backgroundColor: colors.surfaceElevated,
    },
    iconWrap: {
        width: 36,
        height: 36,
        borderRadius: radius.full,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.opacity.background.primary,
    },
    body: { flex: 1, gap: spacing.xxs },
    title: { ...typography.styles.bodyBold, color: colors.text.primary },
    meta: { ...typography.styles.caption, color: colors.text.secondary },
    actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
    primary: {
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.lg,
        borderRadius: radius.full,
        backgroundColor: colors.primary,
    },
    primaryText: { ...typography.styles.labelStrong, color: colors.onPrimary },
    secondary: {
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.lg,
        borderRadius: radius.full,
        borderWidth: 1,
        borderColor: colors.border.medium,
    },
    secondaryText: { ...typography.styles.labelStrong, color: colors.text.secondary },
});

export default DraftResumeBanner;

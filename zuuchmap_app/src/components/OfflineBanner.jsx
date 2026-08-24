import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { spacing, typography } from '../design/theme';
import { useAppTheme } from '../hooks/useAppTheme';

/** "2h ago" for a timestamp; null timestamps read as "just now". */
export const humanizeAgo = (t, cachedAt) => {
    if (!cachedAt) return t('offline.justNow');
    const mins = Math.max(0, Math.round((Date.now() - cachedAt) / 60000));
    if (mins < 1) return t('offline.justNow');
    if (mins < 60) return t('offline.minutesAgo', { count: mins });
    const hours = Math.round(mins / 60);
    if (hours < 24) return t('offline.hoursAgo', { count: hours });
    return t('offline.daysAgo', { count: Math.round(hours / 24) });
};

/**
 * A quiet strip above a list when the service handed back its offline
 * fallback. Warning-tinted rather than red: nothing failed for the reader,
 * they are just looking at yesterday's marketplace.
 */
const OfflineBanner = ({ visible, cachedAt, style }) => {
    const { colors } = useAppTheme();
    const { t } = useTranslation();
    const styles = useMemo(() => createStyles(colors), [colors]);
    if (!visible) return null;
    return (
        <View style={[styles.wrap, style]} accessibilityRole="alert" accessibilityLiveRegion="polite">
            <Ionicons name="cloud-offline-outline" size={14} color={colors.warning} />
            <Text style={styles.text} numberOfLines={1}>
                {t('offline.banner', { ago: humanizeAgo(t, cachedAt) })}
            </Text>
        </View>
    );
};

const createStyles = (colors) => StyleSheet.create({
    wrap: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.sm,
        backgroundColor: colors.opacity.background.warning,
        borderBottomWidth: 1,
        borderBottomColor: colors.opacity.border.warning,
    },
    text: { ...typography.styles.small, color: colors.text.secondary, flexShrink: 1 },
});

export default React.memo(OfflineBanner);

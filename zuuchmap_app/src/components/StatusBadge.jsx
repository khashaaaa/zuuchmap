import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { spacing, typography, radius, shadows } from '../design/theme';
import { useAppTheme } from '../hooks/useAppTheme';
import { useTranslation } from 'react-i18next';
import { getStatusConfig } from '../utils/postUtils';

const StatusBadge = ({
    status,
    label,
    color,
    variant = 'default',
    showIndicator = true,
    showIcon = false,
    position = 'absolute'
}) => {
    const { colors } = useAppTheme();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const { t } = useTranslation();

    const statusConfig = status ? getStatusConfig(status, colors) : null;
    const bgColor = color || statusConfig?.color || colors.primary;
    const displayLabel = label || (status ? t('status.' + status.toLowerCase()) : '');

    if (!displayLabel && !status) return null;

    const isAbsolute = position === 'absolute';
    const isOverlay = variant === 'overlay';
    const isInline = variant === 'inline';

    const getStatusIcon = () => {
        if (!status) return null;
        const statusUpper = status.toUpperCase();
        if (statusUpper === 'ACTIVE') return 'checkmark-circle';
        if (statusUpper === 'RENTED') return 'checkmark-done-circle';
        if (statusUpper === 'EXPIRED') return 'close-circle';
        return 'information-circle';
    };

    return (
        <View style={[
            styles.badge,
            isAbsolute && styles.badgeAbsolute,
            isOverlay && styles.badgeOverlay,
            isInline && styles.badgeInline,
            { backgroundColor: bgColor }
        ]}>
            {showIndicator && !isInline && (
                <View style={styles.indicator} />
            )}
            {showIcon && (
                <Ionicons
                    name={getStatusIcon()}
                    size={12}
                    color={colors.text.inverse}
                    style={styles.icon}
                />
            )}
            <Text style={styles.badgeText}>{displayLabel}</Text>
        </View>
    );
};

const createStyles = (colors) => StyleSheet.create({
    badge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: spacing.xs,
        paddingVertical: spacing.xxs,
        borderRadius: radius.sm,
        gap: spacing.xs,
        alignSelf: 'flex-start',
    },
    badgeAbsolute: {
        position: 'absolute',
        bottom: spacing.xs,
        right: spacing.xs,
        zIndex: 2,
    },
    badgeOverlay: {
        position: 'absolute',
        top: spacing.sm,
        right: spacing.sm,
    },
    badgeInline: {
        position: 'relative',
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.xs,
    },
    indicator: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: colors.text.inverse,
    },
    icon: {
        marginRight: spacing.xxs,
    },
    badgeText: {
        fontSize: typography.xs,
        color: colors.text.inverse,
        fontWeight: '700',
    },
});

export default React.memo(StatusBadge);

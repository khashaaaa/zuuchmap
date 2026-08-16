import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { spacing, typography, radius } from '../design/theme';
import { useAppTheme } from '../hooks/useAppTheme';
import { useTranslation } from 'react-i18next';

const ProfileBadge = ({
    type = 'customer', // 'customer' | 'provider'
    text,
    icon,
    backgroundColor,
    iconColor
}) => {
    const { colors } = useAppTheme();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const { t } = useTranslation();
    const isProvider = type === 'provider';
    const defaultIcon = isProvider ? 'business-outline' : 'person-outline';
    const defaultText = isProvider ? t('onboarding.provider').toUpperCase() : t('onboarding.customer').toUpperCase();
    const defaultBg = isProvider
        ? colors.opacity.background.primary
        : colors.opacity.background.success;
    const defaultIconColor = iconColor || colors.primary;

    return (
        <View style={[
            styles.badge,
            { backgroundColor: backgroundColor || defaultBg }
        ]}>
            <Ionicons
                name={icon || defaultIcon}
                size={14}
                color={defaultIconColor}
                style={styles.icon}
            />
            <Text style={styles.badgeText}>
                {text || defaultText}
            </Text>
        </View>
    );
};

const createStyles = (colors) => StyleSheet.create({
    badge: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.xs,
        borderRadius: radius.lg,
        gap: spacing.xs,
    },
    icon: {
        marginRight: spacing.xxs,
    },
    badgeText: {
        fontSize: typography.xs,
        color: colors.primary,
        fontWeight: '600',
        letterSpacing: 0.5,
    },
});

export default ProfileBadge;

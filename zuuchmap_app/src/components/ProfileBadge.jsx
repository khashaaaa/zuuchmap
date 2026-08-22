import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { spacing, typography, radius } from '../design/theme';
import { useAppTheme } from '../hooks/useAppTheme';
import { useTranslation } from 'react-i18next';

// Tint and ink always come from the same hue — a green pill with amber text
// reads as two unrelated signals stacked on one another.
const VARIANTS = (colors) => ({
    provider: { icon: 'business-outline', bg: colors.opacity.background.primary, fg: colors.primary },
    customer: { icon: 'person-outline', bg: colors.opacity.background.success, fg: colors.success },
    admin: { icon: 'shield-checkmark-outline', bg: colors.opacity.background.warning, fg: colors.warning },
});

const ProfileBadge = ({
    type = 'customer', // 'customer' | 'provider' | 'admin'
    text,
    icon,
    backgroundColor,
    iconColor
}) => {
    const { colors } = useAppTheme();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const { t } = useTranslation();
    const variant = VARIANTS(colors)[type] ?? VARIANTS(colors).customer;
    const labelKey = { provider: 'onboarding.provider', customer: 'onboarding.customer', admin: 'admin.role' }[type]
        ?? 'onboarding.customer';
    const fg = iconColor || variant.fg;

    return (
        <View style={[
            styles.badge,
            { backgroundColor: backgroundColor || variant.bg }
        ]}>
            <Ionicons
                name={icon || variant.icon}
                size={14}
                color={fg}
            />
            <Text style={[styles.badgeText, { color: fg }]}>
                {text || t(labelKey).toUpperCase()}
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
    badgeText: {
        ...typography.styles.badge,
    },
});

export default ProfileBadge;

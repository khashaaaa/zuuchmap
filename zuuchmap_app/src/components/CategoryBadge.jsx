import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { spacing, typography, radius } from '../design/theme';
import { useAppTheme } from '../hooks/useAppTheme';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import { getPostTypeConfig, normalizePostType } from '../utils/postUtils';

const CategoryBadge = ({
    postType,
    text,
    backgroundColor,
    textColor,
    showIcon = true,
    size = 'default'
}) => {
    const { t } = useTranslation();
    const { colors } = useAppTheme();
    const normalizedType = normalizePostType(postType);
    const postTypeConfig = getPostTypeConfig(normalizedType, colors);

    const bgColor = backgroundColor || postTypeConfig?.backgroundColor || colors.primary;
    const categoryKey = 'category.' + normalizedType
    const displayText = text || (normalizedType
        ? (i18n.exists(categoryKey) ? t(categoryKey) : postType)
        : postType) || '';
    const iconName = postTypeConfig?.iconName || 'pricetag-outline';

    // Determine text color: if custom textColor provided, use it
    // Otherwise, if background is semi-transparent (opacity), use primary color
    // Otherwise, use inverse (white) for solid backgrounds
    const isSemiTransparent = bgColor && (
        bgColor.includes('rgba') ||
        bgColor === colors.opacity.background.primary ||
        bgColor === colors.opacity.background.primaryLight ||
        bgColor === colors.opacity.background.primaryMedium ||
        bgColor === colors.opacity.background.primaryDark ||
        bgColor === colors.opacity.background.success ||
        bgColor === colors.opacity.background.danger ||
        bgColor === colors.opacity.background.warning ||
        bgColor === colors.opacity.background.info
    );

    const finalTextColor = textColor || (isSemiTransparent ? colors.primary : colors.text.onColor);
    const finalIconColor = isSemiTransparent ? colors.primary : colors.text.onColor;

    return (
        <View style={[
            styles.badge,
            size === 'small' && styles.badgeSmall,
            { backgroundColor: bgColor }
        ]}>
            {showIcon && (
                <Ionicons
                    name={iconName}
                    size={size === 'small' ? 12 : 14}
                    color={finalIconColor}
                    style={styles.icon}
                />
            )}
            <Text style={[
                styles.badgeText,
                size === 'small' && styles.badgeTextSmall,
                { color: finalTextColor }
            ]}>
                {displayText}
            </Text>
        </View>
    );
};

const styles = StyleSheet.create({
    badge: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.xs,
        borderRadius: radius.sm,
        gap: spacing.xs,
    },
    badgeSmall: {
        paddingHorizontal: spacing.xs,
        paddingVertical: spacing.xxs,
    },
    icon: {
        marginRight: spacing.xxs,
    },
    badgeText: {
        fontSize: typography.xs,
        fontWeight: '700',
    },
    badgeTextSmall: {
        fontSize: typography.xs,
    },
});

export default React.memo(CategoryBadge);


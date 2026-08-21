import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { spacing, typography, radius, withAlpha, toneForTheme } from '../design/theme';
import { useAppTheme } from '../hooks/useAppTheme';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import { getPostTypeConfig, normalizePostType, getSchemaLabel } from '../utils/postUtils';
import { useCategorySchemas } from '../hooks/useCategorySchemas';

const CategoryBadge = ({
    postType,
    text,
    backgroundColor,
    textColor,
    showIcon = true,
    size = 'default'
}) => {
    const { t } = useTranslation();
    const { colors, isDark } = useAppTheme();
    const schemas = useCategorySchemas();
    const normalizedType = normalizePostType(postType);
    const postTypeConfig = getPostTypeConfig(normalizedType, colors, schemas);
    const schema = schemas.find((s) => s.key === normalizedType);

    // Every badge used to fall back to `colors.primary`, which painted all eight
    // verticals amber — the accent colour ended up on every card in a list and
    // stopped meaning anything. A badge now wears its own category colour as a
    // tint, with the text re-lit for the active theme so it clears 4.5:1.
    const categoryColor = postTypeConfig?.color || colors.primary;
    const tinted = !backgroundColor;
    const bgColor = backgroundColor || withAlpha(categoryColor, isDark ? 0.18 : 0.12);

    // Schema labels win, then client i18n, then the raw key.
    const categoryKey = 'category.' + normalizedType
    const displayText = text || (normalizedType
        ? (schema ? getSchemaLabel(schema) : (i18n.exists(categoryKey) ? t(categoryKey) : postType))
        : postType) || '';
    const iconName = postTypeConfig?.iconName || 'pricetag-outline';

    const foreground = textColor
        || (tinted ? toneForTheme(categoryColor, isDark) : colors.text.onColor);

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
                    color={foreground}
                    style={styles.icon}
                />
            )}
            <Text style={[
                styles.badgeText,
                size === 'small' && styles.badgeTextSmall,
                { color: foreground }
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
        ...typography.styles.badge,
    },
    badgeTextSmall: {
        ...typography.styles.small,
    },
});

export default React.memo(CategoryBadge);


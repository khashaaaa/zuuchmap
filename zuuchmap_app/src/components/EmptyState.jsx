import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { spacing, typography, shadows, radius, interactions } from '../design/theme';
import { useAppTheme } from '../hooks/useAppTheme';

const EmptyState = ({
    icon = 'document-outline',
    iconSize = 48,
    title,
    subtitle,
    actionButton,
    variant = 'default'
}) => {
    const { colors } = useAppTheme();
    const styles = useMemo(() => createStyles(colors), [colors]);

    const getIconColor = () => {
        if (variant === 'search') return colors.primary;
        return colors.text.tertiary;
    };

    return (
        <View style={styles.container}>
            <View style={styles.iconContainer}>
                <Ionicons name={icon} size={iconSize} color={getIconColor()} />
            </View>
            {title && (
                <Text style={styles.title}>{title}</Text>
            )}
            {subtitle && (
                <Text style={styles.subtitle}>{subtitle}</Text>
            )}
            {actionButton?.onPress && (
                <TouchableOpacity
                    style={styles.actionButton}
                    onPress={actionButton.onPress}
                    activeOpacity={interactions.activeOpacity}
                >
                    {actionButton?.icon && (
                        <Ionicons
                            name={actionButton.icon}
                            size={20}
                            color={colors.text.inverse}
                            style={styles.actionIcon}
                        />
                    )}
                    {actionButton?.text && (
                        <Text style={styles.actionButtonText}>{actionButton.text}</Text>
                    )}
                </TouchableOpacity>
            )}
        </View>
    );
};

const createStyles = (colors) => StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: spacing.xxxl,
        paddingHorizontal: spacing.xl,
    },
    iconContainer: {
        width: 96,
        height: 96,
        borderRadius: radius.full,
        backgroundColor: colors.surface,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: spacing.lg,
        borderWidth: 2,
        borderColor: colors.border.light,
    },
    title: {
        fontSize: typography.lg,
        fontWeight: '600',
        color: colors.text.primary,
        marginBottom: spacing.sm,
        textAlign: 'center',
    },
    subtitle: {
        fontSize: typography.sm,
        color: colors.text.secondary,
        textAlign: 'center',
        paddingHorizontal: spacing.xl,
        lineHeight: 20,
        marginBottom: spacing.sm,
    },
    actionButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.primary,
        paddingHorizontal: spacing.xl,
        paddingVertical: spacing.lg,
        borderRadius: radius.button,
        gap: spacing.sm,
        minHeight: 48,
        ...shadows.small,
    },
    actionIcon: {
        marginRight: 0,
    },
    actionButtonText: {
        fontSize: typography.md,
        fontWeight: '600',
        color: colors.text.inverse,
    },
});

export default EmptyState;

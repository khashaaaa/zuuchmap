import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { spacing, typography, radius, interactions } from '../design/theme';
import { useAppTheme } from '../hooks/useAppTheme';

/**
 * Wrapper for a profile section (card-style block).
 */
export const ProfileSection = ({ title, icon, children, style }) => {
    const { colors } = useAppTheme();
    return (
        <View style={[styles.section, style]}>
            {(title || icon) && (
                <View style={styles.sectionHeader}>
                    {icon && (
                        <View style={[styles.sectionIconContainer, { backgroundColor: colors.opacity.background.primary }]}>
                            <Ionicons name={icon} size={18} color={colors.primary} />
                        </View>
                    )}
                    {title && <Text style={[styles.sectionTitle, { color: colors.text.primary }]}>{title}</Text>}
                </View>
            )}
            <View style={[styles.sectionContent, colors.elevation.sm, { backgroundColor: colors.surface }]}>{children}</View>
        </View>
    );
};

/**
 * Single info row: icon + label + text (e.g. phone, email, address).
 */
export const ProfileInfoRow = ({ icon, label, text }) => {
    const { colors } = useAppTheme();
    return (
        <View style={styles.infoItem}>
            <View style={[styles.infoIcon, { backgroundColor: colors.opacity.background.primary }]}>
                <Ionicons name={icon} size={20} color={colors.primary} />
            </View>
            <View style={styles.infoContent}>
                <Text style={[styles.infoLabel, { color: colors.text.secondary }]}>{label}</Text>
                <Text style={[styles.infoText, { color: colors.text.primary }]}>{text}</Text>
            </View>
        </View>
    );
};

/**
 * Tappable action row: icon + text + optional badge + chevron. variant: 'primary' | 'danger'.
 */
export const ProfileActionRow = ({
    icon,
    text,
    onPress,
    badgeCount = null,
    isLast = false,
    variant = 'primary',
}) => {
    const { colors } = useAppTheme();
    const isDanger = variant === 'danger';
    const content = (
        <>
            <View style={[styles.actionIcon, { backgroundColor: isDanger ? colors.opacity.background.danger : colors.opacity.background.primary }]}>
                <Ionicons
                    name={icon}
                    size={20}
                    color={isDanger ? colors.danger : colors.primary}
                />
            </View>
            <Text style={[styles.actionText, { color: isDanger ? colors.danger : colors.text.primary }, isDanger && styles.dangerText]}>
                {text}
            </Text>
            {badgeCount != null && badgeCount > 0 && (
                <View style={[styles.badge, { backgroundColor: colors.danger }]}>
                    <Text style={[styles.badgeText, { color: colors.text.onColor }]}>
                        {badgeCount > 99 ? '99+' : String(badgeCount)}
                    </Text>
                </View>
            )}
            <Ionicons
                name="chevron-forward"
                size={20}
                color={isDanger ? colors.danger : colors.text.secondary}
            />
        </>
    );
    const rowStyle = [styles.actionItem, isLast && styles.lastActionItem];
    if (onPress) {
        return (
            <TouchableOpacity
                style={rowStyle}
                onPress={onPress}
                activeOpacity={interactions.activeOpacity}
            >
                {content}
            </TouchableOpacity>
        );
    }
    return <View style={rowStyle}>{content}</View>;
};

const styles = StyleSheet.create({
    section: {
        marginBottom: spacing.xl,
    },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: spacing.md,
    },
    sectionIconContainer: {
        width: 32,
        height: 32,
        borderRadius: radius.full,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: spacing.sm,
    },
    sectionTitle: {
        ...typography.styles.title,
    },
    sectionContent: {
        borderRadius: radius.card,
        overflow: 'hidden',
    },
    infoItem: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.lg,
    },
    infoIcon: {
        width: 36,
        height: 36,
        borderRadius: radius.lg,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: spacing.md,
    },
    infoContent: {
        flex: 1,
    },
    infoLabel: {
        ...typography.styles.micro,
        marginBottom: spacing.xs,
    },
    infoText: {
        ...typography.styles.body,
    },
    actionItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: spacing.lg,
        paddingHorizontal: spacing.lg,
    },
    lastActionItem: {},
    actionIcon: {
        width: 36,
        height: 36,
        borderRadius: radius.lg,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: spacing.md,
    },
    actionText: {
        flex: 1,
        ...typography.styles.bodyMedium,
    },
    dangerText: {
        ...typography.styles.bodyBold,
    },
    badge: {
        borderRadius: radius.badge,
        minWidth: 24,
        height: 20,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: spacing.sm,
    },
    badgeText: {
        ...typography.styles.badge,
        paddingHorizontal: spacing.xs,
    },
});

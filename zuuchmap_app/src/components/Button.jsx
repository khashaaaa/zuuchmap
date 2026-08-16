import React from 'react';
import { TouchableOpacity, Text, ActivityIndicator, View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { spacing, typography, radius, interactions } from '../design/theme';
import { useAppTheme } from '../hooks/useAppTheme';

const SIZES = {
    sm:     { paddingVertical: spacing.sm,  paddingHorizontal: spacing.md,  minHeight: 40, fontSize: typography.sm, iconSize: 16 },
    small:  { paddingVertical: spacing.sm,  paddingHorizontal: spacing.md,  minHeight: 40, fontSize: typography.sm, iconSize: 16 },
    md:     { paddingVertical: spacing.md,  paddingHorizontal: spacing.xl,  minHeight: 52, fontSize: typography.md, iconSize: 20 },
    medium: { paddingVertical: spacing.md,  paddingHorizontal: spacing.xl,  minHeight: 52, fontSize: typography.md, iconSize: 20 },
    lg:     { paddingVertical: spacing.lg,  paddingHorizontal: spacing.xxl, minHeight: 60, fontSize: typography.lg, iconSize: 24 },
    large:  { paddingVertical: spacing.lg,  paddingHorizontal: spacing.xxl, minHeight: 60, fontSize: typography.lg, iconSize: 24 },
};

export default function Button({
    title, onPress, disabled = false, loading = false, loadingText,
    icon, iconPosition = 'left', size = 'md', variant = 'primary',
    fullWidth = false, style, textStyle,
}) {
    const { colors } = useAppTheme();
    const VARIANTS = {
        primary: { bg: colors.primary,  fg: colors.onPrimary },
        danger:  { bg: colors.danger,   fg: colors.text.onColor },
        success: { bg: colors.success,  fg: colors.text.onColor },
        warning: { bg: colors.warning,  fg: colors.text.onColor },
        outline: { bg: 'transparent',   fg: colors.text.link, border: colors.primary },
    };
    const v = VARIANTS[variant] ?? VARIANTS.primary;
    const sz = SIZES[size] ?? SIZES.md;
    const inactive = disabled || loading;
    const fg = inactive ? colors.text.disabled : v.fg;
    const bg = inactive && variant !== 'outline' ? colors.surfaceLight : v.bg;

    const renderIcon = (position) => {
        if (!icon || iconPosition !== position) return null;
        if (typeof icon === 'string') {
            return (
                <Ionicons
                    name={icon}
                    size={sz.iconSize}
                    color={fg}
                    style={position === 'left' ? styles.iconL : styles.iconR}
                />
            );
        }
        // Legacy JSX element icon
        return (
            <View style={position === 'left' ? styles.iconL : styles.iconR}>
                {icon}
            </View>
        );
    };

    return (
        <TouchableOpacity
            style={[
                styles.base,
                { backgroundColor: bg, minHeight: sz.minHeight, paddingVertical: sz.paddingVertical, paddingHorizontal: sz.paddingHorizontal },
                variant === 'outline' && { borderWidth: 2, borderColor: inactive ? colors.border.medium : v.border },
                fullWidth && { width: '100%' },
                style,
            ]}
            onPress={onPress}
            disabled={disabled || loading}
            activeOpacity={interactions.activeOpacity}
        >
            {loading ? (
                <View style={styles.row}>
                    <ActivityIndicator color={fg} size="small" />
                    {loadingText && (
                        <Text style={[styles.label, { fontSize: sz.fontSize, color: fg, marginLeft: spacing.sm }]}>
                            {loadingText}
                        </Text>
                    )}
                </View>
            ) : (
                <View style={styles.row}>
                    {renderIcon('left')}
                    <Text style={[styles.label, { fontSize: sz.fontSize, color: fg }, textStyle]}>
                        {title}
                    </Text>
                    {renderIcon('right')}
                </View>
            )}
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    base:     { borderRadius: radius.button, alignItems: 'center', justifyContent: 'center' },
    disabled: { opacity: 0.6 },
    label:    { fontWeight: '600', textAlign: 'center' },
    row:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
    iconL:    { marginRight: spacing.sm },
    iconR:    { marginLeft: spacing.sm },
});

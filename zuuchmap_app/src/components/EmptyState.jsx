import React, { useMemo, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { spacing, typography, radius, animations } from '../design/theme';
import { useAppTheme } from '../hooks/useAppTheme';
import { useReducedMotion } from '../hooks/useReducedMotion';
import Button from './Button';

/**
 * Empty is not one situation. `variant` gives it range:
 * - 'invitation' — nothing here YET and creating it is the point (first post,
 *   no bookings): amber disc + selected ring + a louder title.
 * - 'neutral'    — nothing here and that's fine (notifications): quiet grey.
 * - 'search'     — a filter dead-end: grey disc, amber glyph, the action
 *   button is the anchor.
 * - 'default'    — generic dead-end.
 * `eyebrow` optionally names the context above the title (overline).
 */
const EmptyState = ({
    icon = 'document-outline',
    iconSize = 48,
    eyebrow,
    title,
    subtitle,
    actionButton,
    variant = 'default'
}) => {
    const { colors } = useAppTheme();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const reduced = useReducedMotion();
    const iconAnim = useRef(new Animated.Value(reduced ? 1 : 0)).current;

    useEffect(() => {
        if (reduced) {
            iconAnim.setValue(1);
            return;
        }
        Animated.timing(iconAnim, {
            toValue: 1,
            duration: animations.duration.normal,
            useNativeDriver: true,
        }).start();
    }, [reduced, iconAnim]);

    const iconScale = iconAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [0.85, 1],
    });

    const invitation = variant === 'invitation';
    const getIconColor = () => {
        if (variant === 'search' || invitation) return colors.primary;
        return colors.text.tertiary;
    };

    return (
        <View style={styles.container}>
            <Animated.View
                style={[
                    styles.iconContainer,
                    invitation && styles.iconContainerInvitation,
                    !reduced && { opacity: iconAnim, transform: [{ scale: iconScale }] },
                ]}
            >
                <Ionicons name={icon} size={iconSize} color={getIconColor()} />
            </Animated.View>
            {eyebrow && (
                <Text style={styles.eyebrow}>{eyebrow}</Text>
            )}
            {title && (
                <Text style={[styles.title, invitation && styles.titleInvitation]}>{title}</Text>
            )}
            {subtitle && (
                <Text style={styles.subtitle}>{subtitle}</Text>
            )}
            {actionButton?.onPress && (
                <Button
                    title={actionButton.text}
                    icon={actionButton.icon}
                    onPress={actionButton.onPress}
                />
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
    iconContainerInvitation: {
        // Elevation spread first so its border stays the amber selected ring.
        ...colors.elevation.selected,
        backgroundColor: colors.opacity.background.primary,
    },
    eyebrow: {
        ...typography.styles.overline,
        textTransform: 'uppercase',
        color: colors.text.tertiary,
        marginBottom: spacing.xs,
        textAlign: 'center',
    },
    title: {
        ...typography.styles.title,
        color: colors.text.primary,
        marginBottom: spacing.sm,
        textAlign: 'center',
    },
    titleInvitation: {
        ...typography.styles.h3,
    },
    subtitle: {
        ...typography.styles.caption,
        color: colors.text.secondary,
        textAlign: 'center',
        paddingHorizontal: spacing.xl,
        marginBottom: spacing.sm,
    },
});

export default EmptyState;

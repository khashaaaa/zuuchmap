import React, { useMemo, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { spacing, typography, radius, animations } from '../design/theme';
import { useAppTheme } from '../hooks/useAppTheme';
import { useReducedMotion } from '../hooks/useReducedMotion';
import Button from './Button';

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

    const getIconColor = () => {
        if (variant === 'search') return colors.primary;
        return colors.text.tertiary;
    };

    return (
        <View style={styles.container}>
            <Animated.View style={[styles.iconContainer, !reduced && { opacity: iconAnim, transform: [{ scale: iconScale }] }]}>
                <Ionicons name={icon} size={iconSize} color={getIconColor()} />
            </Animated.View>
            {title && (
                <Text style={styles.title}>{title}</Text>
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
    title: {
        ...typography.styles.title,
        color: colors.text.primary,
        marginBottom: spacing.sm,
        textAlign: 'center',
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

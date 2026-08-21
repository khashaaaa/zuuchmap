import React, { useEffect, useRef } from 'react';
import { Animated, View, StyleSheet } from 'react-native';
import { spacing, radius, animations } from '../design/theme';
import { useAppTheme } from '../hooks/useAppTheme';
import { useReducedMotion } from '../hooks/useReducedMotion';

const Pulse = ({ style, width = '100%', height = 12, borderRadius = 4 }) => {
    const { colors } = useAppTheme();
    const reduced = useReducedMotion();
    const opacity = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        if (reduced) return undefined;
        const pulse = Animated.loop(
            Animated.sequence([
                Animated.timing(opacity, {
                    toValue: 0.5,
                    duration: animations.duration.pulse,
                    useNativeDriver: true,
                }),
                Animated.timing(opacity, {
                    toValue: 1,
                    duration: animations.duration.pulse,
                    useNativeDriver: true,
                }),
            ])
        );
        pulse.start();
        return () => pulse.stop();
    }, [opacity, reduced]);

    // Reduced motion: static half-opacity fill, no pulsing.
    if (reduced) {
        return (
            <View style={[{ width, height, borderRadius, backgroundColor: colors.border.light, opacity: 0.7 }, style]} />
        );
    }

    return (
        <Animated.View style={[{ width, height, borderRadius, backgroundColor: colors.border.light, opacity }, style]} />
    );
};

const SkeletonItem = ({ style }) => {
    const { colors } = useAppTheme();
    return (
        <View style={[styles.postCard, { backgroundColor: colors.surface }, style]}>
            <Pulse
                style={styles.imageContainer}
                width={96}
                height={96}
                borderRadius={0}
            />
            <View style={styles.postContent}>
                <Pulse width="75%" height={16} borderRadius={radius.sm} />
                <Pulse width="55%" height={12} borderRadius={radius.sm} style={{ marginTop: spacing.sm }} />
                <Pulse width="55%" height={12} borderRadius={radius.sm} style={{ marginTop: spacing.sm }} />
                <Pulse width="40%" height={10} borderRadius={radius.sm} style={{ marginTop: spacing.sm }} />
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    postCard: {
        borderRadius: radius.md,
        marginBottom: spacing.md,
        overflow: 'hidden',
        flexDirection: 'row',
    },
    imageContainer: {
        width: 96,
        height: 96,
    },
    postContent: {
        flex: 1,
        padding: spacing.md,
        justifyContent: 'space-between',
    },
});

export default SkeletonItem;

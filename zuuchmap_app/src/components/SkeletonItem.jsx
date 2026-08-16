import React, { useEffect, useRef } from 'react';
import { Animated, View, StyleSheet, Dimensions } from 'react-native';
import { spacing, radius, animations } from '../design/theme';
import { useAppTheme } from '../hooks/useAppTheme';
import { useReducedMotion } from '../hooks/useReducedMotion';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const Shimmer = ({ style, width = '100%', height = 12, borderRadius = 4 }) => {
    const { colors } = useAppTheme();
    const reduced = useReducedMotion();
    const shimmerAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (reduced) return undefined;
        const shimmer = Animated.loop(
            Animated.timing(shimmerAnim, {
                toValue: 1,
                duration: animations.duration.slower * 3,
                useNativeDriver: true,
            })
        );
        shimmer.start();
        return () => shimmer.stop();
    }, [shimmerAnim, reduced]);

    // Reduced motion: static half-opacity fill, no sweeping highlight.
    if (reduced) {
        return (
            <View style={[styles.shimmerContainer, { width, height, borderRadius, backgroundColor: colors.border.light, opacity: 0.7 }, style]} />
        );
    }

    const translateX = shimmerAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [-SCREEN_WIDTH, SCREEN_WIDTH],
    });

    return (
        <View style={[styles.shimmerContainer, { width, height, borderRadius, backgroundColor: colors.border.light }, style]}>
            <Animated.View style={[styles.shimmerHighlight, { backgroundColor: colors.surfaceLight, transform: [{ translateX }] }]} />
        </View>
    );
};

const SkeletonItem = ({ style }) => {
    const { colors } = useAppTheme();
    return (
        <View style={[styles.postCard, { backgroundColor: colors.surface }, style]}>
            <Shimmer
                style={styles.imageContainer}
                width={96}
                height={96}
                borderRadius={0}
            />
            <View style={styles.postContent}>
                <Shimmer width="75%" height={16} borderRadius={radius.sm} />
                <Shimmer width="55%" height={12} borderRadius={radius.sm} style={{ marginTop: spacing.sm }} />
                <Shimmer width="55%" height={12} borderRadius={radius.sm} style={{ marginTop: spacing.sm }} />
                <Shimmer width="40%" height={10} borderRadius={radius.sm} style={{ marginTop: spacing.sm }} />
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    shimmerContainer: {
        overflow: 'hidden',
        position: 'relative',
    },
    shimmerHighlight: {
        position: 'absolute',
        top: 0,
        left: 0,
        width: SCREEN_WIDTH,
        height: '100%',
        opacity: 0.5,
    },
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

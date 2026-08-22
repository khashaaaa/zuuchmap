import React, { useEffect, useRef } from 'react';
import { Animated, View, StyleSheet, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { spacing, radius, animations } from '../design/theme';
import { useAppTheme } from '../hooks/useAppTheme';
import { useReducedMotion } from '../hooks/useReducedMotion';

const SWEEP_WIDTH = 120;

// One light sweep travels across the whole card (mirrors the web `.skeleton`
// shimmer). The blocks underneath stay static — the motion lives in a single
// place instead of every block pulsing independently.
const Shimmer = () => {
    const { isDark } = useAppTheme();
    const reduced = useReducedMotion();
    const translateX = useRef(new Animated.Value(-SWEEP_WIDTH)).current;

    useEffect(() => {
        if (reduced) return undefined;
        const sweep = Animated.loop(
            Animated.timing(translateX, {
                toValue: Dimensions.get('window').width,
                duration: animations.duration.pulse * 2,
                useNativeDriver: true,
            })
        );
        sweep.start();
        return () => sweep.stop();
    }, [translateX, reduced]);

    // Reduced motion: no sweep — the static blocks alone read as loading.
    if (reduced) return null;

    const highlight = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.55)';
    return (
        <Animated.View
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, { transform: [{ translateX }] }]}
        >
            <LinearGradient
                colors={['transparent', highlight, 'transparent']}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={{ width: SWEEP_WIDTH, height: '100%' }}
            />
        </Animated.View>
    );
};

const Block = ({ style, width = '100%', height = 12, borderRadius = 4 }) => {
    const { colors } = useAppTheme();
    return (
        <View style={[{ width, height, borderRadius, backgroundColor: colors.border.light, opacity: 0.7 }, style]} />
    );
};

const SkeletonItem = ({ style }) => {
    const { colors } = useAppTheme();
    return (
        <View style={[styles.postCard, { backgroundColor: colors.surface }, style]}>
            <Block
                style={styles.imageContainer}
                width={96}
                height={96}
                borderRadius={0}
            />
            <View style={styles.postContent}>
                <Block width="75%" height={16} borderRadius={radius.sm} />
                <Block width="55%" height={12} borderRadius={radius.sm} style={{ marginTop: spacing.sm }} />
                <Block width="55%" height={12} borderRadius={radius.sm} style={{ marginTop: spacing.sm }} />
                <Block width="40%" height={10} borderRadius={radius.sm} style={{ marginTop: spacing.sm }} />
            </View>
            <Shimmer />
        </View>
    );
};

const styles = StyleSheet.create({
    postCard: {
        // Match the real post card (radius.card) so the loading state doesn't
        // pop to a different corner radius when content arrives.
        borderRadius: radius.card,
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

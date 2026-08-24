import React, { useEffect, useRef, useState } from 'react';
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

// variant="post" mirrors the list post card (thumb + text column); "booking"
// mirrors the booking card (no thumb, title + meta rows); "detail" mirrors the
// post detail screen (hero image, title, price, meta rows). All carry the same
// elevation + hairline as the real thing so nothing pops when content lands.
// `visible=false` fades the placeholder out over one motion beat instead of
// unmounting it — the content underneath is already there, so the two cross.
const SkeletonItem = ({ style, variant = 'post', visible = true }) => {
    const { colors } = useAppTheme();
    const reduced = useReducedMotion();
    const fade = useRef(new Animated.Value(visible ? 1 : 0)).current;
    useEffect(() => {
        Animated.timing(fade, {
            toValue: visible ? 1 : 0,
            duration: reduced ? 1 : animations.duration.normal,
            useNativeDriver: true,
        }).start();
    }, [visible, reduced, fade]);
    const card = [
        { opacity: fade },
        { ...colors.elevation.sm },
        variant === 'booking' ? styles.bookingCard : styles.postCard,
        { backgroundColor: colors.surface, borderColor: colors.border.light },
        style,
    ];
    if (variant === 'detail') {
        // The detail screen used to show a centred spinner while every list in
        // the app showed skeletons — and while the web client showed a skeleton
        // for this very screen. Same content, same loading language now.
        return (
            <Animated.View style={[styles.detailWrap, { opacity: fade }, style]}>
                <Block width="100%" height={220} borderRadius={0} />
                <View style={styles.detailBody}>
                    <Block width="80%" height={22} borderRadius={radius.sm} />
                    <Block width="40%" height={18} borderRadius={radius.sm} style={{ marginTop: spacing.md }} />
                    <Block width="60%" height={12} borderRadius={radius.sm} style={{ marginTop: spacing.lg }} />
                    <Block width="70%" height={12} borderRadius={radius.sm} style={{ marginTop: spacing.sm }} />
                    <Block width="50%" height={12} borderRadius={radius.sm} style={{ marginTop: spacing.sm }} />
                </View>
                <Shimmer />
            </Animated.View>
        );
    }
    if (variant === 'booking') {
        return (
            <Animated.View style={card}>
                <Block width="60%" height={18} borderRadius={radius.sm} />
                <Block width="45%" height={12} borderRadius={radius.sm} style={{ marginTop: spacing.sm }} />
                <Block width="55%" height={12} borderRadius={radius.sm} style={{ marginTop: spacing.sm }} />
                <Shimmer />
            </Animated.View>
        );
    }
    return (
        <Animated.View style={card}>
            <Block
                style={styles.imageContainer}
                width={96}
                height="100%"
                borderRadius={0}
            />
            <View style={styles.postContent}>
                <Block width="75%" height={16} borderRadius={radius.sm} />
                <Block width="55%" height={12} borderRadius={radius.sm} style={{ marginTop: spacing.sm }} />
                <Block width="55%" height={12} borderRadius={radius.sm} style={{ marginTop: spacing.sm }} />
                <Block width="40%" height={10} borderRadius={radius.sm} style={{ marginTop: spacing.sm }} />
            </View>
            <Shimmer />
        </Animated.View>
    );
};

/**
 * Crossfades a loading placeholder into real content. While `loading`, only
 * `skeleton` renders; when it flips false the children mount underneath and
 * the skeleton fades out on top over one motion beat (instantly under reduced
 * motion), so a list never pops from grey blocks to cards.
 *
 *   <SkeletonCrossfade loading={showSkeleton} skeleton={<FlatList … />}>
 *     {content}
 *   </SkeletonCrossfade>
 */
export const SkeletonCrossfade = ({ loading, skeleton, children, style }) => {
    const { colors } = useAppTheme();
    const reduced = useReducedMotion();
    const [overlay, setOverlay] = useState(loading);
    const opacity = useRef(new Animated.Value(loading ? 1 : 0)).current;

    useEffect(() => {
        if (loading) {
            opacity.setValue(1);
            setOverlay(true);
            return undefined;
        }
        if (reduced) {
            opacity.setValue(0);
            setOverlay(false);
            return undefined;
        }
        const anim = Animated.timing(opacity, {
            toValue: 0,
            duration: animations.duration.normal,
            useNativeDriver: true,
        });
        anim.start(({ finished }) => { if (finished) setOverlay(false); });
        return () => anim.stop();
    }, [loading, reduced, opacity]);

    return (
        <View style={[styles.crossfade, style]}>
            {!loading && children}
            {overlay && (
                <Animated.View
                    pointerEvents={loading ? 'auto' : 'none'}
                    style={[StyleSheet.absoluteFill, { opacity, backgroundColor: colors.background }]}
                >
                    {skeleton}
                </Animated.View>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    crossfade: {
        flex: 1,
    },
    postCard: {
        // Match the real post card (radius.card, hairline, ~content height) so
        // the loading state doesn't pop when content arrives.
        borderRadius: radius.card,
        marginBottom: spacing.md,
        overflow: 'hidden',
        flexDirection: 'row',
        borderWidth: 1,
        minHeight: 132,
    },
    bookingCard: {
        borderRadius: radius.card,
        marginBottom: spacing.md,
        overflow: 'hidden',
        padding: spacing.lg,
    },
    imageContainer: {
        width: 96,
        alignSelf: 'stretch',
    },
    detailWrap: {
        flex: 1,
        overflow: 'hidden',
    },
    detailBody: {
        padding: spacing.lg,
    },
    postContent: {
        flex: 1,
        padding: spacing.md,
        justifyContent: 'space-between',
    },
});

export default SkeletonItem;

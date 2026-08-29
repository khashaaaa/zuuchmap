import React, { useMemo, useRef } from 'react';
import { TouchableOpacity, Text, View, StyleSheet, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { spacing, typography, interactions, animations, radius } from '../design/theme';
import { useAppTheme } from '../hooks/useAppTheme';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useTranslation } from 'react-i18next';

// Six amber dots leave the heart on save. Angles are fixed so the burst
// reads the same every time; each dot travels ~1.6× the icon size and fades
// over the last half of the flight.
const PARTICLES = [0, 60, 120, 180, 240, 300].map((deg) => {
    const r = (deg * Math.PI) / 180;
    return { x: Math.cos(r), y: Math.sin(r) };
});
const BURST_MS = 350;
const ICON_SIZES = { small: 16, medium: 20, large: 24 };

/**
 * Presentational heart. The owner holds the liked state and the count
 * (lists from their liked-ids query, PostDetailScreen from its own queries)
 * and performs the toggle — see hooks/useToggleLike. This component only
 * animates and reports the tap.
 *
 * Admin gating stays at the call site (CLAUDE.md): pass `hidden` or do not
 * render it at all.
 */
const LikeButton = ({
    liked = false,
    count,
    onToggle,
    disabled = false,
    hidden = false,
    size = 'medium',
}) => {
    const { colors } = useAppTheme();
    const reduced = useReducedMotion();
    const { t } = useTranslation();
    const scaleAnim = useRef(new Animated.Value(1)).current;
    const burstAnim = useRef(new Animated.Value(0)).current;
    const iconSize = ICON_SIZES[size] ?? ICON_SIZES.medium;
    const showCount = count !== undefined && count !== null;

    const handlePress = () => {
        if (disabled) return;
        const next = !liked;
        if (next) {
            // Haptic on save regardless of motion settings — reduce-motion
            // is about movement, and a tap of confirmation is not movement.
            try {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
            } catch {
                // Native module absent (web, Expo Go without haptics)
            }
        }
        if (!reduced) {
            if (next) {
                burstAnim.setValue(0);
                Animated.timing(burstAnim, { toValue: 1, duration: BURST_MS, useNativeDriver: true }).start();
            }
            Animated.sequence([
                Animated.spring(scaleAnim, { toValue: 1.4, useNativeDriver: true, ...animations.pop }),
                Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, ...animations.pop }),
            ]).start();
        }
        onToggle?.(next);
    };

    const particleStyles = useMemo(() => PARTICLES.map((p) => {
        const reach = iconSize * 1.6;
        return {
            opacity: burstAnim.interpolate({ inputRange: [0, 0.1, 0.55, 1], outputRange: [0, 1, 1, 0] }),
            transform: [
                { translateX: burstAnim.interpolate({ inputRange: [0, 1], outputRange: [0, p.x * reach] }) },
                { translateY: burstAnim.interpolate({ inputRange: [0, 1], outputRange: [0, p.y * reach] }) },
                { scale: burstAnim.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0.4, 1, 0.3] }) },
            ],
        };
    }), [burstAnim, iconSize]);

    if (hidden) return null;

    // primary is a fill; amber glyphs are iconAccent and amber text is text.link.
    const glyphTint = liked ? colors.iconAccent : colors.text.secondary;
    const textTint = liked ? colors.text.link : colors.text.secondary;

    return (
        <TouchableOpacity
            style={[styles.likeButton, { opacity: disabled ? 0.6 : 1 }]}
            onPress={handlePress}
            disabled={disabled}
            activeOpacity={interactions.activeOpacityLight}
            hitSlop={interactions.hitSlop}
            accessibilityRole="button"
            accessibilityState={{ selected: liked, disabled }}
            accessibilityLabel={liked ? t('posts.saved') : t('posts.save')}
        >
            <View style={styles.iconWrap}>
                <Animated.View
                    pointerEvents="none"
                    style={[
                        styles.burst,
                        {
                            width: iconSize * 2,
                            height: iconSize * 2,
                            backgroundColor: colors.opacity.background.primaryDark,
                            opacity: burstAnim.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.6, 0] }),
                            transform: [{ scale: burstAnim.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1.4] }) }],
                        },
                    ]}
                />
                {!reduced && particleStyles.map((style, i) => (
                    <Animated.View
                        key={i}
                        pointerEvents="none"
                        style={[styles.particle, { backgroundColor: colors.primary }, style]}
                    />
                ))}
                <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
                    <Ionicons name={liked ? 'heart' : 'heart-outline'} size={iconSize} color={glyphTint} />
                </Animated.View>
            </View>
            {showCount && (
                <Text style={[styles.likeCount, { color: textTint }]}>{count}</Text>
            )}
        </TouchableOpacity>
    );
};

const styles = StyleSheet.create({
    likeButton: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: spacing.xs,
    },
    iconWrap: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    burst: {
        position: 'absolute',
        borderRadius: radius.full,
    },
    particle: {
        position: 'absolute',
        width: 5,
        height: 5,
        borderRadius: radius.full,
    },
    likeCount: {
        marginLeft: spacing.xs,
        ...typography.styles.label,
    },
});

export default React.memo(LikeButton);

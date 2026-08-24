import React, { useState, useEffect, useMemo, useRef } from 'react';
import { TouchableOpacity, Text, View, StyleSheet, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import likeService from '../services/api/likeService';
import userService from '../services/api/userService';
import { getUserInfo } from '../services/api/authHelpers';
import { spacing, typography, interactions, animations, radius } from '../design/theme';
import { useAppTheme } from '../hooks/useAppTheme';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useTranslation } from 'react-i18next';
import { showErrorModal } from '../utils/errorManager';
import { logger } from '../utils/logger';

// Six amber dots leave the heart on save. Angles are fixed so the burst
// reads the same every time; each dot travels ~1.6× the icon size and fades
// over the last half of the flight.
const PARTICLES = [0, 60, 120, 180, 240, 300].map((deg) => {
    const r = (deg * Math.PI) / 180;
    return { x: Math.cos(r), y: Math.sin(r) };
});
const BURST_MS = 350;

const LikeButton = ({
    post_type,
    post_id,
    initial_liked = false,
    show_count = true,
    size = 'medium',
    skip_check = false,
    is_authenticated: authenticated_prop,
    onLikeChange
}) => {
    const { colors } = useAppTheme();
    const reduced = useReducedMotion();
    const { t } = useTranslation();
    const [is_liked, setIsLiked] = useState(initial_liked);
    const [like_count, setLikeCount] = useState(0);
    const [loading, setLoading] = useState(false);
    const [is_authenticated, setIsAuthenticated] = useState(authenticated_prop ?? false);
    const [hidden, setHidden] = useState(false);
    const scaleAnim = useRef(new Animated.Value(1)).current;
    const burstAnim = useRef(new Animated.Value(0)).current;
    const mountedRef = useRef(true);
    useEffect(() => () => { mountedRef.current = false; }, []);

    const icon_sizes = useMemo(() => ({
        small: 16,
        medium: 20,
        large: 24
    }), []);

    useEffect(() => {
        // Skip all initialization when parent owns auth + liked state
        if (skip_check && authenticated_prop !== undefined) return;
        initializeLikeData();
    }, [post_type, post_id]);

    useEffect(() => {
        if (authenticated_prop !== undefined) setIsAuthenticated(authenticated_prop);
    }, [authenticated_prop]);

    // When parent provides a known liked state (skip_check=true) and it changes
    // (e.g. batch-check data arrives after mount), sync the internal state.
    useEffect(() => {
        if (skip_check) setIsLiked(initial_liked);
    }, [initial_liked]);

    const initializeLikeData = async () => {
        try {
            // Cached locally at login — resolves before the network-bound
            // isAuthenticated() check below, avoiding a flash of the button for admins.
            const cached_info = await getUserInfo();
            if (!mountedRef.current) return;
            if (cached_info?.is_admin === true) {
                setHidden(true);
                return;
            }

            // When the parent already resolved auth, don't re-check — the
            // network isAuthenticated() used to fire one /user/profile request
            // per rendered button in a list.
            let authenticated;
            if (authenticated_prop !== undefined) {
                authenticated = authenticated_prop;
            } else {
                const auth_status = await userService.isAuthenticated();
                if (!mountedRef.current) return;
                if (auth_status.is_admin) {
                    setHidden(true);
                    return;
                }
                authenticated = auth_status.authenticated;
            }
            setIsAuthenticated(authenticated);

            if (show_count) {
                await loadLikeCount();
            }

            if (authenticated && !skip_check) {
                await loadLikeStatus();
            } else if (!skip_check) {
                if (mountedRef.current) setIsLiked(false);
            }
        } catch (error) {
            logger.error('Error initializing like data:', error);
            if (mountedRef.current) {
                setIsAuthenticated(false);
                setIsLiked(false);
            }
        }
    };

    const loadLikeStatus = async () => {
        try {
            const liked = await likeService.checkIfLiked(post_type, post_id);
            if (!mountedRef.current) return;
            setIsLiked(liked);

            if (onLikeChange) {
                onLikeChange(liked);
            }
        } catch (error) {
            logger.error('Error loading like status:', error);
            if (mountedRef.current && (error.response?.status === 401 || error.response?.status === 403)) {
                setIsAuthenticated(false);
                setIsLiked(false);
            }
        }
    };

    const loadLikeCount = async () => {
        try {
            const stats = await likeService.getLikeStats(post_type, post_id);
            if (mountedRef.current) setLikeCount(stats.total_likes || 0);
        } catch (error) {
            logger.error('Error loading like count:', error);
            if (mountedRef.current) setLikeCount(0);
        }
    };

    const handleToggleLike = async () => {
        if (loading) return;

        if (!is_authenticated) {
            showErrorModal(
                t('auth.title'),
                t('posts.loginToSave'),
                [{ text: t('common.close') }],
                'warning'
            );
            return;
        }

        const prev_liked = is_liked;
        const next_liked = !prev_liked;

        // Optimistic update
        setIsLiked(next_liked);
        if (show_count) setLikeCount(c => next_liked ? c + 1 : Math.max(0, c - 1));
        if (onLikeChange) onLikeChange(next_liked);
        if (next_liked) {
            // Haptic on save regardless of motion settings — reduce-motion
            // is about movement, and a tap of confirmation is not movement.
            try {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
            } catch {
                // Native module absent (web, Expo Go without haptics)
            }
        }
        if (!reduced) {
            if (next_liked) {
                burstAnim.setValue(0);
                Animated.timing(burstAnim, {
                    toValue: 1,
                    duration: BURST_MS,
                    useNativeDriver: true,
                }).start();
            }
            Animated.sequence([
                Animated.spring(scaleAnim, { toValue: 1.4, useNativeDriver: true, ...animations.pop }),
                Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, ...animations.pop }),
            ]).start();
        }

        setLoading(true);
        try {
            await likeService.toggleLike(post_type, post_id, prev_liked);
        } catch (error) {
            logger.error('Error toggling like:', error);
            if (!mountedRef.current) return;

            // Rollback
            setIsLiked(prev_liked);
            if (show_count) setLikeCount(c => prev_liked ? c + 1 : Math.max(0, c - 1));
            if (onLikeChange) onLikeChange(prev_liked);

            if (error.response?.status === 401 || error.response?.status === 403) {
                setIsAuthenticated(false);
                setIsLiked(false);
                showErrorModal(t('auth.sessionExpired'), t('auth.sessionExpiredDesc'));
            } else if (error.code === 'AUTH_TOKEN_MISSING') {
                setIsAuthenticated(false);
                setIsLiked(false);
                showErrorModal(t('auth.title'), t('auth.loginRequired'), [{ text: t('common.close') }], 'warning');
            } else {
                showErrorModal(t('common.error'), t('posts.likeError'));
            }
        } finally {
            if (mountedRef.current) setLoading(false);
        }
    };

    if (hidden) return null;

    return (
        <TouchableOpacity
            style={[
                styles.likeButton,
                { opacity: loading ? 0.6 : 1 }
            ]}
            onPress={handleToggleLike}
            disabled={loading}
            activeOpacity={interactions.activeOpacityLight}
            hitSlop={interactions.hitSlop}
            accessibilityRole="button"
            accessibilityLabel={is_liked ? t('posts.saved') : t('posts.save')}
        >
            <View style={styles.iconWrap}>
                <Animated.View
                    pointerEvents="none"
                    style={[
                        styles.burst,
                        {
                            width: icon_sizes[size] * 2,
                            height: icon_sizes[size] * 2,
                            backgroundColor: colors.opacity.background.primaryDark,
                            opacity: burstAnim.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.6, 0] }),
                            transform: [{ scale: burstAnim.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1.4] }) }],
                        },
                    ]}
                />
                {!reduced && PARTICLES.map((p, i) => {
                    const reach = icon_sizes[size] * 1.6;
                    return (
                        <Animated.View
                            key={i}
                            pointerEvents="none"
                            style={[
                                styles.particle,
                                {
                                    backgroundColor: colors.primary,
                                    opacity: burstAnim.interpolate({ inputRange: [0, 0.1, 0.55, 1], outputRange: [0, 1, 1, 0] }),
                                    transform: [
                                        { translateX: burstAnim.interpolate({ inputRange: [0, 1], outputRange: [0, p.x * reach] }) },
                                        { translateY: burstAnim.interpolate({ inputRange: [0, 1], outputRange: [0, p.y * reach] }) },
                                        { scale: burstAnim.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0.4, 1, 0.3] }) },
                                    ],
                                },
                            ]}
                        />
                    );
                })}
                <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
                    <Ionicons
                        name={is_liked ? 'heart' : 'heart-outline'}
                        size={icon_sizes[size]}
                        color={is_liked ? colors.primary : colors.text.secondary}
                    />
                </Animated.View>
            </View>
            {show_count && (
                <Text style={[
                    styles.likeCount,
                    { color: is_liked ? colors.primary : colors.text.secondary }
                ]}>
                    {like_count}
                </Text>
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
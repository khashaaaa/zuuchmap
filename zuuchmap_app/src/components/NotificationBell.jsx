import React, { useEffect, useRef } from 'react';
import { TouchableOpacity, Text, StyleSheet, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useAppContext } from '../context/AppContext';
import { useAppTheme } from '../hooks/useAppTheme';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { spacing, typography, radius, interactions, animations } from '../design/theme';

export default function NotificationBell() {
    const navigation = useNavigation();
    const { unreadCount } = useAppContext();
    const { colors } = useAppTheme();
    const { t } = useTranslation();
    const reduced = useReducedMotion();
    const wiggle = useRef(new Animated.Value(0)).current;
    const badgeScale = useRef(new Animated.Value(unreadCount > 0 ? 1 : 0)).current;
    const prevCount = useRef(unreadCount);

    // Wiggle + badge pop only when the unread count rises while mounted —
    // never on first mount, never on decrease, never under reduced motion.
    useEffect(() => {
        const prev = prevCount.current;
        prevCount.current = unreadCount;
        if (unreadCount <= prev) {
            if (unreadCount === 0) badgeScale.setValue(0);
            return;
        }
        if (reduced) {
            badgeScale.setValue(1);
            return;
        }
        Animated.spring(badgeScale, { toValue: 1, useNativeDriver: true, ...animations.pop }).start();
        Animated.sequence([
            Animated.timing(wiggle, { toValue: -1, duration: animations.duration.instant, useNativeDriver: true }),
            Animated.timing(wiggle, { toValue: 1, duration: animations.duration.instant, useNativeDriver: true }),
            Animated.timing(wiggle, { toValue: 0, duration: animations.duration.instant, useNativeDriver: true }),
        ]).start();
    }, [unreadCount, reduced, badgeScale, wiggle]);

    const rotate = wiggle.interpolate({
        inputRange: [-1, 1],
        outputRange: [`-${animations.wiggle.angle}deg`, `${animations.wiggle.angle}deg`],
    });

    return (
        <TouchableOpacity
            style={styles.btn}
            onPress={() => navigation.navigate('Notifications')}
            activeOpacity={interactions.activeOpacity}
            hitSlop={interactions.hitSlop}
            accessibilityRole="button"
            accessibilityLabel={t('notifications.title')}
        >
            <Animated.View style={!reduced && { transform: [{ rotate }] }}>
                <Ionicons name="notifications-outline" size={22} color={colors.primary} />
            </Animated.View>
            {unreadCount > 0 && (
                <Animated.View style={[
                    styles.badge,
                    { backgroundColor: colors.danger },
                    !reduced && { transform: [{ scale: badgeScale }] },
                ]}>
                    <Text style={[styles.badgeText, { color: colors.text.onColor }]}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
                </Animated.View>
            )}
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    btn: {
        padding: spacing.sm,
        position: 'relative',
    },
    badge: {
        position: 'absolute',
        top: spacing.xxs,
        right: spacing.xxs,
        minWidth: 18,
        height: 18,
        borderRadius: radius.badge,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: spacing.xxs,
    },
    badgeText: {
        // `badge` is the role built for pills; `overline`'s wide tracking pushes
        // the digit off-centre inside a circle this small.
        ...typography.styles.badge,
        textAlign: 'center',
    },
});

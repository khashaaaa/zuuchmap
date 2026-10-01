import React, { useRef, useEffect, useCallback } from 'react';
import { Animated } from 'react-native';
import { animations } from '../design/theme';
import { useReducedMotion } from '../hooks/useReducedMotion';

/**
 * Wraps children in a fade + slide-up entrance animation.
 * Use inside FlatList renderItem for per-item staggered entrance.
 * @param {number} index   - item index, used to compute stagger delay
 * @param {number} delay   - base delay in ms (default 60)
 * @param {number} stagger - extra ms per index (defaults to animations.stagger)
 * @param {boolean} animate - false renders in place (a row the list has shown before)
 */
const FadeSlideIn = ({ children, index = 0, delay = 60, stagger = animations.stagger, animate = true, style }) => {
    const reduced = useReducedMotion();
    const still = reduced || !animate;
    const opacity    = useRef(new Animated.Value(still ? 1 : 0)).current;
    const translateY = useRef(new Animated.Value(still ? 0 : 18)).current;

    useEffect(() => {
        if (still) return;
        const d = delay + index * stagger;
        Animated.parallel([
            Animated.timing(opacity, {
                toValue: 1, duration: animations.duration.normal, delay: d, useNativeDriver: true,
            }),
            Animated.timing(translateY, {
                toValue: 0, duration: animations.duration.normal, delay: d, useNativeDriver: true,
            }),
        ]).start();
    }, [reduced]);

    return (
        <Animated.View style={[{ opacity, transform: [{ translateY }] }, style]}>
            {children}
        </Animated.View>
    );
};

/**
 * Entrance bookkeeping for a virtualised list. FlatList unmounts rows that
 * leave its window and remounts them on the way back, so a bare FadeSlideIn
 * replays every time the user scrolls up. This answers, per row key, whether
 * the row is new to the list and what stagger slot it gets: the first screen
 * cascades, anything later (the next page, rows mounted mid-scroll) gets none,
 * or a fast scroll would show rows arriving seconds late.
 *
 *   const entrance = useListEntrance();
 *   const { animate, index } = entrance(key, i);
 */
export const useListEntrance = (cascade = 8) => {
    const seen = useRef(new Set());
    return useCallback((key, i) => {
        if (seen.current.has(key)) return { animate: false, index: 0 };
        seen.current.add(key);
        return { animate: true, index: i < cascade ? i : 0 };
    }, [cascade]);
};

export default FadeSlideIn;

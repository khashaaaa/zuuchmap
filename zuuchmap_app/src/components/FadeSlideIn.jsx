import React, { useRef, useEffect } from 'react';
import { Animated } from 'react-native';
import { animations } from '../design/theme';
import { useReducedMotion } from '../hooks/useReducedMotion';

/**
 * Wraps children in a fade + slide-up entrance animation.
 * Use inside FlatList renderItem for per-item staggered entrance.
 * @param {number} index   - item index, used to compute stagger delay
 * @param {number} delay   - base delay in ms (default 60)
 * @param {number} stagger - extra ms per index (defaults to animations.stagger)
 */
const FadeSlideIn = ({ children, index = 0, delay = 60, stagger = animations.stagger, style }) => {
    const reduced = useReducedMotion();
    const opacity    = useRef(new Animated.Value(reduced ? 1 : 0)).current;
    const translateY = useRef(new Animated.Value(reduced ? 0 : 18)).current;

    useEffect(() => {
        if (reduced) return;
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

export default FadeSlideIn;

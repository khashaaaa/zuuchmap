import React, { useRef, useCallback, useEffect } from 'react';
import { Animated, Pressable } from 'react-native';
import { animations } from '../design/theme';
import { useReducedMotion } from '../hooks/useReducedMotion';

/**
 * A pressable that dips slightly under the finger instead of only fading.
 *
 * Opacity alone reads as "the screen dimmed"; a small scale reads as "I pushed
 * a thing", which is the feedback a card-heavy marketplace was missing. The
 * spring is deliberately stiff — this is acknowledgement, not an animation
 * anyone should have time to watch.
 *
 * Falls back to a plain `Pressable` when the OS asks for reduced motion, so the
 * press still works and simply does not move.
 */
const PressableScale = ({
    children,
    onPress,
    style,
    disabled = false,
    scaleTo = animations.press.scale,
    pop = false,
    selected = false,
    ...rest
}) => {
    const reduced = useReducedMotion();
    const scale = useRef(new Animated.Value(1)).current;
    const prevSelected = useRef(selected);

    // The signature amber selection pop: when `pop` is set and `selected` flips
    // false → true, breathe 1 → 1.06 → 1 as the selected state lands. Never on
    // mount, never on deselect, never under reduced motion.
    useEffect(() => {
        const was = prevSelected.current;
        prevSelected.current = selected;
        if (!pop || reduced || was || !selected) return;
        Animated.sequence([
            Animated.spring(scale, { toValue: animations.selection.scale, useNativeDriver: true, ...animations.pop }),
            Animated.spring(scale, { toValue: 1, useNativeDriver: true, ...animations.pop }),
        ]).start();
    }, [pop, selected, reduced, scale]);

    const spring = useCallback((toValue) => {
        Animated.spring(scale, {
            toValue,
            tension: animations.press.tension,
            friction: animations.press.friction,
            useNativeDriver: true,
        }).start();
    }, [scale]);

    const handlePressIn = useCallback(() => { if (!reduced) spring(scaleTo); }, [reduced, scaleTo, spring]);
    const handlePressOut = useCallback(() => { if (!reduced) spring(1); }, [reduced, spring]);

    return (
        <Pressable
            onPress={onPress}
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
            disabled={disabled}
            {...rest}
        >
            <Animated.View style={[style, !reduced && { transform: [{ scale }] }]}>
                {children}
            </Animated.View>
        </Pressable>
    );
};

export default React.memo(PressableScale);

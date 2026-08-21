import React, { useRef, useEffect } from 'react';
import { Animated } from 'react-native';
import { animations } from '../design/theme';
import { useReducedMotion } from '../hooks/useReducedMotion';

/**
 * Wraps a selectable chip/card and fires the signature amber pop — one small
 * 1 → 1.06 → 1 scale breath — when `selected` transitions false → true.
 * Nothing happens on mount, on deselect, or under reduced motion.
 */
const SelectionPop = ({ selected = false, style, children }) => {
    const reduced = useReducedMotion();
    const scale = useRef(new Animated.Value(1)).current;
    const prevSelected = useRef(selected);

    useEffect(() => {
        const was = prevSelected.current;
        prevSelected.current = selected;
        if (reduced || was || !selected) return;
        Animated.sequence([
            Animated.spring(scale, { toValue: animations.selection.scale, useNativeDriver: true, ...animations.pop }),
            Animated.spring(scale, { toValue: 1, useNativeDriver: true, ...animations.pop }),
        ]).start();
    }, [selected, reduced, scale]);

    return (
        <Animated.View style={[style, !reduced && { transform: [{ scale }] }]}>
            {children}
        </Animated.View>
    );
};

export default React.memo(SelectionPop);

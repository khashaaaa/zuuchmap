import { useEffect, useRef, useState } from 'react';
import { Animated, Easing } from 'react-native';
import { animations } from '../design/theme';
import { useReducedMotion } from './useReducedMotion';

// Counts a stat up from 0 once, on the first ready value; later refetches snap
// instantly. Reduced motion snaps always. Pass `ready=false` until the value
// has actually loaded so the count-up runs on real data, not the placeholder.
export function useCountUp(value, ready = true) {
    const reduced = useReducedMotion();
    const target = Number(value) || 0;
    const [display, setDisplay] = useState(0);
    const ranRef = useRef(false);

    useEffect(() => {
        if (!ready) return undefined;
        if (ranRef.current || reduced) {
            ranRef.current = true;
            setDisplay(target);
            return undefined;
        }
        ranRef.current = true;
        const anim = new Animated.Value(0);
        const sub = anim.addListener(({ value: v }) => setDisplay(Math.round(v)));
        Animated.timing(anim, {
            toValue: target,
            duration: animations.duration.count,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: false,
        }).start(() => {
            anim.removeListener(sub);
            setDisplay(target);
        });
        return () => anim.removeListener(sub);
    }, [target, ready, reduced]);

    return display;
}

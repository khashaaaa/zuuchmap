import { useState, useEffect } from 'react';
import { AccessibilityInfo } from 'react-native';

// RN >= 0.65 (this project is on 0.81) returns an EmitterSubscription with
// .remove() from addEventListener. Older versions returned undefined and
// required AccessibilityInfo.removeEventListener(...) instead — handled
// defensively below in case this hook is ever backported.
export function useReducedMotion() {
    const [reduced, setReduced] = useState(false);
    useEffect(() => {
        let mounted = true;
        AccessibilityInfo.isReduceMotionEnabled().then((v) => { if (mounted) setReduced(v); });
        const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
        return () => {
            mounted = false;
            if (sub?.remove) {
                sub.remove();
            } else if (AccessibilityInfo.removeEventListener) {
                AccessibilityInfo.removeEventListener('reduceMotionChanged', setReduced);
            }
        };
    }, []);
    return reduced;
}

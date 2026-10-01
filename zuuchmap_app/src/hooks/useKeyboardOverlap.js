import { useCallback, useEffect, useRef, useState } from 'react';
import { Dimensions, Keyboard, StatusBar } from 'react-native';

/**
 * How far the keyboard actually overlaps a view, measured — for Android.
 *
 * `KeyboardAvoidingView behavior="height"` assumes the window did not resize.
 * That holds edge-to-edge, but Expo Go (and any resume that flips the mode)
 * runs with adjustResize, where the window already shrank: the view then
 * shrank a second time, the centred header overflowed upward and the sign-in
 * title slid under the status bar. Measuring the view's bottom against the
 * keyboard's top is right in both modes — it is 0 when the window resized.
 *
 * Attach `ref` and `onLayout` to the view and pad its bottom by `overlap`.
 * Padding does not move the view's own frame, so the measurement never feeds
 * back into itself; `onLayout` re-measures after a window resize lands.
 */
export function useKeyboardOverlap() {
    const ref = useRef(null);
    const keyboardTop = useRef(null);
    const [overlap, setOverlap] = useState(0);

    const measure = useCallback(() => {
        if (keyboardTop.current == null || !ref.current) {
            setOverlap(0);
            return;
        }
        ref.current.measureInWindow((x, y, w, h) => {
            // The keyboard reports screen coordinates; measureInWindow answers
            // in window ones. Edge-to-edge the two coincide. Otherwise the
            // window starts below the status bar (on the test phone: window
            // 833 tall on a 914 screen) and the overlap came out one status
            // bar short — the button sat half under the keyboard's toolbar.
            const windowTop = Dimensions.get('window').height < Dimensions.get('screen').height - 1
                ? (StatusBar.currentHeight ?? 0)
                : 0;
            setOverlap(Math.max(0, Math.round(windowTop + y + h - keyboardTop.current)));
        });
    }, []);

    useEffect(() => {
        const show = Keyboard.addListener('keyboardDidShow', (e) => {
            keyboardTop.current = e.endCoordinates.screenY;
            measure();
        });
        const hide = Keyboard.addListener('keyboardDidHide', () => {
            keyboardTop.current = null;
            setOverlap(0);
        });
        return () => {
            show.remove();
            hide.remove();
        };
    }, [measure]);

    return { ref, overlap, onLayout: measure };
}

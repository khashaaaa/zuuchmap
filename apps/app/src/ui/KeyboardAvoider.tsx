import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Keyboard, Platform, TextInput, View, type ScrollView, type StyleProp, type ViewStyle } from 'react-native';

/**
 * Pixels of the keyboard covering the bottom of `ref`'s view, measured: right whether the window
 * resized (overlap 0) or not. Never RN's KeyboardAvoidingView.
 */
function useKeyboardOverlap(ref: RefObject<View | null>, inModal = false): { overlap: number; remeasure: () => void } {
  const [overlap, setOverlap] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const keyboardTop = useRef<number | null>(null);

  const measure = useCallback(
    (keyboardTop: number) => {
      ref.current?.measureInWindow((_x, y, _w, h) => {
        // Reset the previous padding contribution is not needed: `y + h` is measured with the padding already applied
        // only for the content inside; the avoider's own box is not padded (padding sits on an inner wrapper).
        setOverlap(Math.max(0, Math.round(y + h - keyboardTop)));
      });
    },
    [ref],
  );

  useEffect(() => {
    const show = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hide = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const a = Keyboard.addListener(show, (e) => {
      const top = e.endCoordinates.screenY;
      keyboardTop.current = top;
      // In a Modal the window appears a frame later; measure after layout settles.
      if (inModal) {
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => measure(top), 50);
      } else measure(top);
    });
    const b = Keyboard.addListener(hide, () => {
      keyboardTop.current = null;
      setOverlap(0);
    });
    return () => {
      a.remove();
      b.remove();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [measure, inModal]);

  // Android may resize the window after keyboardDidShow: the box's new layout re-measures, so a
  // padding taken before the resize does not stay on top of it.
  const remeasure = useCallback(() => {
    if (keyboardTop.current !== null) measure(keyboardTop.current);
  }, [measure]);

  return { overlap, remeasure };
}

/**
 * Scrolls the focused input above the bottom of `scroll` once the keyboard is up. Android
 * scrolls a focused field into view before the window finishes shrinking, so a field near the
 * bottom of a form with a pinned footer ends up behind the footer; this corrects it afterwards.
 */
export function useKeepFocusedVisible(scroll: RefObject<ScrollView | null>, margin = 24): void {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const check = () => {
      if (timer) clearTimeout(timer);
      // Let the resize and the avoider's padding land first.
      timer = setTimeout(() => {
        const input = TextInput.State.currentlyFocusedInput();
        const sv = scroll.current;
        const host = sv?.getNativeScrollRef();
        // Under Fabric measureLayout needs a host ref; the content view's is on the instance, untyped.
        const inner = (sv as unknown as { getInnerViewRef?: () => View | null } | null)?.getInnerViewRef?.();
        if (!input || !sv || !host || !inner) return;
        host.measureInWindow((_sx, svY, _sw, svH) => {
          input.measureInWindow((_ix, inY, _iw, inH) => {
            const below = inY + inH + margin - (svY + svH);
            if (below <= 0) return;
            input.measureLayout(inner, (_l, top) => {
              const offset = top - (inY - svY);
              sv.scrollTo({ y: offset + below, animated: true });
            });
          });
        });
      }, 120);
    };
    const sub = Keyboard.addListener('keyboardDidShow', check);
    // Focus moving to another field while the keyboard stays up fires no keyboard event.
    const onFocus = () => {
      if (Keyboard.isVisible()) check();
    };
    focusListeners.add(onFocus);
    return () => {
      sub.remove();
      focusListeners.delete(onFocus);
      if (timer) clearTimeout(timer);
    };
  }, [scroll, margin]);
}

const focusListeners = new Set<() => void>();
/** `TextField` calls this on focus, so a form keeps a field moved to with the keyboard up in view too. */
export function notifyInputFocus(): void {
  focusListeners.forEach((l) => l());
}

export interface KeyboardAvoiderProps {
  children: ReactNode;
  /** Inside a RN Modal (its own window). */
  inModal?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** The outer box is measured and stays unpadded; the inner wrapper takes the overlap as bottom padding. */
export function KeyboardAvoider({ children, inModal, style }: KeyboardAvoiderProps) {
  const ref = useRef<View>(null);
  const { overlap, remeasure } = useKeyboardOverlap(ref, inModal);
  return (
    // box-none: the boxes only lay out, so a touch on their empty area reaches what is behind (a sheet's scrim).
    <View ref={ref} collapsable={false} onLayout={remeasure} pointerEvents="box-none" style={[{ flex: 1 }, style]}>
      <View pointerEvents="box-none" style={{ flex: 1, paddingBottom: overlap }}>{children}</View>
    </View>
  );
}

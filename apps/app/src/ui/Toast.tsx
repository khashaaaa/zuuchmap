import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { Animated, Pressable, Text, View, type LayoutChangeEvent } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { dark, elevation as elevationTokens, motion, radius, type as typeTokens } from '@zuuchmap/tokens';
import { Icon } from './Icon';
import { useReduceMotion } from './useReduceMotion';

export type ToastKind = 'success' | 'error' | 'info';

export interface ToastOptions {
  message: string;
  kind?: ToastKind;
  actionLabel?: string;
  onAction?: () => void;
}

interface ToastItem extends ToastOptions {
  id: number;
  kind: ToastKind;
}

const DURATION = 4000;
const DURATION_WITH_ACTION = 7000;

let current: ToastItem | null = null;
let nextId = 1;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function dismiss(id?: number) {
  if (id !== undefined && current?.id !== id) return;
  if (timer) clearTimeout(timer);
  timer = null;
  current = null;
  emit();
}

function show(opts: ToastOptions) {
  if (timer) clearTimeout(timer);
  const item: ToastItem = { ...opts, kind: opts.kind ?? 'info', id: nextId++ };
  current = item;
  emit();
  timer = setTimeout(() => dismiss(item.id), item.actionLabel ? DURATION_WITH_ACTION : DURATION);
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

/** Height of the focused screen's pinned bottom bar; 0 = none. The owner token keeps a blurring screen from clearing the next one's. */
let lift = 0;
let liftOwner: object | null = null;
const setLift = (owner: object, h: number) => {
  if (liftOwner !== owner && h === 0) return;
  liftOwner = h ? owner : null;
  if (h !== lift) { lift = h; emit(); }
};

/**
 * A screen's pinned bottom bar (it reaches the bottom edge and pads the safe-area inset itself): pass the returned
 * handler as the bar's `onLayout` and, while the screen has focus, toasts sit above the bar instead of over its buttons.
 */
export function useToastClearance(): (e: LayoutChangeEvent) => void {
  const owner = useRef({}).current;
  const height = useRef(0);
  const focused = useRef(false);
  useFocusEffect(useCallback(() => {
    focused.current = true;
    setLift(owner, height.current);
    return () => { focused.current = false; setLift(owner, 0); };
  }, [owner]));
  return useCallback((e: LayoutChangeEvent) => {
    height.current = e.nativeEvent.layout.height;
    if (focused.current) setLift(owner, height.current);
  }, [owner]);
}

/** `const toast = useToast(); toast.show({ message, kind })`. One toast at a time; a new one replaces the old. */
export function useToast() {
  return { show, dismiss: () => dismiss() };
}

const role = (v: { fontFamily: string; fontSize: number; lineHeight: number; letterSpacing: number }) => ({
  fontFamily: v.fontFamily, fontSize: v.fontSize, lineHeight: v.lineHeight, letterSpacing: v.letterSpacing,
});

const GLYPH: Record<ToastKind, string> = { success: 'circle-check', error: 'circle-alert', info: 'info' };

export interface ToastProps extends ToastOptions {
  onDismiss?: () => void;
}

/**
 * Always the dark palette so it stands off either theme: colours come from `dark` directly,
 * never from the theme hook.
 */
export function Toast({ message, kind = 'info', actionLabel, onAction, onDismiss }: ToastProps) {
  const tone = { success: dark.statusSuccess, error: dark.statusDanger, info: dark.statusInfo }[kind];
  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={[
        elevationTokens.lg,
        {
          minHeight: 54, maxWidth: 560, width: '100%', alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 12,
          paddingVertical: 14, paddingHorizontal: 16, borderRadius: radius.lg, backgroundColor: dark.bgSurfaceRaised,
          borderWidth: 1, borderColor: dark.borderDefault,
        },
      ]}
    >
      <Icon name={GLYPH[kind]} size={20} color={tone} />
      <Text style={{ ...role(typeTokens.bodyMedium), flex: 1, color: dark.textPrimary }}>{message}</Text>
      {actionLabel ? (
        <Pressable
          onPress={() => {
            onAction?.();
            onDismiss?.();
          }}
          hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          style={{ minHeight: 32, justifyContent: 'center' }}
        >
          <Text style={[role(typeTokens.labelStrong), { color: dark.textLink }]}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Tab bar content height (item 56 + 6 top padding); the toast sits above this plus the safe-area inset. */
const TAB_BAR_CONTENT = 62;

/**
 * Mount once, below the navigator. `aboveTabBar` lifts it over the tab bar; screens without one pass false.
 * A native Modal is its own Android window and hides the root toaster, so each modal hosts one more at the top
 * (`placement="top"`, clear of the sheet's footer button).
 */
export function Toaster({ aboveTabBar = true, placement = 'bottom' }: { aboveTabBar?: boolean; placement?: 'bottom' | 'top' }) {
  const item = useSyncExternalStore(subscribe, () => current, () => null);
  const bar = useSyncExternalStore(subscribe, () => lift, () => 0);
  const insets = useSafeAreaInsets();
  const reduce = useReduceMotion();
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!item) return;
    anim.setValue(0);
    Animated.timing(anim, { toValue: 1, duration: reduce ? 0 : motion.durationNormal, useNativeDriver: true }).start();
  }, [item, anim, reduce]);

  if (!item) return null;
  return (
    <Animated.View
      pointerEvents="box-none"
      style={{
        position: 'absolute', left: 16, right: 16,
        ...(placement === 'top' ? { top: insets.top + 12 } : { bottom: (bar || insets.bottom + (aboveTabBar ? TAB_BAR_CONTENT : 0)) + 12 }),
        opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [placement === 'top' ? -16 : 16, 0] }) }],
      }}
    >
      <Toast message={item.message} kind={item.kind} actionLabel={item.actionLabel} onAction={item.onAction} onDismiss={() => dismiss(item.id)} />
    </Animated.View>
  );
}

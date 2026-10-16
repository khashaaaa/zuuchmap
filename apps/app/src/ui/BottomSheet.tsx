import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Dimensions, Modal as RNModal, PanResponder, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { motion } from '@zuuchmap/tokens';
import { useAppTheme } from '../design/theme';
import { Button } from './Button';
import { KeyboardAvoider } from './KeyboardAvoider';
import { SheetGrabber } from './SheetGrabber';
import { Toaster } from './Toast';
import { useReduceMotion } from './useReduceMotion';

export interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  /** Text action beside the title ("Цэвэрлэх"). */
  secondaryLabel?: string;
  onSecondary?: () => void;
  /** Sticky footer with one primary action. */
  footerLabel?: string;
  onFooter?: () => void;
  footerDisabled?: boolean;
  children?: ReactNode;
}

const DISMISS_DISTANCE = 100;
const DISMISS_VELOCITY = 0.8;

/**
 * A Modal-hosted sheet: reaches the screen bottom and covers the tab bar, bottom padding includes the safe-area inset.
 * The PanResponder captures its closures at mount, so `onClose` is mirrored into a ref.
 */
export function BottomSheet({ visible, onClose, title, secondaryLabel, onSecondary, footerLabel, onFooter, footerDisabled, children }: BottomSheetProps) {
  const { colors, type, elevation, radius, isDark } = useAppTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const reduce = useReduceMotion();
  const [mounted, setMounted] = useState(visible);
  const y = useRef(new Animated.Value(Dimensions.get('window').height)).current;
  const scrim = useRef(new Animated.Value(0)).current;

  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const h = Dimensions.get('window').height;
    if (visible) {
      setMounted(true);
      y.setValue(h);
      scrim.setValue(0);
      if (reduce) {
        y.setValue(0);
        scrim.setValue(1);
      } else {
        Animated.parallel([
          Animated.spring(y, { toValue: 0, tension: motion.springSheetTension, friction: motion.springSheetFriction, useNativeDriver: true }),
          Animated.timing(scrim, { toValue: 1, duration: motion.durationNormal, useNativeDriver: true }),
        ]).start();
      }
    } else if (mounted) {
      Animated.parallel([
        Animated.timing(y, { toValue: h, duration: reduce ? 0 : motion.durationFast, useNativeDriver: true }),
        Animated.timing(scrim, { toValue: 0, duration: reduce ? 0 : motion.durationFast, useNativeDriver: true }),
      ]).start(({ finished }) => finished && setMounted(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `mounted` is only read to skip the first render
  }, [visible, reduce]);

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dy) > 4 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_e, g) => y.setValue(Math.max(0, g.dy)),
      onPanResponderRelease: (_e, g) => {
        if (g.dy > DISMISS_DISTANCE || g.vy > DISMISS_VELOCITY) onCloseRef.current();
        else Animated.spring(y, { toValue: 0, tension: motion.springSheetTension, friction: motion.springSheetFriction, useNativeDriver: true }).start();
      },
      onPanResponderTerminate: () => {
        Animated.spring(y, { toValue: 0, tension: motion.springSheetTension, friction: motion.springSheetFriction, useNativeDriver: true }).start();
      },
    }),
  ).current;

  if (!mounted) return null;
  const maxBody = Dimensions.get('window').height * 0.85;
  return (
    <RNModal visible transparent animationType="none" statusBarTranslucent onRequestClose={() => onCloseRef.current()}>
      <Animated.View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.bgScrim, opacity: scrim }} />
      <Pressable style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} onPress={() => onCloseRef.current()} accessibilityRole="button" accessibilityLabel={t('common.close')} />
      <KeyboardAvoider inModal style={{ justifyContent: 'flex-end' }}>
        <View style={{ flex: 1, justifyContent: 'flex-end', paddingTop: insets.top + 12 }} pointerEvents="box-none">
          <Animated.View
            accessibilityViewIsModal
            style={[
              elevation.lg,
              {
                maxHeight: maxBody, flexShrink: 1, alignSelf: 'center', width: '100%', maxWidth: 640, backgroundColor: colors.bgSurfaceRaised,
                borderTopLeftRadius: radius.modal, borderTopRightRadius: radius.modal,
                borderWidth: isDark ? 1 : 0, borderBottomWidth: 0, transform: [{ translateY: y }],
              },
            ]}
          >
            <View {...pan.panHandlers}>
              <View style={{ alignItems: 'center', paddingTop: 10, paddingBottom: 6 }}>
                <SheetGrabber />
              </View>
              {title || secondaryLabel ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 4, paddingHorizontal: 20, paddingBottom: 12 }}>
                  <Text accessibilityRole="header" style={[type.h3, { flex: 1, color: colors.textPrimary }]} numberOfLines={2}>{title}</Text>
                  {secondaryLabel ? (
                    <Pressable onPress={onSecondary} hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }} accessibilityRole="button" accessibilityLabel={secondaryLabel} style={{ minHeight: 24, justifyContent: 'center' }}>
                      <Text style={[type.labelStrong, { color: colors.textLink }]}>{secondaryLabel}</Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}
            </View>
            <ScrollView style={{ flexGrow: 0, flexShrink: 1 }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop: 8, paddingHorizontal: 20, paddingBottom: 16, gap: 12 }}>
              {children}
            </ScrollView>
            <View
              style={{
                paddingTop: footerLabel ? 12 : 0, paddingHorizontal: 20, paddingBottom: (footerLabel ? 12 : 0) + insets.bottom,
                backgroundColor: colors.bgSurfaceRaised, borderTopWidth: footerLabel ? 1 : 0, borderTopColor: colors.borderSubtle,
              }}
            >
              {footerLabel ? <Button label={footerLabel} fullWidth disabled={footerDisabled} onPress={onFooter} /> : null}
            </View>
          </Animated.View>
        </View>
      </KeyboardAvoider>
      <Toaster placement="top" />
    </RNModal>
  );
}

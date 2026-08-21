import React, { useEffect, useRef, useMemo, useState } from 'react';
import {
    Modal,
    View,
    TouchableOpacity,
    Animated,
    Dimensions,
    StyleSheet,
} from 'react-native';
import { spacing, radius, animations } from '../design/theme';
import { useAppTheme } from '../hooks/useAppTheme';
import { useReducedMotion } from '../hooks/useReducedMotion';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const BaseModal = ({
    visible,
    onClose,
    variant = 'dialog', // 'dialog' | 'bottomSheet' | 'fullScreen'
    children,
    showOverlay = true,
    overlayOpacity = 0.6,
    dismissible = true,
    dragY,
    style,
}) => {
    const { colors } = useAppTheme();
    const reduced = useReducedMotion();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
    const scaleAnim = useRef(new Animated.Value(0.8)).current;
    const combinedSlide = useMemo(
        () => dragY ? Animated.add(slideAnim, dragY) : slideAnim,
        [slideAnim, dragY],
    );

    // Keep modal mounted until exit animation finishes
    const [isOpen, setIsOpen] = useState(visible);

    useEffect(() => {
        if (visible) setIsOpen(true);
    }, [visible]);

    useEffect(() => {
        if (!isOpen) return;

        // Reduced-motion: collapse springs/timings to a near-instant transition
        // instead of skipping the animation object entirely (keeps start() callbacks intact).
        const normalDur = reduced ? 1 : animations.duration.normal;
        const fastDur = reduced ? 1 : animations.duration.fast;

        if (visible) {
            if (variant === 'bottomSheet') {
                Animated.parallel([
                    reduced
                        ? Animated.timing(slideAnim, { toValue: 0, duration: 1, useNativeDriver: true })
                        : Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, ...animations.spring.modal }),
                    Animated.timing(fadeAnim, { toValue: 1, duration: fastDur, useNativeDriver: true }),
                ]).start();
            } else if (variant === 'dialog') {
                Animated.parallel([
                    Animated.timing(fadeAnim, { toValue: 1, duration: normalDur, useNativeDriver: true }),
                    reduced
                        ? Animated.timing(scaleAnim, { toValue: 1, duration: 1, useNativeDriver: true })
                        : Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, ...animations.spring.modal }),
                ]).start();
            } else {
                Animated.timing(fadeAnim, { toValue: 1, duration: normalDur, useNativeDriver: true }).start();
            }
        } else {
            if (variant === 'bottomSheet') {
                Animated.parallel([
                    Animated.timing(slideAnim, { toValue: SCREEN_HEIGHT, duration: fastDur, useNativeDriver: true }),
                    Animated.timing(fadeAnim, { toValue: 0, duration: fastDur, useNativeDriver: true }),
                ]).start(({ finished }) => { if (finished) setIsOpen(false); });
            } else if (variant === 'dialog') {
                Animated.parallel([
                    Animated.timing(fadeAnim, { toValue: 0, duration: fastDur, useNativeDriver: true }),
                    Animated.timing(scaleAnim, { toValue: 0.8, duration: fastDur, useNativeDriver: true }),
                ]).start(({ finished }) => { if (finished) setIsOpen(false); });
            } else {
                Animated.timing(fadeAnim, { toValue: 0, duration: fastDur, useNativeDriver: true })
                    .start(({ finished }) => { if (finished) setIsOpen(false); });
            }
        }
    }, [visible, isOpen, variant, reduced]);

    if (!isOpen) return null;

    const getModalStyle = () => {
        switch (variant) {
            case 'bottomSheet':
                return {
                    ...colors.elevation.lg,
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    borderTopLeftRadius: radius.modal,
                    borderTopRightRadius: radius.modal,
                    backgroundColor: colors.surface,
                    maxHeight: SCREEN_HEIGHT * 0.9,
                };
            case 'fullScreen':
                return {
                    flex: 1,
                    backgroundColor: colors.surface,
                };
            case 'dialog':
            default:
                return {
                    ...colors.elevation.lg,
                    backgroundColor: colors.surface,
                    borderRadius: radius.modal,
                    padding: spacing.xl,
                    maxWidth: 400,
                    width: '90%',
                    alignSelf: 'center',
                };
        }
    };

    const getAnimatedStyle = () => {
        if (variant === 'bottomSheet') {
            return { transform: [{ translateY: combinedSlide }] };
        } else if (variant === 'dialog') {
            return { opacity: fadeAnim, transform: [{ scale: scaleAnim }] };
        }
        return { opacity: fadeAnim };
    };

    return (
        <Modal
            visible={isOpen}
            transparent={true}
            animationType="none"
            onRequestClose={dismissible ? onClose : undefined}
            statusBarTranslucent
        >
            <View style={getContainerStyle(variant)}>
                {showOverlay && (
                    <Animated.View
                        style={[
                            styles.overlay,
                            {
                                opacity: fadeAnim.interpolate({
                                    inputRange: [0, 1],
                                    outputRange: [0, overlayOpacity],
                                }),
                            },
                        ]}
                    />
                )}

                {dismissible && showOverlay && (
                    <TouchableOpacity
                        style={StyleSheet.absoluteFill}
                        activeOpacity={1}
                        onPress={onClose}
                    />
                )}

                <Animated.View style={[getModalStyle(), getAnimatedStyle(), style]}>
                    {children}
                </Animated.View>
            </View>
        </Modal>
    );
};

const getContainerStyle = (variant) => ({
    flex: 1,
    justifyContent: variant === 'bottomSheet' ? 'flex-end' : 'center',
    alignItems: 'center',
});

const createStyles = (colors) => StyleSheet.create({
    overlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: colors.opacity.overlayDark,
    },
});

export default BaseModal;

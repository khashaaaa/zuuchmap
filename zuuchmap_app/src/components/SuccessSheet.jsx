import React, { useMemo, useRef, useEffect } from 'react';
import { View, Text, Animated, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { spacing, typography, radius, animations } from '../design/theme';
import { useAppTheme } from '../hooks/useAppTheme';
import { useReducedMotion } from '../hooks/useReducedMotion';
import BaseModal from './BaseModal';
import Button from './Button';

/**
 * The celebration counterpart to ErrorModal — for moments worth staging
 * (first post published, booking accepted), not for routine confirmations.
 * The checkmark lands on the `pop` spring (the one token that is meant to be
 * seen bouncing), then title, body and CTA follow at `animations.stagger`.
 */
const SuccessSheet = ({ visible, onClose, title, message, ctaText, onCta }) => {
    const { colors } = useAppTheme();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const reduced = useReducedMotion();

    const checkScale = useRef(new Animated.Value(0)).current;
    const titleAnim = useRef(new Animated.Value(0)).current;
    const bodyAnim = useRef(new Animated.Value(0)).current;
    const ctaAnim = useRef(new Animated.Value(0)).current;
    const rows = [titleAnim, bodyAnim, ctaAnim];

    useEffect(() => {
        if (!visible) return;
        if (reduced) {
            checkScale.setValue(1);
            rows.forEach((r) => r.setValue(1));
            return;
        }
        checkScale.setValue(0);
        rows.forEach((r) => r.setValue(0));
        Animated.sequence([
            // Let BaseModal's dialog spring land before the moment starts.
            Animated.delay(animations.duration.fast),
            Animated.parallel([
                Animated.spring(checkScale, { toValue: 1, useNativeDriver: true, ...animations.pop }),
                Animated.stagger(
                    animations.stagger,
                    rows.map((r) => Animated.timing(r, {
                        toValue: 1,
                        duration: animations.duration.normal,
                        useNativeDriver: true,
                    })),
                ),
            ]),
        ]).start();
    }, [visible, reduced]);

    const rowStyle = (anim) => ({
        opacity: anim,
        transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
    });

    return (
        <BaseModal visible={visible} onClose={onClose} variant="dialog">
            <View style={styles.content}>
                <Animated.View style={[styles.checkDisc, { transform: [{ scale: checkScale }] }]}>
                    <Ionicons name="checkmark" size={44} color={colors.success} />
                </Animated.View>
                <Animated.Text style={[styles.title, rowStyle(titleAnim)]}>{title}</Animated.Text>
                {!!message && (
                    <Animated.Text style={[styles.message, rowStyle(bodyAnim)]}>{message}</Animated.Text>
                )}
                <Animated.View style={[styles.ctaWrap, rowStyle(ctaAnim)]}>
                    <Button title={ctaText} onPress={onCta || onClose} fullWidth />
                </Animated.View>
            </View>
        </BaseModal>
    );
};

const createStyles = (colors) => StyleSheet.create({
    content: {
        alignItems: 'center',
    },
    checkDisc: {
        width: 88,
        height: 88,
        borderRadius: radius.full,
        backgroundColor: colors.opacity.background.success,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: spacing.lg,
    },
    title: {
        ...typography.styles.display,
        color: colors.text.primary,
        textAlign: 'center',
        marginBottom: spacing.sm,
    },
    message: {
        ...typography.styles.body,
        color: colors.text.secondary,
        textAlign: 'center',
        marginBottom: spacing.xl,
    },
    ctaWrap: {
        alignSelf: 'stretch',
    },
});

export default SuccessSheet;

import React, { useMemo, useRef, useEffect } from 'react';
import { View, Text, Animated, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { spacing, typography, radius, animations } from '../design/theme';
import { useAppTheme } from '../hooks/useAppTheme';
import { useReducedMotion } from '../hooks/useReducedMotion';
import BaseModal from './BaseModal';
import Button from './Button';
import { successHaptic } from '../utils/haptics';

/**
 * The celebration counterpart to ErrorModal — for moments worth staging
 * (first post published, booking accepted), not for routine confirmations.
 * The checkmark lands on the `pop` spring (the one token that is meant to be
 * seen bouncing); title, body and CTA are visible immediately.
 */
const SuccessSheet = ({ visible, onClose, title, message, ctaText, onCta }) => {
    const { colors } = useAppTheme();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const reduced = useReducedMotion();

    const checkScale = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (!visible) return;
        successHaptic();
        if (reduced) {
            checkScale.setValue(1);
            return;
        }
        checkScale.setValue(0);
        Animated.spring(checkScale, { toValue: 1, useNativeDriver: true, ...animations.pop }).start();
    }, [visible, reduced]);

    return (
        <BaseModal visible={visible} onClose={onClose} variant="dialog">
            <View style={styles.content}>
                <Animated.View style={[styles.checkDisc, { transform: [{ scale: checkScale }] }]}>
                    <Ionicons name="checkmark" size={44} color={colors.success} />
                </Animated.View>
                <Text style={styles.title}>{title}</Text>
                {!!message && (
                    <Text style={styles.message}>{message}</Text>
                )}
                <View style={styles.ctaWrap}>
                    <Button title={ctaText} onPress={onCta || onClose} fullWidth />
                </View>
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

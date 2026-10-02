import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import BaseModal from './BaseModal';
import { spacing, typography, radius, animations } from '../design/theme';
import { useAppTheme } from '../hooks/useAppTheme';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useTranslation } from 'react-i18next';
import Button from './Button';

const DialogModal = ({
    visible,
    onClose,
    title,
    message,
    icon,
    iconColor,
    iconBgColor,
    buttons,
    children,
    dismissible = true,
}) => {
    const { colors } = useAppTheme();
    const { t } = useTranslation();
    const reduced = useReducedMotion();
    const iconScale = useRef(new Animated.Value(1)).current;
    const defaultButtons = buttons?.length ? buttons : [{ text: t('common.ok'), onPress: onClose, variant: 'primary' }];

    useEffect(() => {
        if (!visible) return;
        if (reduced) {
            iconScale.setValue(1);
            return;
        }
        iconScale.setValue(0.5);
        Animated.spring(iconScale, { toValue: 1, useNativeDriver: true, ...animations.spring.modal }).start();
    }, [visible, reduced, iconScale]);

    // Half a phone-width dialog holds about a dozen characters of label, and a
    // button label never wraps — "Одоохондоо үгүй" rendered as "Одоохондоо үг…".
    // A pair with a longer label stacks instead, as three or more always do.
    const LONG_LABEL = 12;
    const stacked = defaultButtons.length > 2
        || (defaultButtons.length === 2 && defaultButtons.some((b) => String(b.text ?? '').length > LONG_LABEL));
    const sideBySide = defaultButtons.length === 2 && !stacked;

    return (
        <BaseModal
            visible={visible}
            onClose={onClose}
            variant="dialog"
            dismissible={dismissible}
        >
            {icon && (
                <Animated.View style={[
                    styles.iconContainer,
                    { backgroundColor: colors.opacity.background.primary },
                    iconBgColor && { backgroundColor: iconBgColor },
                    !reduced && { transform: [{ scale: iconScale }] },
                ]}>
                    <Ionicons
                        name={icon}
                        size={48}
                        color={iconColor || colors.primary}
                    />
                </Animated.View>
            )}

            {title && (
                <Text style={[styles.title, { color: colors.text.primary }]}>{title}</Text>
            )}

            {message && (
                <Text style={[styles.message, { color: colors.text.secondary }]}>{message}</Text>
            )}

            {children}

            <View style={[styles.buttonContainer, stacked && styles.buttonContainerStacked]}>
                {defaultButtons.map((button, index) => (
                    <Button
                        key={index}
                        title={button.text}
                        onPress={() => {
                            if (button.onPress) {
                                button.onPress();
                            }
                            if (button.closeOnPress !== false) {
                                onClose();
                            }
                        }}
                        variant={button.variant || 'primary'}
                        size="medium"
                        fullWidth={!sideBySide}
                        style={[
                            sideBySide && styles.buttonMultiple,
                            button.style,
                        ]}
                    />
                ))}
            </View>
        </BaseModal>
    );
};

const styles = StyleSheet.create({
    iconContainer: {
        width: 80,
        height: 80,
        borderRadius: radius.pill,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: spacing.lg,
        alignSelf: 'center',
    },
    title: {
        ...typography.styles.h3,
        marginBottom: spacing.md,
        textAlign: 'center',
    },
    message: {
        ...typography.styles.body,
        textAlign: 'center',
        marginBottom: spacing.xl,
    },
    buttonContainer: {
        flexDirection: 'row',
        width: '100%',
        gap: spacing.md,
        marginTop: spacing.md,
    },
    // Three or more actions side by side squeeze their labels to nothing;
    // stack them instead, the way an action sheet would.
    buttonContainerStacked: {
        flexDirection: 'column',
    },
    buttonMultiple: {
        flex: 1,
    },
});

export default DialogModal;

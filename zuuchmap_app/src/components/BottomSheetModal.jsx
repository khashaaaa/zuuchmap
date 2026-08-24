import React, { useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Animated, PanResponder, KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import BaseModal from './BaseModal';
import { spacing, typography, radius, safeAreaHelpers, interactions, animations } from '../design/theme';
import { useAppTheme } from '../hooks/useAppTheme';
import { useReducedMotion } from '../hooks/useReducedMotion';

const BottomSheetModal = ({
    visible,
    onClose,
    title,
    children,
    footer,
    showHeader = true,
    showCloseButton = true,
    dismissible = true,
    maxHeight,
    style,
}) => {
    const insets = useSafeAreaInsets();
    const { colors } = useAppTheme();
    const { t } = useTranslation();
    const reduced = useReducedMotion();
    const panY = useRef(new Animated.Value(0)).current;
    const onCloseRef = useRef(onClose);
    const isClosingRef = useRef(false);
    // PanResponder callbacks close over refs (created once below), not state —
    // mirror the onCloseRef pattern so the reduced-motion flag stays current.
    const reducedRef = useRef(reduced);
    useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
    useEffect(() => { reducedRef.current = reduced; }, [reduced]);
    useEffect(() => {
        if (visible) {
            panY.setValue(0);
            isClosingRef.current = false;
        }
    }, [visible]);

    const panResponder = useRef(PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, { dy }) => dy > 0,
        onPanResponderMove: (_, { dy }) => {
            if (dy > 0) panY.setValue(dy);
        },
        onPanResponderRelease: (_, { dy, vy }) => {
            if (dy > 80 || vy > 0.5) {
                isClosingRef.current = true;
                Animated.timing(panY, {
                    toValue: 600,
                    duration: reducedRef.current ? 1 : animations.duration.normal,
                    useNativeDriver: true,
                }).start(() => {
                    onCloseRef.current();
                });
            } else if (reducedRef.current) {
                Animated.timing(panY, { toValue: 0, duration: 1, useNativeDriver: true }).start();
            } else {
                Animated.spring(panY, { toValue: 0, useNativeDriver: true, ...animations.spring.sheet }).start();
            }
        },
        onPanResponderTerminate: () => {
            if (!isClosingRef.current) {
                if (reducedRef.current) {
                    Animated.timing(panY, { toValue: 0, duration: 1, useNativeDriver: true }).start();
                } else {
                    Animated.spring(panY, { toValue: 0, useNativeDriver: true, ...animations.spring.sheet }).start();
                }
            }
        },
    })).current;

    return (
        <BaseModal
            visible={visible}
            onClose={onClose}
            variant="bottomSheet"
            dismissible={dismissible}
            dragY={panY}
            style={[
                maxHeight && { maxHeight },
                style,
            ]}
        >
            <KeyboardAvoidingView
                style={styles.sheetBody}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            >
                {showHeader && (
                    <View style={[styles.header, { borderBottomColor: colors.border.light }]} {...panResponder.panHandlers}>
                        <View style={[styles.handle, { backgroundColor: colors.border.medium }]} />
                        <View style={styles.headerContent}>
                            {title && (
                                <Text style={[styles.title, { color: colors.text.primary }]}>{title}</Text>
                            )}
                            {showCloseButton && (
                                <TouchableOpacity
                                    onPress={onClose}
                                    style={styles.closeButton}
                                    activeOpacity={interactions.activeOpacityLight}
                                    hitSlop={interactions.hitSlop}
                                    accessibilityRole="button"
                                    accessibilityLabel={t('common.close')}
                                >
                                    <Ionicons name="close" size={24} color={colors.iconAccent} />
                                </TouchableOpacity>
                            )}
                        </View>
                    </View>
                )}

                <ScrollView
                    style={styles.content}
                    contentContainerStyle={[
                        styles.contentContainer,
                        { paddingBottom: safeAreaHelpers.getBottomSafeArea(insets) + spacing.lg },
                    ]}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                >
                    {children}
                </ScrollView>

                {footer && (
                    <View style={[
                        styles.footer,
                        { backgroundColor: colors.surface, borderTopColor: colors.border.light },
                        { paddingBottom: safeAreaHelpers.getBottomSafeArea(insets) + spacing.md },
                    ]}>
                        {footer}
                    </View>
                )}
            </KeyboardAvoidingView>
        </BaseModal>
    );
};

const styles = StyleSheet.create({
    header: {
        paddingTop: spacing.md,
        paddingBottom: spacing.sm,
        paddingHorizontal: spacing.lg,
        borderBottomWidth: 1,
    },
    handle: {
        width: 40,
        height: 4,
        borderRadius: radius.full,
        alignSelf: 'center',
        marginBottom: spacing.md,
    },
    headerContent: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    title: {
        ...typography.styles.title,
        flex: 1,
    },
    closeButton: {
        padding: spacing.xs,
        marginLeft: spacing.md,
    },
    // The sheet (BaseModal bottomSheet variant) is an auto-height flex child
    // capped by maxHeight — nothing inside it may use flex:1 (flex-basis 0
    // collapses an auto-height parent to zero). Content sizes the sheet;
    // flexShrink lets the ScrollView give way when the cap bites, keeping the
    // footer pinned on screen.
    sheetBody: {
        flexShrink: 1,
    },
    content: {
        flexGrow: 0,
        flexShrink: 1,
    },
    contentContainer: {
        padding: spacing.lg,
    },
    footer: {
        paddingHorizontal: spacing.lg,
        paddingTop: spacing.md,
        borderTopWidth: 1,
    },
});

export default BottomSheetModal;

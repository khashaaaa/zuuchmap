import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { spacing, typography, radius, interactions } from '../design/theme';
import { useAppTheme } from '../hooks/useAppTheme';
import { useTranslation } from 'react-i18next';

/**
 * Full-screen error state: icon, title, message, optional retry button.
 * Use inside a screen that already has a header, or with ScreenLayout.
 */
const ScreenError = ({
    title,
    message,
    onRetry,
    icon = 'alert-circle-outline',
    iconSize = 64,
}) => {
    const { colors } = useAppTheme();
    const { t } = useTranslation();
    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <View style={[styles.iconContainer, { backgroundColor: colors.opacity.background.primary }]}>
                <Ionicons name={icon} size={iconSize} color={colors.primary} />
            </View>
            <Text style={[styles.title, { color: colors.text.primary }]}>
                {title || t('common.error')}
            </Text>
            {message ? (
                <Text style={[styles.message, { color: colors.text.secondary }]}>{message}</Text>
            ) : null}
            {onRetry ? (
                <TouchableOpacity
                    style={[styles.retryBtn, { backgroundColor: colors.primary }]}
                    onPress={onRetry}
                    activeOpacity={interactions.activeOpacity}
                >
                    <Text style={[styles.retryText, { color: colors.onPrimary }]}>
                        {t('common.back')}
                    </Text>
                </TouchableOpacity>
            ) : null}
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xxl },
    iconContainer: {
        width: 80, height: 80, borderRadius: radius.full,
        justifyContent: 'center', alignItems: 'center', marginBottom: spacing.xl,
    },
    title: { fontSize: typography.lg, fontWeight: 'bold', marginBottom: spacing.sm },
    message: { fontSize: typography.md, textAlign: 'center', lineHeight: 22, marginBottom: spacing.xxl },
    retryBtn: { borderRadius: radius.button, paddingVertical: spacing.md, paddingHorizontal: spacing.xl },
    retryText: { fontSize: typography.md, fontWeight: '600' },
});

export default ScreenError;

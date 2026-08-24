import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { spacing, typography, radius } from '../design/theme';
import { useAppTheme } from '../hooks/useAppTheme';
import { useTranslation } from 'react-i18next';
import Button from './Button';

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
    // Default copy so a screen can render <ScreenError onRetry={refetch} /> and
    // still say something useful — the point is that "empty" and "broken" must
    // never look the same.
    const resolvedMessage = message ?? t('errors.loadFailed');
    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <View style={[styles.iconContainer, { backgroundColor: colors.opacity.background.primary }]}>
                <Ionicons name={icon} size={iconSize} color={colors.iconAccent} />
            </View>
            <Text style={[styles.title, { color: colors.text.primary }]}>
                {title || t('common.error')}
            </Text>
            {resolvedMessage ? (
                <Text style={[styles.message, { color: colors.text.secondary }]}>{resolvedMessage}</Text>
            ) : null}
            {onRetry ? (
                <Button title={t('common.retry')} onPress={onRetry} />
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
    title: { ...typography.styles.h2, marginBottom: spacing.sm },
    message: { ...typography.styles.body, textAlign: 'center', marginBottom: spacing.xxl },
});

export default ScreenError;

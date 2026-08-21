import React from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { spacing, typography } from '../design/theme';
import { useAppTheme } from '../hooks/useAppTheme';
import { useTranslation } from 'react-i18next';

/**
 * Full-screen loading state: centered spinner + message.
 * Use inside a screen that already has a header, or with ScreenLayout.
 */
const ScreenLoading = ({ message }) => {
    const { colors } = useAppTheme();
    const { t } = useTranslation();
    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.text, { color: colors.text.primary }]}>
                {message || t('common.loading')}
            </Text>
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    text: { ...typography.styles.bodyBold, marginTop: spacing.lg },
});

export default ScreenLoading;

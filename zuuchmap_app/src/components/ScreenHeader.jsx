import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { spacing, typography, interactions } from '../design/theme';
import { useAppTheme } from '../hooks/useAppTheme';
import { useAppContext } from '../context/AppContext';

export default function ScreenHeader({ title, onBack, rightComponent, showBack = true, style }) {
    const { colors, isDark } = useAppTheme();
    const { setThemeMode } = useAppContext();
    const { t } = useTranslation();
    return (
        <View style={[styles.header, colors.elevation.sm, { backgroundColor: colors.surface }, style]}>
            {showBack && onBack ? (
                <TouchableOpacity
                    style={styles.btn}
                    onPress={onBack}
                    activeOpacity={interactions.activeOpacity}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityRole="button"
                    accessibilityLabel={t('common.back')}
                >
                    <Ionicons name="arrow-back" size={24} color={colors.iconAccent} />
                </TouchableOpacity>
            ) : (
                <TouchableOpacity
                    style={styles.btn}
                    onPress={() => setThemeMode(isDark ? 'light' : 'dark')}
                    activeOpacity={interactions.activeOpacity}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityRole="button"
                    accessibilityLabel={isDark ? t('settings.light') : t('settings.dark')}
                >
                    <Ionicons name={isDark ? 'sunny-outline' : 'moon-outline'} size={20} color={colors.text.secondary} />
                </TouchableOpacity>
            )}
            <Text style={[styles.title, { color: colors.text.primary }]}>{title}</Text>
            <View style={styles.side}>{rightComponent ?? null}</View>
        </View>
    );
}

const styles = StyleSheet.create({
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, minHeight: 64, },
    title:  { ...typography.styles.h3, textAlign: 'center', flex: 1 },
    btn:    { padding: spacing.sm, width: 40, alignItems: 'center', justifyContent: 'center' },
    side:   { minWidth: 40, alignItems: 'flex-end' },
});

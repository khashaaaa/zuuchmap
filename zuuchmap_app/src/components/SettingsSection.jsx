import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useAppContext } from '../context/AppContext';
import { LANGUAGES } from '../i18n';
import { useAppTheme } from '../hooks/useAppTheme';
import { spacing, typography, radius, interactions } from '../design/theme';

export default function SettingsSection() {
    const { t } = useTranslation();
    const { locale, setLocale } = useAppContext();
    const { colors } = useAppTheme();
    const [isOpen, setIsOpen] = useState(false);

    const currentLang = LANGUAGES.find(l => l.code === locale);

    return (
        <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border.light }]}>
            <TouchableOpacity
                style={styles.accordionHeader}
                onPress={() => setIsOpen(prev => !prev)}
                activeOpacity={interactions.activeOpacityLight}
            >
                <Text style={[styles.sectionTitle, { color: colors.text.primary }]}>
                    {t('settings.language')}
                </Text>
                <View style={styles.headerRight}>
                    {currentLang && (
                        <Text style={[styles.currentLang, { color: colors.text.primary }]}>
                            {currentLang.flag} {currentLang.label}
                        </Text>
                    )}
                    <Ionicons
                        name={isOpen ? 'chevron-up' : 'chevron-down'}
                        size={16}
                        color={colors.text.primary}
                        style={styles.chevron}
                    />
                </View>
            </TouchableOpacity>

            {isOpen && (
                <View style={styles.langGrid}>
                    {LANGUAGES.map((lang) => {
                        const isActive = locale === lang.code;
                        return (
                            <TouchableOpacity
                                key={lang.code}
                                style={[
                                    styles.langBtn,
                                    {
                                        borderColor: isActive ? colors.primary : colors.border.light,
                                        backgroundColor: isActive ? colors.opacity.background.primary : 'transparent',
                                    },
                                ]}
                                onPress={() => setLocale(lang.code)}
                                activeOpacity={interactions.activeOpacityLight}
                            >
                                <Text style={styles.flag}>{lang.flag}</Text>
                                <Text style={[styles.langLabel, { color: isActive ? colors.primary : colors.text.secondary }]}>
                                    {lang.label}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    section: {
        borderRadius: radius.card,
        marginVertical: spacing.sm,
        borderWidth: 1,
        overflow: 'hidden',
    },
    accordionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.lg,
    },
    sectionTitle: {
        ...typography.styles.overline,
        textTransform: 'uppercase',
    },
    headerRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
    },
    currentLang: {
        ...typography.styles.label,
    },
    chevron: {
        marginLeft: spacing.xs,
    },
    langGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: spacing.sm,
        paddingHorizontal: spacing.lg,
        paddingBottom: spacing.lg,
    },
    langBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.md,
        borderRadius: radius.md,
        borderWidth: 1.5,
    },
    flag: {
        ...typography.styles.body,
    },
    langLabel: {
        ...typography.styles.label,
    },
});

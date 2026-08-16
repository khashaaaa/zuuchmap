import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ScreenLayout } from '../../components';
import { spacing, typography, radius, shadows } from '../../design/theme';
import { useAppTheme } from '../../hooks/useAppTheme';

const PrivacyPolicyScreen = ({ navigation }) => {
  const { t } = useTranslation();
  const { colors } = useAppTheme();

  const sections = [
    { title: t('privacy.dataTitle'), text: t('privacy.dataText') },
    { title: t('privacy.useTitle'), text: t('privacy.useText') },
    { title: t('privacy.shareTitle'), text: t('privacy.shareText') },
    { title: t('privacy.deleteTitle'), text: t('privacy.deleteText') },
  ];

  return (
    <ScreenLayout title={t('privacy.title')} showBack onBack={() => navigation.goBack()}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <Text style={[styles.effective, { color: colors.text.secondary }]}>{t('privacy.effective')}</Text>
          <Text style={[styles.intro, { color: colors.text.secondary }]}>{t('privacy.intro')}</Text>
        </View>

        {sections.map(({ title, text }) => (
          <View key={title} style={[styles.card, { backgroundColor: colors.surface }]}>
            <Text style={[styles.sectionTitle, { color: colors.text.inverse }]}>{title}</Text>
            <Text style={[styles.sectionText, { color: colors.text.secondary }]}>{text}</Text>
          </View>
        ))}

        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <Text style={[styles.sectionText, { color: colors.text.secondary }]}>{t('privacy.contact')}</Text>
        </View>
      </ScrollView>
    </ScreenLayout>
  );
};

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxxl },
  card: { borderRadius: radius.xl, padding: spacing.lg, ...shadows.small },
  effective: { fontSize: typography.xs, marginBottom: spacing.sm },
  intro: { fontSize: typography.sm, lineHeight: typography.sm * 1.6 },
  sectionTitle: { fontSize: typography.md, fontWeight: '600', marginBottom: spacing.sm },
  sectionText: { fontSize: typography.sm, lineHeight: typography.sm * 1.6 },
});

export default PrivacyPolicyScreen;

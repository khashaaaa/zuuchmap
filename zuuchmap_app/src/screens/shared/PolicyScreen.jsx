import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ScreenLayout } from '../../components';
import { spacing, typography, radius } from '../../design/theme';
import { useAppTheme } from '../../hooks/useAppTheme';

// Section key pairs per policy document; the screen renders whichever
// namespace the route asks for.
const DOCS = {
  privacy: ['data', 'use', 'share', 'delete'],
  terms: ['accept', 'users', 'listingLifetime', 'content', 'liability'],
};

// Serves the Privacy and Terms routes — same layout, different i18n namespace.
const PolicyScreen = ({ route, navigation }) => {
  const { t } = useTranslation();
  const { colors } = useAppTheme();

  const ns = route?.params?.doc || 'privacy';
  const sections = (DOCS[ns] || []).map((key) => ({
    title: t(`${ns}.${key}Title`),
    text: t(`${ns}.${key}Text`),
  }));

  return (
    <ScreenLayout title={t(`${ns}.title`)} showBack onBack={() => navigation.goBack()}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.card, colors.elevation.sm, { backgroundColor: colors.surface }]}>
          <Text style={[styles.effective, { color: colors.text.secondary }]}>{t(`${ns}.effective`)}</Text>
          <Text style={[styles.intro, { color: colors.text.secondary }]}>{t(`${ns}.intro`)}</Text>
        </View>

        {sections.map(({ title, text }) => (
          <View key={title} style={[styles.card, colors.elevation.sm, { backgroundColor: colors.surface }]}>
            <Text style={[styles.sectionTitle, { color: colors.text.primary }]}>{title}</Text>
            <Text style={[styles.sectionText, { color: colors.text.secondary }]}>{text}</Text>
          </View>
        ))}

        <View style={[styles.card, colors.elevation.sm, { backgroundColor: colors.surface }]}>
          <Text style={[styles.sectionText, { color: colors.text.secondary }]}>{t(`${ns}.contact`)}</Text>
        </View>
      </ScrollView>
    </ScreenLayout>
  );
};

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxxl },
  card: { borderRadius: radius.xl, padding: spacing.lg, },
  effective: { ...typography.styles.small, marginBottom: spacing.sm },
  intro: { ...typography.styles.body },
  sectionTitle: { ...typography.styles.title, marginBottom: spacing.sm },
  sectionText: { ...typography.styles.body },
});

export default PolicyScreen;

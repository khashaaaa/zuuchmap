import React from 'react';
import { View, Text, ScrollView, Linking, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { ScreenLayout } from '../../components';
import PressableScale from '../../components/PressableScale';
import { spacing, typography, radius, isTablet } from '../../design/theme';
import { useAppTheme } from '../../hooks/useAppTheme';

const ContactRow = ({ icon, label, value, onPress, colors }) => (
  <PressableScale
    style={styles.contactRow}
    onPress={onPress}
    accessibilityRole="link"
  >
    <View style={[styles.contactIcon, { backgroundColor: colors.opacity.background.primary }]}>
      <Ionicons name={icon} size={20} color={colors.iconAccent} />
    </View>
    <View style={styles.contactText}>
      <Text style={[styles.contactLabel, { color: colors.text.secondary }]}>{label}</Text>
      <Text style={[styles.contactValue, { color: colors.text.link }]}>{value}</Text>
    </View>
    <Ionicons name="chevron-forward" size={20} color={colors.text.secondary} />
  </PressableScale>
);

const FaqItem = ({ question, answer, colors }) => (
  <View style={styles.faqItem}>
    <Text style={[styles.faqQ, { color: colors.text.primary }]}>{question}</Text>
    <Text style={[styles.faqA, { color: colors.text.secondary }]}>{answer}</Text>
  </View>
);

const HelpSupportScreen = ({ navigation }) => {
  const { t } = useTranslation();
  const { colors } = useAppTheme();

  const faqs = [
    { q: t('helpSupport.faq1Q'), a: t('helpSupport.faq1A') },
    { q: t('helpSupport.faq2Q'), a: t('helpSupport.faq2A') },
    { q: t('helpSupport.faq3Q'), a: t('helpSupport.faq3A') },
    { q: t('helpSupport.faq4Q'), a: t('helpSupport.faq4A') },
  ];

  return (
    <ScreenLayout title={t('helpSupport.title')} showBack onBack={() => navigation.goBack()}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.card, colors.elevation.sm, { backgroundColor: colors.surface }]}>
          <ContactRow
            icon="call-outline"
            label={t('helpSupport.phoneLabel')}
            value={t('helpSupport.phoneNumber')}
            onPress={() => Linking.openURL(`tel:${t('helpSupport.phoneNumber').replace(/\s|-/g, '')}`)}
            colors={colors}
          />
          <View style={[styles.divider, { backgroundColor: colors.border.light }]} />
          <ContactRow
            icon="mail-outline"
            label={t('helpSupport.emailLabel')}
            value={t('helpSupport.emailAddress')}
            onPress={() => Linking.openURL(`mailto:${t('helpSupport.emailAddress')}`)}
            colors={colors}
          />
          <View style={[styles.divider, { backgroundColor: colors.border.light }]} />
          <View style={styles.hoursRow}>
            <View style={[styles.contactIcon, { backgroundColor: colors.opacity.background.primary }]}>
              <Ionicons name="time-outline" size={20} color={colors.iconAccent} />
            </View>
            <View style={styles.contactText}>
              <Text style={[styles.contactLabel, { color: colors.text.secondary }]}>{t('helpSupport.hoursLabel')}</Text>
              <Text style={[styles.hoursValue, { color: colors.text.primary }]}>{t('helpSupport.hoursText')}</Text>
            </View>
          </View>
        </View>

        <Text style={[styles.sectionHeader, { color: colors.text.secondary }]}>{t('helpSupport.faqTitle')}</Text>

        <View style={[styles.card, colors.elevation.sm, { backgroundColor: colors.surface }]}>
          {faqs.map(({ q, a }, i) => (
            <React.Fragment key={i}>
              {i > 0 && <View style={[styles.divider, { backgroundColor: colors.border.light }]} />}
              <FaqItem question={q} answer={a} colors={colors} />
            </React.Fragment>
          ))}
        </View>

        <View style={styles.bottomSpacing} />
      </ScrollView>
    </ScreenLayout>
  );
};

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxxl,
    // Reading column: unbounded this ran ~115 characters a line on a 10" tablet.
    ...(isTablet ? { maxWidth: 680, alignSelf: 'center', width: '100%' } : {}),
  },

  card: { borderRadius: radius.xl, padding: spacing.lg, },
  contactRow: { flexDirection: 'row', alignItems: 'center', minHeight: 44, paddingVertical: spacing.sm },
  hoursRow: { flexDirection: 'row', alignItems: 'center', minHeight: 44, paddingVertical: spacing.sm },
  contactIcon: { width: 36, height: 36, borderRadius: radius.full, justifyContent: 'center', alignItems: 'center', marginRight: spacing.md },
  contactText: { flex: 1 },
  contactLabel: { ...typography.styles.small, marginBottom: spacing.xxs },
  contactValue: { ...typography.styles.bodyMedium },
  hoursValue: { ...typography.styles.body },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: spacing.xs },
  sectionHeader: { ...typography.styles.label, paddingHorizontal: spacing.xs },
  faqItem: { paddingVertical: spacing.sm },
  faqQ: { ...typography.styles.label, marginBottom: spacing.xs },
  faqA: { ...typography.styles.body },
  bottomSpacing: { height: spacing.xl },
});

export default HelpSupportScreen;

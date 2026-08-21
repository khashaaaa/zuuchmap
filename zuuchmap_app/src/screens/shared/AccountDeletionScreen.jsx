import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { ScreenLayout } from '../../components';
import { spacing, typography, radius, interactions } from '../../design/theme';
import { useAppTheme } from '../../hooks/useAppTheme';
import { hideErrorModal, showErrorModal, showWarningModal } from '../../utils/errorManager';
import userService from '../../services/api/userService';
import { logger } from '../../utils/logger';

const AccountDeletionScreen = ({ navigation }) => {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const [deleting, setDeleting] = useState(false);

  const handleDelete = () => {
    showWarningModal(
      t('accountDeletion.title'),
      t('common.irreversible'),
      [
        { text: t('common.cancel') },
        {
          text: t('accountDeletion.confirmBtn'),
          style: 'destructive',
          closeOnPress: false,
          onPress: () => {
            showErrorModal(
              t('common.confirm'),
              t('accountDeletion.warning'),
              [
                { text: t('common.back') },
                {
                  text: t('common.yes'),
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      hideErrorModal();
                      setDeleting(true);
                      await userService.deleteAccount();
                      await userService.logout(false);
                      navigation.reset({ index: 0, routes: [{ name: 'PhoneNumber' }] });
                    } catch (error) {
                      logger.error('Delete account error:', error);
                      setDeleting(false);
                      showErrorModal(t('common.error'), t('accountDeletion.error'));
                    }
                  },
                },
              ],
              'error'
            );
          },
        },
      ]
    );
  };

  return (
    <ScreenLayout title={t('accountDeletion.title')} showBack onBack={() => navigation.goBack()}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.warningCard, { backgroundColor: colors.danger + '15', borderColor: colors.danger + '40' }]}>
          <Ionicons name="warning-outline" size={22} color={colors.danger} style={styles.warningIcon} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.warningTitle, { color: colors.danger }]}>{t('accountDeletion.warningTitle')}</Text>
            <Text style={[styles.warningText, { color: colors.text.secondary }]}>{t('accountDeletion.warning')}</Text>
          </View>
        </View>

        <View style={[styles.card, colors.elevation.sm, { backgroundColor: colors.surface }]}>
          <Text style={[styles.sectionTitle, { color: colors.text.primary }]}>{t('accountDeletion.whatTitle')}</Text>
          <Text style={[styles.sectionText, { color: colors.text.secondary }]}>{t('accountDeletion.what')}</Text>
        </View>

        <View style={[styles.card, colors.elevation.sm, { backgroundColor: colors.surface }]}>
          <Text style={[styles.sectionTitle, { color: colors.text.primary }]}>{t('accountDeletion.howTitle')}</Text>
          <Text style={[styles.sectionText, { color: colors.text.secondary }]}>{t('accountDeletion.how')}</Text>
        </View>

        <TouchableOpacity
          style={[styles.deleteBtn, { backgroundColor: colors.danger }, deleting && styles.deleteBtnDisabled]}
          onPress={handleDelete}
          disabled={deleting}
          activeOpacity={interactions.activeOpacity}
        >
          {deleting ? (
            <ActivityIndicator size="small" color={colors.text.onColor} />
          ) : (
            <Ionicons name="trash-outline" size={18} color={colors.text.onColor} />
          )}
          <Text style={[styles.deleteBtnText, { color: colors.text.onColor }]}>{t('accountDeletion.confirmBtn')}</Text>
        </TouchableOpacity>
      </ScrollView>
    </ScreenLayout>
  );
};

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxxl },
  warningCard: { borderWidth: 1, borderRadius: radius.xl, padding: spacing.lg, flexDirection: 'row', gap: spacing.md },
  warningIcon: { marginTop: spacing.xxs },
  warningTitle: { ...typography.styles.labelStrong, marginBottom: spacing.xs },
  warningText: { ...typography.styles.caption, lineHeight: typography.sm * 1.5 },
  card: { borderRadius: radius.xl, padding: spacing.lg, },
  sectionTitle: { ...typography.styles.title, marginBottom: spacing.sm },
  sectionText: { ...typography.styles.caption, lineHeight: typography.sm * 1.6 },
  deleteBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.sm, padding: spacing.lg, borderRadius: radius.xl, marginTop: spacing.sm,
  },
  deleteBtnDisabled: { opacity: 0.6 },
  deleteBtnText: { ...typography.styles.bodyBold },
});

export default AccountDeletionScreen;

import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { ScreenLayout, Button } from '../../components';
import { spacing, typography, radius } from '../../design/theme';
import { useAppTheme } from '../../hooks/useAppTheme';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_CONFIG } from '../../config/api.config';
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
                      // PhoneNumber reads USER_INFO at mount — wipe the display
                      // keys before it mounts so the deleted account's welcome
                      // block can't appear. Then navigate BEFORE logout, so its
                      // deferred cache clear runs with the old screens unmounted.
                      await AsyncStorage.multiRemove([
                        API_CONFIG.STORAGE_KEYS.USER_INFO,
                        API_CONFIG.STORAGE_KEYS.PHONE_NUMBER,
                        API_CONFIG.STORAGE_KEYS.USER_TYPE,
                      ]);
                      navigation.reset({ index: 0, routes: [{ name: 'PhoneNumber' }] });
                      await userService.logout(false);
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
        <View style={[styles.warningCard, { backgroundColor: colors.opacity.background.danger, borderColor: colors.opacity.border.danger }]}>
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

        <Button
          title={t('accountDeletion.confirmBtn')}
          onPress={handleDelete}
          variant="danger"
          icon="trash-outline"
          loading={deleting}
          fullWidth
          style={styles.deleteBtn}
        />
      </ScrollView>
    </ScreenLayout>
  );
};

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxxl },
  warningCard: { borderWidth: 1, borderRadius: radius.xl, padding: spacing.lg, flexDirection: 'row', gap: spacing.md },
  warningIcon: { marginTop: spacing.xxs },
  warningTitle: { ...typography.styles.labelStrong, marginBottom: spacing.xs },
  warningText: { ...typography.styles.body },
  card: { borderRadius: radius.xl, padding: spacing.lg, },
  sectionTitle: { ...typography.styles.title, marginBottom: spacing.sm },
  sectionText: { ...typography.styles.body },
  deleteBtn: { marginTop: spacing.sm },
});

export default AccountDeletionScreen;

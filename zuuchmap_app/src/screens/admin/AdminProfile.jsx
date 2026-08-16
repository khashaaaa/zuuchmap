import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    Image,
    ScrollView,
    StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { spacing, typography, shadows, safeAreaHelpers, radius, interactions, isTablet, dimensions } from '../../design/theme';
import { useAppTheme } from '../../hooks/useAppTheme';
import { useTranslation } from 'react-i18next';
import userService from '../../services/api/userService';
import { saveUserInfo } from '../../services/api/authHelpers';
import { ScreenLayout, SettingsSection } from '../../components';
import { ProfileSection, ProfileActionRow } from '../../components';
import { DEFAULT_AVATAR_URL } from '../../config/app.config';
import { hideErrorModal, showErrorModal } from '../../utils/errorManager';
import { logger } from '../../utils/logger';

const AdminProfile = ({ navigation }) => {
    const insets = useSafeAreaInsets();
    const { colors, styles: gStyles } = useAppTheme();
    const { t } = useTranslation();
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [imageError, setImageError] = useState(false);

    const loadUserProfile = useCallback(async () => {
        try {
            setLoading(true);
            setImageError(false);
            const profile = await userService.getUserProfile();
            setUser(profile);
        } catch (error) {
            logger.error('AdminProfile load error:', error);
            showErrorModal(t('common.error'), t('profile.loadError'));
        } finally {
            setLoading(false);
        }
    }, [t]);

    useEffect(() => {
        loadUserProfile();
        const unsubscribe = navigation.addListener('focus', loadUserProfile);
        return unsubscribe;
    }, [navigation, loadUserProfile]);

    const handleLogout = useCallback(() => {
        showErrorModal(
            t('nav.logout'),
            t('common.confirm'),
            [
                { text: t('common.cancel') },
                {
                    text: t('nav.logout'),
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            hideErrorModal();
                            await saveUserInfo(user.phoneNumber, user.userType, {
                                name: user.name,
                                profilePicture: user.profilePicture,
                            });
                            await userService.logout(true);
                            navigation.reset({ index: 0, routes: [{ name: 'PhoneNumber' }] });
                        } catch (err) {
                            logger.error('Logout error:', err);
                        }
                    },
                },
            ],
            'warning'
        );
    }, [user, navigation, t]);

    if (loading) {
        return (
            <ScreenLayout
                title={t('nav.profile')}
                showBack={false}
                loading
                loadingMessage={t('profile.loading')}
            />
        );
    }

    if (!user) {
        return (
            <ScreenLayout
                title={t('nav.profile')}
                showBack={false}
                error
                errorTitle={t('common.error')}
                errorMessage={t('common.noData')}
                onRetry={loadUserProfile}
            />
        );
    }

    return (
        <ScreenLayout title={t('nav.profile')} showBack={false}>
            <ScrollView
                contentContainerStyle={[
                    styles.content,
                    gStyles.scrollViewContentWithBottomInset(safeAreaHelpers.getBottomSafeArea(insets) + dimensions.bottomTabHeight),
                ]}
                showsVerticalScrollIndicator={false}
            >
                <View style={styles.tabletCentering}>
                    <View style={[styles.profileCard, { backgroundColor: colors.surface }]}>
                        <Image
                            source={{ uri: imageError ? DEFAULT_AVATAR_URL : (user.profilePicture || DEFAULT_AVATAR_URL) }}
                            style={[styles.avatar, { borderColor: colors.border.light }]}
                            onError={() => setImageError(true)}
                        />
                        <View style={styles.profileInfo}>
                            <Text style={[styles.userName, { color: colors.text.inverse }]} numberOfLines={1}>
                                {user.name || t('common.user')}
                            </Text>
                            <View style={styles.phoneRow}>
                                <Ionicons name="call-outline" size={14} color={colors.primary} />
                                <Text style={[styles.userPhone, { color: colors.text.secondary }]}>
                                    +976 {user.phoneNumber}
                                </Text>
                            </View>
                            <View style={[styles.adminBadge, { backgroundColor: colors.opacity.background.warning }]}>
                                <Ionicons name="shield-checkmark-outline" size={13} color={colors.warning} />
                                <Text style={[styles.adminBadgeText, { color: colors.warning }]}>ADMIN</Text>
                            </View>
                        </View>
                        <TouchableOpacity
                            style={[styles.editBtn, { backgroundColor: colors.opacity.background.primary }]}
                            onPress={() => navigation.navigate('CustomerEditProfile', { profile: user })}
                            activeOpacity={interactions.activeOpacityLight}
                        >
                            <Ionicons name="create-outline" size={18} color={colors.primary} />
                        </TouchableOpacity>
                    </View>

                    <ProfileSection>
                        <ProfileActionRow
                            icon="heart-outline"
                            text={t('posts.savedTitle')}
                            onPress={() => navigation.navigate('CustomerLikeList')}
                        />
                        <ProfileActionRow
                            icon="help-circle-outline"
                            text={t('profile.helpSupport')}
                            onPress={() => navigation.navigate('HelpSupport')}
                        />
                        <ProfileActionRow
                            icon="shield-outline"
                            text={t('privacy.title')}
                            onPress={() => navigation.navigate('PrivacyPolicy')}
                        />
                        <ProfileActionRow
                            icon="document-text-outline"
                            text={t('terms.title')}
                            onPress={() => navigation.navigate('Terms')}
                        />
                        <ProfileActionRow
                            icon="information-circle-outline"
                            text={t('accountDeletion.title')}
                            onPress={() => navigation.navigate('AccountDeletion')}
                            isLast
                        />
                    </ProfileSection>

                    <ProfileSection>
                        <ProfileActionRow
                            icon="log-out-outline"
                            text={t('nav.logout')}
                            onPress={handleLogout}
                            isLast
                            variant="danger"
                        />
                    </ProfileSection>

                    <SettingsSection />
                </View>
            </ScrollView>
        </ScreenLayout>
    );
};

const styles = StyleSheet.create({
    content: { padding: spacing.lg },
    tabletCentering: {
        maxWidth: isTablet ? 600 : '100%',
        alignSelf: 'center',
        width: '100%',
    },
    profileCard: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: radius.card,
        padding: spacing.lg,
        marginBottom: spacing.lg,
        gap: spacing.md,
        ...shadows.small,
    },
    avatar: {
        width: 64,
        height: 64,
        borderRadius: radius.xxxl,
        borderWidth: 2,
    },
    profileInfo: { flex: 1 },
    userName: {
        fontSize: typography.md,
        fontWeight: '700',
        marginBottom: spacing.xs,
    },
    phoneRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
        marginBottom: spacing.xs,
    },
    userPhone: { fontSize: typography.sm },
    adminBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        gap: spacing.xs,
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.xs,
        borderRadius: radius.lg,
    },
    adminBadgeText: {
        fontSize: typography.xs,
        fontWeight: '700',
        letterSpacing: 0.5,
    },
    editBtn: {
        width: 36,
        height: 36,
        borderRadius: radius.lg,
        justifyContent: 'center',
        alignItems: 'center',
    },
});

export default AdminProfile;

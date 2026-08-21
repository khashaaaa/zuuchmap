import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    Image,
    TouchableOpacity,
    ScrollView,
    RefreshControl,
    ActionSheetIOS,
    Platform,
    Linking,
    StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { pickProfileImage, takeProfilePhoto } from '../../utils/imageUtils';
import { spacing, typography, safeAreaHelpers, radius, interactions, isTablet, dimensions } from '../../design/theme';
import { useAppTheme } from '../../hooks/useAppTheme';
import { useCountUp } from '../../hooks/useCountUp';
import { useTranslation } from 'react-i18next';
import userService from '../../services/api/userService';
import { saveUserInfo } from '../../services/api/authHelpers';
import { ScreenLayout, SettingsSection, PressableScale } from '../../components';
import { ProfileSection, ProfileInfoRow, ProfileActionRow } from '../../components';
import { ProfileBadge } from '../../components';
import { APP_CONFIG, DEFAULT_AVATAR_URL } from '../../config/app.config';
import { API_CONFIG } from '../../config/api.config';
import { hideErrorModal, showErrorModal, showInfoModal } from '../../utils/errorManager';
import { confirmLogout } from '../../utils/navigationUtils';
import { logger } from '../../utils/logger';

const ProviderProfile = ({ navigation }) => {
    const insets = useSafeAreaInsets();
    const { colors, isDark, styles: gStyles } = useAppTheme();
    const { t } = useTranslation();
    const [profile, setProfile] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [imageError, setImageError] = useState(false);
    const [companyImageError, setCompanyImageError] = useState(false);
    const [isUploadingImage, setIsUploadingImage] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const totalPostsDisplay = useCountUp(profile?.totalPosts || 0, !!profile);
    const activePostsDisplay = useCountUp(profile?.activePosts || 0, !!profile);

    useEffect(() => {
        loadProfile();

        const unsubscribe = navigation.addListener('focus', () => {
            loadProfile();
        });

        return unsubscribe;
    }, [navigation]);

    const loadProfile = async (showLoader = true) => {
        if (showLoader) setIsLoading(true);
        setImageError(false);
        setCompanyImageError(false);
        try {
            const [profileData, postsRes] = await Promise.all([
                userService.getUserProfile(),
                userService.getUserPosts().catch(() => null),
            ]);
            setProfile({
                ...profileData,
                totalPosts: postsRes?.data?.totalPosts ?? 0,
                activePosts: postsRes?.data?.activePosts ?? 0,
            });
        } catch (error) {
            logger.error('Profile loading error:', error);
            showErrorModal(t('common.error'), t('profile.saveError'));
        } finally {
            setIsLoading(false);
        }
    };

    const handleRefresh = async () => {
        setRefreshing(true);
        try { await loadProfile(false); } finally { setRefreshing(false); }
    };

    const handleImageError = () => setImageError(true);
    const handleCompanyImageError = () => setCompanyImageError(true);

    const showImagePickerOptions = () => {
        if (Platform.OS === 'ios') {
            ActionSheetIOS.showActionSheetWithOptions(
                { options: [t('common.edit'), t('common.cancel')], cancelButtonIndex: 1 },
                (i) => { if (i === 0) openImageLibrary(); }
            );
        } else {
            showInfoModal(
                t('common.edit'),
                t('common.details'),
                [
                    { text: t('common.edit'), onPress: openImageLibrary },
                    { text: t('common.cancel'), style: 'cancel' }
                ]
            );
        }
    };

    const openCamera = async () => {
        const uri = await takeProfilePhoto();
        if (uri) uploadProfileImage({ uri, type: 'image/jpeg', fileName: 'profile.jpg' });
    };

    const openImageLibrary = async () => {
        const uri = await pickProfileImage();
        if (uri) uploadProfileImage({ uri, type: 'image/jpeg', fileName: 'profile.jpg' });
    };

    const uploadProfileImage = async (imageAsset) => {
        setIsUploadingImage(true);
        try {
            const formData = new FormData();
            formData.append('profile_picture', {
                uri: imageAsset.uri,
                type: imageAsset.type || 'image/jpeg',
                name: imageAsset.fileName || 'profile.jpg',
            });
            const updatedProfile = await userService.updateProfileImage(formData);
            setProfile(prev => ({ ...prev, profilePicture: updatedProfile.profilePicture }));
            setImageError(false);
        } catch (error) {
            logger.error('Image upload error:', error);
            showErrorModal(t('common.error'), t('profile.saveError'));
        } finally {
            setIsUploadingImage(false);
        }
    };

    const handleEditProfile = () => navigation.navigate('ProviderEditProfile', { profile });
    const handleCompanyDetails = () => navigation.navigate('ProviderCompany', { companyId: profile.companyId });
    const handleCreateCompany = () => navigation.navigate('ProviderCompanyCreate');

    const handleLogout = () => confirmLogout({
        t, navigation,
        phoneNumber: profile.phoneNumber,
        userType: profile.userType,
        name: profile.name,
        profilePicture: profile.profilePicture,
    });

    if (isLoading) {
        return (
            <ScreenLayout
                title={t('profile.title')}
                showBack={false}
                loading
                loadingMessage={t('profile.loading')}
            />
        );
    }

    if (!profile) {
        return (
            <ScreenLayout
                title={t('profile.title')}
                showBack={false}
                error
                errorTitle={t('common.error')}
                errorMessage={t('common.noData')}
                onRetry={loadProfile}
            />
        );
    }

    return (
        <ScreenLayout
            title={t('profile.title')}
            showBack={false}
        >
            <ScrollView
                contentContainerStyle={[
                    styles.scrollContent,
                    gStyles.scrollViewContentWithBottomInset(
                        safeAreaHelpers.getBottomSafeArea(insets) + dimensions.bottomTabHeight
                    )
                ]}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} colors={[colors.primary]} />
                }
                showsVerticalScrollIndicator={false}
            >
                <View style={styles.tabletCentering}>
                <View style={styles.profileHeader}>
                    <View style={[styles.profileCard, colors.elevation.md, { backgroundColor: colors.surface }]}>
                        <View style={styles.profileImageContainer}>
                            <Image
                                source={{
                                    uri: imageError
                                        ? DEFAULT_AVATAR_URL
                                        : (profile.profilePicture || DEFAULT_AVATAR_URL)
                                }}
                                style={[styles.profileImage, { backgroundColor: colors.border.light, borderColor: colors.surface }]}
                                onError={handleImageError}
                            />
                        </View>

                        <View style={styles.profileInfo}>
                            <Text style={[styles.profileName, { color: colors.text.primary }]}>{profile.name}</Text>
                            <View style={styles.phoneContainer}>
                                <Ionicons name="call-outline" size={16} color={colors.primary} />
                                <Text style={[styles.profilePhone, { color: colors.text.secondary }]}>{profile.phoneNumber}</Text>
                            </View>
                            <ProfileBadge type="provider" />
                        </View>

                        <TouchableOpacity
                            style={[styles.editButton, { backgroundColor: colors.opacity.background.primary }]}
                            onPress={handleEditProfile}
                            activeOpacity={interactions.activeOpacityLight}
                            hitSlop={interactions.hitSlop}
                        >
                            <Ionicons name="create-outline" size={18} color={colors.primary} />
                        </TouchableOpacity>
                    </View>
                </View>

                <View style={styles.companySection}>
                    {profile.companyId ? (
                        <PressableScale style={[styles.companyCard, colors.elevation.sm, { backgroundColor: colors.surface }]} onPress={handleCompanyDetails} accessibilityRole="button">
                            <View style={styles.companyHeader}>
                                {profile.companyLogo && !companyImageError ? (
                                    <Image
                                        source={{ uri: profile.companyLogo }}
                                        style={[styles.companyLogo, { backgroundColor: colors.border.light }]}
                                        onError={handleCompanyImageError}
                                    />
                                ) : (
                                    <View style={[styles.companyIconContainer, { backgroundColor: colors.opacity.background.primary }]}>
                                        <Ionicons name="business-outline" size={24} color={colors.primary} />
                                    </View>
                                )}
                                <View style={styles.companyInfo}>
                                    <Text style={[styles.companyName, { color: colors.text.primary }]}>
                                        {profile.companyName || t('company.title')}
                                    </Text>
                                    <Text style={[styles.companySubtitle, { color: colors.text.secondary }]}>
                                        {t('company.viewDetails')}
                                    </Text>
                                </View>
                                <Ionicons name="chevron-forward" size={20} color={colors.primary} />
                            </View>
                        </PressableScale>
                    ) : (
                        <PressableScale
                            style={[styles.createCompanyCard, { backgroundColor: colors.opacity.background.success }]}
                            onPress={handleCreateCompany}
                            accessibilityRole="button"
                        >
                            <View style={styles.createCompanyIcon}>
                                <Ionicons name="add-circle-outline" size={32} color={colors.primary} />
                            </View>
                            <View style={styles.createCompanyInfo}>
                                <Text style={[styles.createCompanyTitle, { color: colors.success }]}>
                                    {t('company.createTitle')}
                                </Text>
                                <Text style={[styles.createCompanySubtitle, { color: colors.text.secondary }]}>
                                    {t('company.createDesc')}
                                </Text>
                            </View>
                            <Ionicons name="chevron-forward" size={20} color={colors.primary} />
                        </PressableScale>
                    )}
                </View>

                <View style={[styles.statsSection, colors.elevation.md, { backgroundColor: colors.surface }]}>
                    <View style={styles.statItem}>
                        <View style={[styles.statIconContainer, { backgroundColor: colors.opacity.background.primary }]}>
                            <Ionicons name="document-outline" size={20} color={colors.primary} />
                        </View>
                        <Text style={[styles.statValue, { color: colors.text.primary }]}>{totalPostsDisplay}</Text>
                        <Text style={[styles.statLabel, { color: colors.text.secondary }]}>{t('profile.totalPosts')}</Text>
                    </View>

                    <View style={styles.statItem}>
                        <View style={[styles.statIconContainer, { backgroundColor: colors.opacity.background.primary }]}>
                            <Ionicons name="pulse-outline" size={20} color={colors.primary} />
                        </View>
                        <Text style={[styles.statValue, { color: colors.text.primary }]}>{activePostsDisplay}</Text>
                        <Text style={[styles.statLabel, { color: colors.text.secondary }]}>{t('profile.activePosts')}</Text>
                    </View>

                    <View style={styles.statItem}>
                        <View style={[styles.statIconContainer, { backgroundColor: colors.opacity.background.primary }]}>
                            <Ionicons name="calendar-outline" size={18} color={colors.primary} />
                        </View>
                        <Text style={[styles.statValue, { color: colors.text.primary }]}>{profile.memberSince || '2024'}</Text>
                        <Text style={[styles.statLabel, { color: colors.text.secondary }]}>{t('profile.memberSince')}</Text>
                    </View>
                </View>

                <ProfileSection>
                    <ProfileActionRow
                        icon="calendar-outline"
                        text={t('booking.receivedBookings')}
                        onPress={() => navigation.navigate('BookingList', { role: 'provider' })}
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

                <View style={styles.bottomSpacing} />
                </View>{/* end tabletCentering */}
            </ScrollView>
        </ScreenLayout>
    );
};

const styles = StyleSheet.create({
    scrollContent: { padding: spacing.lg },
    tabletCentering: {
        maxWidth: isTablet ? 700 : '100%',
        alignSelf: 'center',
        width: '100%',
    },
    profileHeader: { marginBottom: spacing.xl },
    profileCard: {
        borderRadius: radius.xxl,
        padding: spacing.xl,
        flexDirection: 'row',
        alignItems: 'center',
    },
    profileImageContainer: { position: 'relative', marginRight: spacing.lg },
    profileImage: { width: isTablet ? 110 : 80, height: isTablet ? 110 : 80, borderRadius: radius.pill, borderWidth: 3 },
    profileInfo: { flex: 1 },
    profileName: { ...typography.styles.h3, marginBottom: spacing.xs },
    phoneContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
    profilePhone: { ...typography.styles.caption, marginLeft: spacing.xs },
    editButton: { width: 36, height: 36, borderRadius: radius.xl, justifyContent: 'center', alignItems: 'center' },
    companySection: { marginBottom: spacing.xl },
    companyCard: {
        borderRadius: radius.card,
        padding: spacing.lg,
    },
    companyHeader: { flexDirection: 'row', alignItems: 'center' },
    companyLogo: { width: 48, height: 48, borderRadius: radius.lg, marginRight: spacing.md },
    companyIconContainer: {
        width: 48, height: 48, borderRadius: radius.lg,
        justifyContent: 'center', alignItems: 'center', marginRight: spacing.md,
    },
    companyInfo: { flex: 1 },
    companyName: { ...typography.styles.title, marginBottom: spacing.xs },
    companySubtitle: { ...typography.styles.caption },
    createCompanyCard: {
        borderRadius: radius.card,
        padding: spacing.lg,
        flexDirection: 'row',
        alignItems: 'center',
    },
    createCompanyIcon: { marginRight: spacing.md },
    createCompanyInfo: { flex: 1 },
    createCompanyTitle: { ...typography.styles.bodyBold, marginBottom: spacing.xs },
    createCompanySubtitle: { ...typography.styles.caption },
    statsSection: {
        flexDirection: 'row',
        borderRadius: radius.xxl,
        padding: spacing.lg,
        marginBottom: spacing.xl,
    },
    statItem: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    statIconContainer: {
        width: 36, height: 36, borderRadius: radius.xl,
        justifyContent: 'center', alignItems: 'center', marginBottom: spacing.sm,
    },
    statValue: { ...typography.styles.h2, marginBottom: spacing.xs, fontVariant: ['tabular-nums'] },
    statLabel: { ...typography.styles.small, textAlign: 'center' },
    bottomSpacing: { height: spacing.xxxl * 3 },
});

export default ProviderProfile;

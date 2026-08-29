import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
    View,
    Text,
    Image,
    TouchableOpacity,
    ScrollView,
    RefreshControl,
    StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { spacing, typography, safeAreaHelpers, radius, interactions, isTablet, dimensions } from '../../design/theme';
import { useAppTheme } from '../../hooks/useAppTheme';
import { useTranslation } from 'react-i18next';
import userService from '../../services/api/userService';
import { useProfile } from '../../hooks/useProfile';
import { ScreenLayout, SettingsSection, PressableScale, StatTile, FadeSlideIn } from '../../components';
import { ProfileSection, ProfileActionRow } from '../../components';
import { ProfileBadge } from '../../components';
import { DEFAULT_AVATAR_URL } from '../../config/app.config';
import { showErrorModal, isPostLogoutStraggler } from '../../utils/errorManager';
import { confirmLogout } from '../../utils/navigationUtils';
import { logger } from '../../utils/logger';

const ProviderProfile = ({ navigation }) => {
    const insets = useSafeAreaInsets();
    const { colors, styles: gStyles } = useAppTheme();
    const { t } = useTranslation();
    const [imageError, setImageError] = useState(false);
    const [companyImageError, setCompanyImageError] = useState(false);

    const { data: profileData = null, isLoading, isRefetching, refetch: refetchProfile, error: profileError } = useProfile();
    const { data: postsRes, refetch: refetchPosts, isRefetching: isRefetchingPosts } = useQuery({
        queryKey: ['posts', 'mine', 'summary'],
        queryFn: () => userService.getUserPosts().catch(() => null),
        staleTime: 60 * 1000,
    });

    const profile = profileData && {
        ...profileData,
        totalPosts: postsRes?.data?.totalPosts ?? 0,
        activePosts: postsRes?.data?.activePosts ?? 0,
    };

    useEffect(() => {
        // See CustomerProfile: a tokenless 401 here is the logout, not a fault.
        if (profileError && !isPostLogoutStraggler(profileError)) {
            logger.error('Profile loading error:', profileError);
            showErrorModal(t('common.error'), t('profile.saveError'));
        }
    }, [profileError]);

    useEffect(() => { setImageError(false); setCompanyImageError(false); }, [profileData?.profilePicture, profileData?.companyLogo]);

    const loadProfile = () => { refetchProfile(); refetchPosts(); };
    const refreshing = isRefetching || isRefetchingPosts;
    const handleRefresh = loadProfile;

    const handleImageError = () => setImageError(true);
    const handleCompanyImageError = () => setCompanyImageError(true);

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
                            <Text style={[styles.profileName, { color: colors.text.primary }]} numberOfLines={1}>{profile.name}</Text>
                            <View style={styles.phoneContainer}>
                                <Ionicons name="call-outline" size={16} color={colors.iconAccent} />
                                <Text style={[styles.profilePhone, { color: colors.text.secondary }]}>+976 {profile.phoneNumber}</Text>
                            </View>
                            <ProfileBadge type="provider" />
                        </View>

                        <TouchableOpacity
                            style={[styles.editButton, { backgroundColor: colors.opacity.background.primary }]}
                            onPress={handleEditProfile}
                            activeOpacity={interactions.activeOpacityLight}
                            hitSlop={interactions.hitSlop}
                            accessibilityRole="button"
                            accessibilityLabel={t('profile.editTitle')}
                        >
                            <Ionicons name="create-outline" size={18} color={colors.iconAccent} />
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
                                        <Ionicons name="business-outline" size={24} color={colors.iconAccent} />
                                    </View>
                                )}
                                <View style={styles.companyInfo}>
                                    <Text style={[styles.companyName, { color: colors.text.primary }]} numberOfLines={1}>
                                        {profile.companyName || t('company.title')}
                                    </Text>
                                    <Text style={[styles.companySubtitle, { color: colors.text.secondary }]}>
                                        {t('company.viewDetails')}
                                    </Text>
                                </View>
                                <Ionicons name="chevron-forward" size={20} color={colors.iconAccent} />
                            </View>
                        </PressableScale>
                    ) : (
                        <PressableScale
                            style={[styles.createCompanyCard, { backgroundColor: colors.opacity.background.success }]}
                            onPress={handleCreateCompany}
                            accessibilityRole="button"
                        >
                            <View style={styles.createCompanyIcon}>
                                <Ionicons name="add-circle-outline" size={32} color={colors.success} />
                            </View>
                            <View style={styles.createCompanyInfo}>
                                <Text style={[styles.createCompanyTitle, { color: colors.success }]}>
                                    {t('company.createTitle')}
                                </Text>
                                <Text style={[styles.createCompanySubtitle, { color: colors.text.secondary }]}>
                                    {t('company.createDesc')}
                                </Text>
                            </View>
                            <Ionicons name="chevron-forward" size={20} color={colors.success} />
                        </PressableScale>
                    )}
                </View>

                <FadeSlideIn index={0}>
                <View style={[styles.statsSection, colors.elevation.md, { backgroundColor: colors.surface }]}>
                    <StatTile
                        label={t('profile.totalPosts')}
                        value={profile?.totalPosts || 0}
                        icon="document-outline"
                        ready={!!profile}
                        style={styles.statItem}
                    />
                    <StatTile
                        label={t('profile.activePosts')}
                        value={profile?.activePosts || 0}
                        icon="pulse-outline"
                        ready={!!profile}
                        emphasis
                        style={styles.statItem}
                    />
                    <StatTile
                        label={t('profile.memberSince')}
                        value={profile.memberSince || '—'}
                        icon="calendar-outline"
                        style={styles.statItem}
                    />
                </View>
                </FadeSlideIn>

                <FadeSlideIn index={1}>
                <ProfileSection>
                    <ProfileActionRow
                        icon="calendar-outline"
                        text={t('booking.receivedBookings')}
                        onPress={() => navigation.navigate('BookingList', { role: 'provider' })}
                    />
                    <ProfileActionRow
                        icon="chatbubbles-outline"
                        text={t('messages.title')}
                        onPress={() => navigation.navigate('Messages')}
                    />
                    <ProfileActionRow
                        icon="card-outline"
                        text={t('billing.title')}
                        onPress={() => navigation.navigate('Billing')}
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
                </FadeSlideIn>

                <FadeSlideIn index={2}>
                <ProfileSection>
                    <ProfileActionRow
                        icon="log-out-outline"
                        text={t('nav.logout')}
                        onPress={handleLogout}
                        isLast
                        variant="danger"
                    />
                </ProfileSection>
                </FadeSlideIn>

                <SettingsSection />

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
    statItem: { flex: 1 },
});

export default ProviderProfile;

import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
    View,
    Text,
    TouchableOpacity,
    Image,
    ActivityIndicator,
    ScrollView,
    Linking,
    StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { spacing, typography, shadows, safeAreaHelpers, radius, interactions, isTablet, dimensions } from '../../design/theme';
import { useAppTheme } from '../../hooks/useAppTheme';
import { useTranslation } from 'react-i18next';
import userService from '../../services/api/userService';
import likeService from '../../services/api/likeService';
import { saveUserInfo } from '../../services/api/authHelpers';
import { ScreenLayout, SettingsSection } from '../../components';
import { ProfileSection, ProfileInfoRow, ProfileActionRow } from '../../components';
import { ProfileBadge } from '../../components';
import { APP_CONFIG, DEFAULT_AVATAR_URL } from '../../config/app.config';
import { API_CONFIG } from '../../config/api.config';
import { hideErrorModal, showErrorModal } from '../../utils/errorManager';
import { logger } from '../../utils/logger';

const CustomerProfile = ({ navigation }) => {
    const insets = useSafeAreaInsets();
    const { colors, styles: gStyles } = useAppTheme();
    const { t } = useTranslation();
    const [imageError, setImageError] = useState(false);

    const { data: user = null, isLoading: loading, refetch: refetchProfile, error: profileError } = useQuery({
        queryKey: ['profile', 'me'],
        queryFn: () => userService.getUserProfile(),
        staleTime: 60 * 1000,
    });

    const { data: liked_posts_count = 0, isLoading: loading_liked_count, refetch: refetchLikedCount } = useQuery({
        queryKey: ['liked', 'count'],
        queryFn: () => likeService.getLikedPostsCountSilently(),
        staleTime: 30 * 1000,
    });

    useEffect(() => {
        if (profileError) {
            logger.error('Profile load error:', profileError);
            showErrorModal(t('common.error'), t('profile.loadError'));
        }
    }, [profileError]);

    useEffect(() => {
        const unsubscribe = navigation.addListener('focus', () => {
            setImageError(false);
            refetchProfile();
            refetchLikedCount();
        });
        return unsubscribe;
    }, [navigation, refetchProfile, refetchLikedCount]);

    const handleImageError = () => {
        setImageError(true);
    };

    const handleLogout = async () => {
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
                                profilePicture: user.profilePicture
                            });
                            await userService.logout(true);
                            navigation.reset({ index: 0, routes: [{ name: 'PhoneNumber' }] });
                        } catch (error) {
                            logger.error('Logout error:', error);
                            showErrorModal(t('common.error'), t('common.error'));
                        }
                    }
                }
            ],
            'warning'
        );
    };

    if (loading) {
        return (
            <ScreenLayout
                title={t('profile.title')}
                showBack={false}
                loading
                loadingMessage={t('profile.loading')}
            />
        );
    }

    if (!user) {
        return (
            <ScreenLayout
                title={t('profile.title')}
                showBack={false}
                error
                errorTitle={t('common.error')}
                errorMessage={t('common.noData')}
                onRetry={loadUserProfile}
            />
        );
    }

    return (
        <ScreenLayout
            title={t('profile.title')}
            showBack={false}
        >
            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={[
                    styles.scrollContent,
                    gStyles.scrollViewContentWithBottomInset(
                        safeAreaHelpers.getBottomSafeArea(insets) + dimensions.bottomTabHeight
                    )
                ]}
                showsVerticalScrollIndicator={false}
            >
                <View style={styles.tabletCentering}>
                <View style={styles.profileHeader}>
                    <View style={[styles.profileCard, { backgroundColor: colors.surface }]}>
                        <View style={styles.avatarContainer}>
                            <Image
                                source={{
                                    uri: imageError ? DEFAULT_AVATAR_URL : (user?.profilePicture || DEFAULT_AVATAR_URL)
                                }}
                                style={[styles.avatar, { backgroundColor: colors.border.light, borderColor: colors.surface }]}
                                onError={handleImageError}
                            />
                        </View>

                        <View style={styles.profileInfo}>
                            <Text style={[styles.userName, { color: colors.text.inverse }]}>{user?.name || t('common.user')}</Text>
                            <View style={styles.phoneContainer}>
                                <Ionicons name="call-outline" size={16} color={colors.primary} />
                                <Text style={[styles.userPhone, { color: colors.text.secondary }]}>+976 {user?.phoneNumber}</Text>
                            </View>

                            <ProfileBadge type="customer" />
                        </View>

                        <TouchableOpacity
                            style={[styles.editButton, { backgroundColor: colors.opacity.background.primary }]}
                            onPress={() => navigation.navigate('CustomerEditProfile', { profile: user })}
                            activeOpacity={interactions.activeOpacityLight}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                            <Ionicons name="create-outline" size={18} color={colors.primary} />
                        </TouchableOpacity>
                    </View>
                </View>

                <View style={[styles.statsSection, { backgroundColor: colors.surface }]}>
                    <View style={styles.statItem}>
                        <View style={[styles.statIconContainer, { backgroundColor: colors.opacity.background.primary }]}>
                            <Ionicons name="eye-outline" size={20} color={colors.primary} />
                        </View>
                        <Text style={[styles.statValue, { color: colors.text.inverse }]}>{user?.totalViews || 0}</Text>
                        <Text style={[styles.statLabel, { color: colors.text.secondary }]}>{t('posts.views', { count: '' }).replace(' ', '')}</Text>
                    </View>

                    <TouchableOpacity
                        style={styles.statItem}
                        onPress={() => navigation.navigate('CustomerLikeList')}
                        activeOpacity={interactions.activeOpacityLight}
                    >
                        <View style={[styles.statIconContainer, { backgroundColor: colors.opacity.background.primary }]}>
                            <Ionicons name="heart-outline" size={20} color={colors.primary} />
                        </View>
                        {loading_liked_count ? (
                            <ActivityIndicator size="small" color={colors.primary} />
                        ) : (
                            <Text style={[styles.statValue, { color: colors.text.inverse }]}>
                                {liked_posts_count}
                            </Text>
                        )}
                        <Text style={[styles.statLabel, { color: colors.text.secondary }]}>{t('nav.saved')}</Text>
                    </TouchableOpacity>

                    <View style={styles.statItem}>
                        <View style={[styles.statIconContainer, { backgroundColor: colors.opacity.background.primary }]}>
                            <Ionicons name="calendar-outline" size={20} color={colors.primary} />
                        </View>
                        <Text style={[styles.statValue, { color: colors.text.inverse }]}>{user?.memberSince || '2024'}</Text>
                        <Text style={[styles.statLabel, { color: colors.text.secondary }]}>{t('profile.title')}</Text>
                    </View>
                </View>

                <ProfileSection>
                    <ProfileActionRow
                        icon="calendar-outline"
                        text={t('booking.myBookings')}
                        onPress={() => navigation.navigate('BookingList', { role: 'customer' })}
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
    scrollView: { flex: 1 },
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
        ...shadows.medium,
    },
    avatarContainer: { position: 'relative', marginRight: spacing.lg },
    avatar: { width: isTablet ? 110 : 80, height: isTablet ? 110 : 80, borderRadius: radius.pill, borderWidth: 3 },
    profileInfo: { flex: 1 },
    userName: { fontSize: typography.lg, fontWeight: 'bold', marginBottom: spacing.xs },
    phoneContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
    userPhone: { fontSize: typography.sm, marginLeft: spacing.xs },
    editButton: { width: 36, height: 36, borderRadius: radius.xl, justifyContent: 'center', alignItems: 'center' },
    statsSection: {
        flexDirection: 'row',
        borderRadius: radius.xxl,
        padding: spacing.lg,
        marginBottom: spacing.xl,
        ...shadows.medium,
    },
    statItem: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    statIconContainer: {
        width: 40, height: 40, borderRadius: radius.xxl,
        justifyContent: 'center', alignItems: 'center', marginBottom: spacing.sm,
    },
    statValue: { fontSize: typography.xl, fontWeight: '600', marginBottom: spacing.xs },
    statLabel: { fontSize: typography.xs, textAlign: 'center' },
    bottomSpacing: { height: spacing.xxxl * 3 },
});

export default CustomerProfile;
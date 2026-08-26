import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
    View,
    Text,
    TouchableOpacity,
    Image,
    ActivityIndicator,
    ScrollView,
    RefreshControl,
    StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { spacing, typography, safeAreaHelpers, radius, interactions, isTablet, dimensions } from '../../design/theme';
import { useAppTheme } from '../../hooks/useAppTheme';
import { useCountUp } from '../../hooks/useCountUp';
import { useTranslation } from 'react-i18next';
import userService from '../../services/api/userService';
import likeService from '../../services/api/likeService';
import { ScreenLayout, SettingsSection, PressableScale, FadeSlideIn } from '../../components';
import { ProfileSection, ProfileActionRow } from '../../components';
import { ProfileBadge } from '../../components';
import { DEFAULT_AVATAR_URL } from '../../config/app.config';
import { showErrorModal, isPostLogoutStraggler } from '../../utils/errorManager';
import { confirmLogout } from '../../utils/navigationUtils';
import { logger } from '../../utils/logger';

const CustomerProfile = ({ navigation }) => {
    const insets = useSafeAreaInsets();
    const { colors, styles: gStyles } = useAppTheme();
    const { t } = useTranslation();
    const [imageError, setImageError] = useState(false);

    const { data: user = null, isLoading: loading, isRefetching: refreshingProfile, refetch: refetchProfile, error: profileError } = useQuery({
        queryKey: ['profile', 'me'],
        queryFn: () => userService.getUserProfile(),
        staleTime: 60 * 1000,
    });

    const { data: liked_posts_count = 0, isLoading: loading_liked_count, refetch: refetchLikedCount } = useQuery({
        queryKey: ['liked', 'count'],
        queryFn: () => likeService.getLikedPostsCountSilently(),
        staleTime: 30 * 1000,
    });

    const likedCountDisplay = useCountUp(liked_posts_count, !loading_liked_count);

    useEffect(() => {
        // Logging out leaves this query observed for a beat, so it refetches
        // without a token and 401s. That is the logout working, not a failure
        // to report at someone on their way to the login screen.
        if (profileError && !isPostLogoutStraggler(profileError)) {
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

    const handleLogout = () => confirmLogout({
        t, navigation,
        phoneNumber: user.phoneNumber,
        userType: user.userType,
        name: user.name,
        profilePicture: user.profilePicture,
    });

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
                onRetry={refetchProfile}
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
                refreshControl={
                    <RefreshControl
                        refreshing={refreshingProfile}
                        onRefresh={() => { refetchProfile(); refetchLikedCount(); }}
                        tintColor={colors.primary}
                        colors={[colors.primary]}
                    />
                }
                showsVerticalScrollIndicator={false}
            >
                <View style={styles.tabletCentering}>
                <View style={styles.profileHeader}>
                    <View style={[styles.profileCard, colors.elevation.md, { backgroundColor: colors.surface }]}>
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
                            <Text style={[styles.userName, { color: colors.text.primary }]} numberOfLines={1}>{user?.name || t('common.user')}</Text>
                            <View style={styles.phoneContainer}>
                                <Ionicons name="call-outline" size={16} color={colors.iconAccent} />
                                <Text style={[styles.userPhone, { color: colors.text.secondary }]}>+976 {user?.phoneNumber}</Text>
                            </View>

                            <ProfileBadge type="customer" />
                        </View>

                        <TouchableOpacity
                            style={[styles.editButton, { backgroundColor: colors.opacity.background.primary }]}
                            onPress={() => navigation.navigate('CustomerEditProfile', { profile: user })}
                            accessibilityRole="button"
                            accessibilityLabel={t('common.edit')}
                            activeOpacity={interactions.activeOpacityLight}
                            hitSlop={interactions.hitSlop}
                        >
                            <Ionicons name="create-outline" size={18} color={colors.iconAccent} />
                        </TouchableOpacity>
                    </View>
                </View>

                <FadeSlideIn index={0}>
                <View style={[styles.statsSection, colors.elevation.md, { backgroundColor: colors.surface }]}>
                    <PressableScale
                        style={styles.statItem}
                        onPress={() => navigation.navigate('CustomerLikeList')}
                        accessibilityRole="button"
                    >
                        <View style={[styles.statIconContainer, { backgroundColor: colors.opacity.background.primary }]}>
                            <Ionicons name="heart-outline" size={20} color={colors.iconAccent} />
                        </View>
                        {loading_liked_count ? (
                            <ActivityIndicator size="small" color={colors.iconAccent} />
                        ) : (
                            <Text style={[styles.statValue, { color: colors.text.primary }]}>
                                {likedCountDisplay}
                            </Text>
                        )}
                        <Text style={[styles.statLabel, { color: colors.text.secondary }]}>{t('nav.saved')}</Text>
                    </PressableScale>

                    <View style={styles.statItem}>
                        <View style={[styles.statIconContainer, { backgroundColor: colors.opacity.background.primary }]}>
                            <Ionicons name="calendar-outline" size={20} color={colors.iconAccent} />
                        </View>
                        <Text style={[styles.statValue, { color: colors.text.primary }]}>{user?.memberSince || '—'}</Text>
                        <Text style={[styles.statLabel, { color: colors.text.secondary }]}>{t('profile.memberSince')}</Text>
                    </View>
                </View>
                </FadeSlideIn>

                <FadeSlideIn index={1}>
                <ProfileSection>
                    <ProfileActionRow
                        icon="calendar-outline"
                        text={t('booking.myBookings')}
                        onPress={() => navigation.navigate('BookingList', { role: 'customer' })}
                    />
                    <ProfileActionRow
                        icon="chatbubbles-outline"
                        text={t('messages.title')}
                        onPress={() => navigation.navigate('Messages')}
                    />
                    <ProfileActionRow
                        icon="bookmark-outline"
                        text={t('savedSearch.title')}
                        onPress={() => navigation.navigate('SavedSearches')}
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
    },
    avatarContainer: { position: 'relative', marginRight: spacing.lg },
    avatar: { width: isTablet ? 110 : 80, height: isTablet ? 110 : 80, borderRadius: radius.pill, borderWidth: 3 },
    profileInfo: { flex: 1 },
    userName: { ...typography.styles.h3, marginBottom: spacing.xs },
    phoneContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
    userPhone: { ...typography.styles.caption, marginLeft: spacing.xs },
    editButton: { width: 36, height: 36, borderRadius: radius.xl, justifyContent: 'center', alignItems: 'center' },
    statsSection: {
        flexDirection: 'row',
        borderRadius: radius.xxl,
        padding: spacing.lg,
        marginBottom: spacing.xl,
    },
    statItem: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    statIconContainer: {
        width: 40, height: 40, borderRadius: radius.full,
        justifyContent: 'center', alignItems: 'center', marginBottom: spacing.sm,
    },
    statValue: { ...typography.styles.h2, marginBottom: spacing.xs, fontVariant: ['tabular-nums'] },
    statLabel: { ...typography.styles.small, textAlign: 'center' },
});

export default CustomerProfile;
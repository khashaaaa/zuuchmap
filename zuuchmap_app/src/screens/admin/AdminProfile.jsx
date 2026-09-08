import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    Image,
    ScrollView,
    RefreshControl,
    StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { spacing, typography, safeAreaHelpers, radius, interactions, isTablet, dimensions } from '../../design/theme';
import { useAppTheme } from '../../hooks/useAppTheme';
import { useTranslation } from 'react-i18next';
import { useProfile } from '../../hooks/useProfile';
import { ScreenLayout, SettingsSection, Avatar } from '../../components';
import { ProfileSection, ProfileActionRow, ProfileBadge } from '../../components';
import { showErrorModal, isPostLogoutStraggler } from '../../utils/errorManager';
import { confirmLogout } from '../../utils/navigationUtils';
import { logger } from '../../utils/logger';

const AdminProfile = ({ navigation }) => {
    const insets = useSafeAreaInsets();
    const { colors, styles: gStyles } = useAppTheme();
    const { t } = useTranslation();

    const { data: user = null, isLoading: loading, isRefetching: refreshing, refetch: loadUserProfile, error: profileError } = useProfile();

    useEffect(() => {
        // See CustomerProfile: a tokenless 401 here is the logout, not a fault.
        if (profileError && !isPostLogoutStraggler(profileError)) {
            logger.error('AdminProfile load error:', profileError);
            showErrorModal(t('common.error'), t('profile.loadError'));
        }
    }, [profileError]);


    const handleRefresh = loadUserProfile;

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
                onRetry={loadUserProfile}
            />
        );
    }

    return (
        <ScreenLayout title={t('profile.title')} showBack={false}>
            <ScrollView
                contentContainerStyle={[
                    styles.content,
                    gStyles.scrollViewContentWithBottomInset(safeAreaHelpers.getBottomSafeArea(insets) + dimensions.bottomTabHeight),
                ]}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} colors={[colors.primary]} />
                }
                showsVerticalScrollIndicator={false}
            >
                <View style={styles.tabletCentering}>
                    <View style={[styles.profileCard, colors.elevation.sm, { backgroundColor: colors.surface }]}>
                        <Avatar
                            uri={user.profilePicture}
                            size={64}
                            style={[styles.avatar, { borderColor: colors.border.light }]}
                        />
                        <View style={styles.profileInfo}>
                            <Text style={[styles.userName, { color: colors.text.primary }]} numberOfLines={1}>
                                {user.name || t('common.user')}
                            </Text>
                            <View style={styles.phoneRow}>
                                <Ionicons name="call-outline" size={14} color={colors.iconAccent} />
                                <Text style={[styles.userPhone, { color: colors.text.secondary }]}>
                                    +976 {user.phoneNumber}
                                </Text>
                            </View>
                            <ProfileBadge type="admin" />
                        </View>
                        <TouchableOpacity
                            style={[styles.editBtn, { backgroundColor: colors.opacity.background.primary }]}
                            onPress={() => navigation.navigate('CustomerEditProfile', { profile: user })}
                            accessibilityRole="button"
                            accessibilityLabel={t('common.edit')}
                            activeOpacity={interactions.activeOpacityLight}
                            hitSlop={interactions.hitSlop}
                        >
                            <Ionicons name="create-outline" size={18} color={colors.iconAccent} />
                        </TouchableOpacity>
                    </View>

                    <ProfileSection>
                        <ProfileActionRow
                            icon="heart-outline"
                            text={t('posts.savedTitle')}
                            onPress={() => navigation.navigate('CustomerLikeList')}
                        />
                        {/* Account administration and the analytics summary.
                            Rows rather than tabs: both are look-ups, not queues
                            you return to, and a sixth tab would not fit a phone
                            bar. Until now neither existed on mobile at all. */}
                        <ProfileActionRow
                            icon="people-outline"
                            text={t('admin.users')}
                            onPress={() => navigation.navigate('AdminUsers')}
                        />
                        <ProfileActionRow
                            icon="bar-chart-outline"
                            text={t('analytics.title')}
                            onPress={() => navigation.navigate('AdminAnalytics')}
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
                            icon="person-remove-outline"
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
    },
    avatar: {
        width: 64,
        height: 64,
        // radius.avatar, not a mid-scale value: Android chamfers the *border*
        // into straight 45° cuts when the radius sits between a rounded rect
        // and half the box (24 on 64 was 37%), so the ring rendered as an
        // octagon around a correctly-rounded fill. At >= half, it clamps to a
        // circle and the border follows it — which is also what the customer
        // and provider avatars already do.
        borderRadius: radius.avatar,
        borderWidth: 2,
    },
    profileInfo: { flex: 1 },
    userName: {
        ...typography.styles.title,
        marginBottom: spacing.xs,
    },
    phoneRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
        marginBottom: spacing.xs,
    },
    userPhone: { ...typography.styles.caption },
    editBtn: {
        width: 36,
        height: 36,
        borderRadius: radius.lg,
        justifyContent: 'center',
        alignItems: 'center',
    },
});

export default AdminProfile;

import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StatusBar,
    StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { spacing, typography, radius, interactions, isTablet } from '../../design/theme';
import { useAppTheme } from '../../hooks/useAppTheme';
import { useAppContext } from '../../context/AppContext';
import { useTranslation } from 'react-i18next';
import userService from '../../services/api/userService';
import { getPhoneNumber, getAuthToken } from '../../services/api/authHelpers';
import { apiClient } from '../../services/api/apiClient';
import { API_CONFIG } from '../../config/api.config';
import { getErrorMessage, showErrorModal, showWarningModal } from '../../utils/errorManager';
import Button from '../../components/Button';
import ScreenLoading from '../../components/ScreenLoading';
import PressableScale from '../../components/PressableScale';
import FadeSlideIn from '../../components/FadeSlideIn';
import { useActiveCategorySchemas } from '../../hooks/useCategorySchemas';
import { logger } from '../../utils/logger';

const UserRoleSelection = ({ route, navigation }) => {
    const { phoneNumber: routePhoneNumber, userId, token: routeToken } = route.params || {};
    const [phoneNumber, setPhoneNumber] = useState(routePhoneNumber || '');
    const [token, setToken] = useState(routeToken || '');
    const [selectedRole, setSelectedRole] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isLoading, setIsLoading] = useState(!routePhoneNumber);

    const { colors, isDark } = useAppTheme();
    const { setThemeMode } = useAppContext();
    const { t } = useTranslation();
    // Categories are admin-editable, so the count in the copy has to come from
    // the schema list rather than being written into the sentence.
    const categoryCount = useActiveCategorySchemas().length;

    useEffect(() => {
        const getStoredData = async () => {
            try {
                if (!phoneNumber) {
                    const storedPhone = await getPhoneNumber();
                    if (storedPhone) setPhoneNumber(storedPhone);

                    if (!token) {
                        const storedToken = await getAuthToken();
                        if (storedToken) {
                            setToken(storedToken);
                            if (!phoneNumber && !storedPhone) {
                                try {
                                    const profileResponse = await apiClient.get(API_CONFIG.ENDPOINTS.USER.PROFILE, {
                                        headers: { 'Authorization': `Bearer ${storedToken}` }
                                    });
                                    if (profileResponse.data?.phone_number) {
                                        setPhoneNumber(profileResponse.data.phone_number);
                                    }
                                } catch (error) {
                                    logger.error('Error getting profile:', error);
                                }
                            }
                        }
                    }
                }
            } catch (error) {
                logger.error('Error getting stored data:', error);
            } finally {
                setIsLoading(false);
            }
        };

        if (!routePhoneNumber) getStoredData();
    }, [routePhoneNumber, phoneNumber, token]);

    const handleContinue = async () => {
        if (!selectedRole) {
            showWarningModal(t('common.confirm'), t('onboarding.subtitle'));
            return;
        }
        if (!phoneNumber) {
            showErrorModal(t('common.error'), t('common.phone'));
            return;
        }

        setIsSubmitting(true);
        try {
            const tokenToUse = token || await getAuthToken();
            await userService.setUserType(phoneNumber, selectedRole, tokenToUse, navigation);
        } catch (error) {
            showErrorModal(t('common.error'), getErrorMessage(error, t('common.error')));
        } finally {
            setIsSubmitting(false);
        }
    };

    const canGoBack = navigation.canGoBack();

    const backButton = canGoBack ? (
        <TouchableOpacity
            style={[styles.themeToggle, { backgroundColor: colors.opacity.background.primary }]}
            onPress={() => navigation.goBack()}
            activeOpacity={interactions.activeOpacityLight}
            hitSlop={interactions.hitSlop}
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
        >
            <Ionicons name="arrow-back" size={24} color={colors.iconAccent} />
        </TouchableOpacity>
    ) : <View />;

    if (isLoading) {
        return (
            <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
                <StatusBar backgroundColor={colors.surface} barStyle={isDark ? 'light-content' : 'dark-content'} />
                <View style={styles.loadingTopRow}>
                    {backButton}
                    <TouchableOpacity
                        style={[styles.themeToggle, { backgroundColor: colors.opacity.background.primary }]}
                        onPress={() => setThemeMode(isDark ? 'light' : 'dark')}
                        accessibilityRole="button"
                        accessibilityLabel={t('common.toggleTheme')}
                        activeOpacity={interactions.activeOpacityLight}
                        hitSlop={interactions.hitSlop}
                    >
                        <Ionicons name={isDark ? 'sunny-outline' : 'moon-outline'} size={20} color={colors.iconAccent} />
                    </TouchableOpacity>
                </View>
                <ScreenLoading />
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
            <StatusBar backgroundColor={colors.surface} barStyle={isDark ? 'light-content' : 'dark-content'} />
            <View style={styles.content}>
                <View style={styles.topRow}>
                    {backButton}
                    <TouchableOpacity
                        style={[styles.themeToggle, { backgroundColor: colors.opacity.background.primary }]}
                        onPress={() => setThemeMode(isDark ? 'light' : 'dark')}
                        accessibilityRole="button"
                        accessibilityLabel={t('common.toggleTheme')}
                        activeOpacity={interactions.activeOpacityLight}
                        hitSlop={interactions.hitSlop}
                    >
                        <Ionicons name={isDark ? 'sunny-outline' : 'moon-outline'} size={20} color={colors.iconAccent} />
                    </TouchableOpacity>
                </View>
                <FadeSlideIn index={0} style={styles.header}>
                    <Text style={[styles.title, { color: colors.text.primary }]}>{t('onboarding.title')}</Text>
                    <Text style={[styles.subtitle, { color: colors.text.secondary }]}>{t('onboarding.subtitle')}</Text>
                </FadeSlideIn>

                <View style={styles.optionsContainer}>
                    <FadeSlideIn index={1}>
                    <PressableScale
                        style={[
                            styles.optionCard,
                            { backgroundColor: colors.surface, borderColor: colors.border.light },
                            selectedRole === 'PROVIDER' && { borderColor: colors.primary, backgroundColor: colors.opacity.background.primary },
                        ]}
                        onPress={() => setSelectedRole('PROVIDER')}
                        pop
                        selected={selectedRole === 'PROVIDER'}
                        accessibilityRole="button"
                    >
                        <View style={styles.optionContent}>
                            <View style={styles.optionLeft}>
                                <View style={[
                                    styles.optionIcon,
                                    { backgroundColor: colors.opacity.background.primary },
                                    selectedRole === 'PROVIDER' && { backgroundColor: colors.primary },
                                ]}>
                                    <Ionicons
                                        name="business-outline"
                                        size={24}
                                        color={selectedRole === 'PROVIDER' ? colors.onPrimary : colors.primary}
                                    />
                                </View>
                                <View style={styles.optionTextContainer}>
                                    <Text style={[
                                        styles.optionEyebrow,
                                        { color: selectedRole === 'PROVIDER' ? colors.primary : colors.text.tertiary },
                                    ]}>
                                        {t('onboarding.providerEyebrow')}
                                    </Text>
                                    <Text style={[
                                        styles.optionTitle,
                                        { color: colors.text.primary },
                                        selectedRole === 'PROVIDER' && { color: colors.text.link },
                                    ]}>
                                        {t('onboarding.provider')}
                                    </Text>
                                    <Text style={[styles.optionDescription, { color: colors.text.secondary }]}>
                                        {t('onboarding.providerProof', { count: categoryCount })}
                                    </Text>
                                </View>
                            </View>
                            {selectedRole === 'PROVIDER' && (
                                <Ionicons name="checkmark-circle" size={20} color={colors.iconAccent} />
                            )}
                        </View>
                    </PressableScale>
                    </FadeSlideIn>

                    <FadeSlideIn index={2}>
                    <PressableScale
                        style={[
                            styles.optionCard,
                            { backgroundColor: colors.surface, borderColor: colors.border.light },
                            selectedRole === 'CUSTOMER' && { borderColor: colors.primary, backgroundColor: colors.opacity.background.primary },
                        ]}
                        onPress={() => setSelectedRole('CUSTOMER')}
                        pop
                        selected={selectedRole === 'CUSTOMER'}
                        accessibilityRole="button"
                    >
                        <View style={styles.optionContent}>
                            <View style={styles.optionLeft}>
                                <View style={[
                                    styles.optionIcon,
                                    { backgroundColor: colors.opacity.background.primary },
                                    selectedRole === 'CUSTOMER' && { backgroundColor: colors.primary },
                                ]}>
                                    <Ionicons
                                        name="person-outline"
                                        size={24}
                                        color={selectedRole === 'CUSTOMER' ? colors.onPrimary : colors.primary}
                                    />
                                </View>
                                <View style={styles.optionTextContainer}>
                                    <Text style={[
                                        styles.optionEyebrow,
                                        { color: selectedRole === 'CUSTOMER' ? colors.primary : colors.text.tertiary },
                                    ]}>
                                        {t('onboarding.customerEyebrow')}
                                    </Text>
                                    <Text style={[
                                        styles.optionTitle,
                                        { color: colors.text.primary },
                                        selectedRole === 'CUSTOMER' && { color: colors.text.link },
                                    ]}>
                                        {t('onboarding.customer')}
                                    </Text>
                                    <Text style={[styles.optionDescription, { color: colors.text.secondary }]}>
                                        {t('onboarding.customerProof')}
                                    </Text>
                                </View>
                            </View>
                            {selectedRole === 'CUSTOMER' && (
                                <Ionicons name="checkmark-circle" size={20} color={colors.iconAccent} />
                            )}
                        </View>
                    </PressableScale>
                    </FadeSlideIn>
                </View>

                <View style={styles.footer}>
                    <Button
                        title={isSubmitting ? t('common.saving') : t('onboarding.continue')}
                        onPress={handleContinue}
                        disabled={!selectedRole || isSubmitting}
                        loading={isSubmitting}
                        fullWidth
                    />
                </View>
            </View>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    safeArea: { flex: 1 },
    loadingTopRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: spacing.xxl,
        paddingTop: spacing.lg,
    },
    content: {
        flex: 1,
        paddingHorizontal: spacing.xxl,
        paddingTop: spacing.lg,
        // Two icon+line cards; the auth screens next to this one cap at 480.
        ...(isTablet ? { maxWidth: 560, alignSelf: 'center', width: '100%' } : {}),
    },

    topRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: spacing.lg,
    },
    themeToggle: {
        width: 36,
        height: 36,
        borderRadius: radius.full,
        justifyContent: 'center',
        alignItems: 'center',
    },
    header: {
        alignItems: 'center',
    },
    title: {
        ...typography.styles.display,
        marginTop: spacing.lg,
        marginBottom: spacing.sm,
        textAlign: 'center',
    },
    subtitle: {
        ...typography.styles.lead,
        textAlign: 'center',
        paddingHorizontal: spacing.sm,
    },
    optionsContainer: {
        flex: 1,
        gap: spacing.md,
        justifyContent: 'center',
    },
    optionCard: {
        borderWidth: 2,
        borderRadius: radius.lg,
        padding: spacing.lg,
        // Content-driven: a fixed 120 clips the description at the current
        // type scale (same failure the saved-post cards had).
        minHeight: 120,
        justifyContent: 'center',
    },
    optionContent: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    optionLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    optionIcon: {
        width: 48,
        height: 48,
        borderRadius: radius.full,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: spacing.md,
    },
    optionTextContainer: { flex: 1 },
    optionEyebrow: {
        ...typography.styles.overline,
        textTransform: 'uppercase',
        marginBottom: spacing.xxs,
    },
    optionTitle: {
        ...typography.styles.bodyBold,
        marginBottom: spacing.xs,
    },
    optionDescription: {
        ...typography.styles.caption,
    },
    footer: {
        gap: spacing.xxl,
        paddingBottom: spacing.xxl,
    },
});

export default UserRoleSelection;

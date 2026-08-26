import React, { useState, useEffect, useRef } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    KeyboardAvoidingView,
    Platform,
    StatusBar,
    StyleSheet,
    Image,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { spacing, typography, radius, interactions, isTablet } from '../../design/theme';
import { useAppTheme } from '../../hooks/useAppTheme';
import { useAppContext } from '../../context/AppContext';
import { useTranslation } from 'react-i18next';
import userService from '../../services/api/userService';
import { saveUserInfo, getUserInfo } from '../../services/api/authHelpers';
import { API_CONFIG } from '../../config/api.config';
import { getErrorMessage, showErrorModal } from '../../utils/errorManager';
import { logger } from '../../utils/logger';
import { track } from '../../services/analytics';
import Button from '../../components/Button';
import FadeSlideIn from '../../components/FadeSlideIn';
import { navigateToDashboard } from '../../utils/navigationUtils';

const PhoneNumber = ({ navigation }) => {
    const [phoneNumber, setPhoneNumber] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    // The identity confirmLogout keeps behind: name/photo/phone of the person
    // who signed out, shown as a "welcome back" block with the number prefilled
    // (a trusted device then signs them back in with one tap, no SMS).
    const [savedUser, setSavedUser] = useState(null);
    const inputRef = useRef(null);
    const { colors, isDark } = useAppTheme();
    const { setThemeMode } = useAppContext();
    const { t } = useTranslation();

    useEffect(() => {
        let mounted = true;
        getUserInfo()
            .then((info) => {
                if (!mounted) return;
                if (info?.phoneNumber && (info.name || info.profilePicture)) {
                    setSavedUser(info);
                    setPhoneNumber(info.phoneNumber);
                } else {
                    // Fresh visitor: open the keyboard for them. Returning users
                    // get the welcome block instead — their number is prefilled.
                    inputRef.current?.focus();
                }
            })
            .catch(() => {});
        return () => { mounted = false; };
    }, []);

    const handleDifferentAccount = async () => {
        setSavedUser(null);
        setPhoneNumber('');
        await AsyncStorage.multiRemove([
            API_CONFIG.STORAGE_KEYS.USER_INFO,
            API_CONFIG.STORAGE_KEYS.PHONE_NUMBER,
            API_CONFIG.STORAGE_KEYS.USER_TYPE,
        ]).catch(() => {});
        inputRef.current?.focus();
    };

    const validatePhoneNumber = (number) => {
        return /^\d{8}$/.test(number);
    };

    const goAfterAuth = async (phone, userType, isAdmin) => {
        if (userType) {
            await saveUserInfo(phone, userType);
            navigateToDashboard(navigation, userType, isAdmin);
        } else {
            navigation.navigate('UserRoleSelection', { phoneNumber: phone });
        }
    };

    const handleContinue = async () => {
        if (!validatePhoneNumber(phoneNumber)) {
            showErrorModal(t('common.validationError'), t('auth.phoneError'));
            return;
        }

        setIsLoading(true);
        track('auth.start');
        try {
            // No `/user/check` pre-flight. It answered "does this number have an
            // account, and what type" to an unauthenticated caller — an
            // enumeration oracle over an 8-digit number space that also handed
            // back the account UUID — and it was never needed: the account type
            // rides along on the verification result, which is the only source
            // that has actually proven anything about the caller.
            const session = await userService.startVerification(phoneNumber);

            // Device already proved this number on a previous session.
            if (session.verified) {
                track('auth.verified', { trusted_device: true });
                await goAfterAuth(phoneNumber, session.auth?.user?.type ?? null, session.auth?.user?.is_admin === true);
                return;
            }

            navigation.navigate('OtpVerification', { phoneNumber, session });
        } catch (error) {
            logger.error('Phone number verification error:', error);
            showErrorModal(t('common.error'), getErrorMessage(error, t('auth.sendError')));
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
            <StatusBar backgroundColor={colors.surface} barStyle={isDark ? 'light-content' : 'dark-content'} />
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.flex1}
            >
                <View style={styles.tabletCentering}>
            <View style={styles.content}>
                    <View style={styles.topRow}>
                        <View />
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
                    <FadeSlideIn style={styles.header}>
                        {savedUser?.profilePicture ? (
                            <Image
                                source={{ uri: savedUser.profilePicture }}
                                style={[styles.avatar, { backgroundColor: colors.opacity.background.primary }]}
                            />
                        ) : (
                            <View style={[styles.iconContainer, { backgroundColor: colors.opacity.background.primary }]}>
                                <Ionicons name={savedUser ? 'person-outline' : 'call-outline'} size={64} color={colors.iconAccent} />
                            </View>
                        )}
                        <Text style={[styles.title, { color: colors.text.primary }]}>
                            {savedUser ? t('auth.welcomeBack') : t('auth.phoneTitle')}
                        </Text>
                        <Text style={[styles.subtitle, { color: colors.text.secondary }]}>
                            {savedUser ? (savedUser.name || savedUser.phoneNumber) : t('auth.phoneSubtitle')}
                        </Text>
                    </FadeSlideIn>

                    <View style={styles.form}>
                        <View style={[styles.inputContainer, { backgroundColor: colors.surface, borderColor: colors.border.medium }]}>
                            <View style={[styles.prefixContainer, { backgroundColor: colors.background, borderRightColor: colors.border.medium }]}>
                                <Text style={[styles.prefix, { color: colors.text.primary }]}>{t('auth.phoneLabel')}</Text>
                            </View>
                            <TextInput
                                ref={inputRef}
                                style={[styles.input, { color: colors.text.primary }]}
                                value={phoneNumber}
                                onChangeText={setPhoneNumber}
                                placeholder={t('auth.phonePlaceholder')}
                                placeholderTextColor={colors.text.placeholder}
                                keyboardType="phone-pad"
                                maxLength={8}
                                returnKeyType="done"
                                onSubmitEditing={handleContinue}
                            />
                        </View>

                        <Button
                            title={isLoading ? t('auth.sending') : t('auth.continue')}
                            onPress={handleContinue}
                            disabled={isLoading || !validatePhoneNumber(phoneNumber)}
                            loading={isLoading}
                            fullWidth
                        />

                        {savedUser && (
                            <TouchableOpacity
                                onPress={handleDifferentAccount}
                                activeOpacity={interactions.activeOpacityLight}
                                hitSlop={interactions.hitSlop}
                            >
                                <Text style={[styles.differentAccount, { color: colors.text.link }]}>
                                    {t('auth.continueDifferent')}
                                </Text>
                            </TouchableOpacity>
                        )}
                    </View>

                </View>
            </View>{/* end tabletCentering */}
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1 },
    flex1: { flex: 1 },
    tabletCentering: {
        flex: 1,
        maxWidth: isTablet ? 480 : '100%',
        alignSelf: 'center',
        width: '100%',
    },
    content: {
        flex: 1,
        paddingHorizontal: spacing.xxl,
        paddingTop: spacing.lg,
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
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: spacing.xxxl,
    },
    iconContainer: {
        width: 120,
        height: 120,
        borderRadius: radius.pill,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: spacing.lg,
    },
    avatar: {
        width: 120,
        height: 120,
        borderRadius: radius.pill,
        marginBottom: spacing.lg,
    },
    differentAccount: {
        ...typography.styles.labelStrong,
        textAlign: 'center',
    },
    title: {
        ...typography.styles.h2,
        marginBottom: spacing.sm,
        textAlign: 'center',
    },
    subtitle: {
        ...typography.styles.body,
        textAlign: 'center',
    },
    form: {
        gap: spacing.xxl,
    },
    inputContainer: {
        flexDirection: 'row',
        borderWidth: 1,
        borderRadius: radius.input,
        overflow: 'hidden',
    },
    prefixContainer: {
        paddingHorizontal: spacing.lg,
        justifyContent: 'center',
        alignItems: 'center',
        borderRightWidth: 1,
    },
    prefix: {
        ...typography.styles.bodyBold,
    },
    input: {
        flex: 1,
        height: 52,
        ...typography.styles.body,
        lineHeight: undefined,
        paddingHorizontal: spacing.md,
    },
});

export default PhoneNumber;

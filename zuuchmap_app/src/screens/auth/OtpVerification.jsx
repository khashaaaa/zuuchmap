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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { spacing, typography, radius, interactions, isTablet } from '../../design/theme';
import { useAppTheme } from '../../hooks/useAppTheme';
import { useAppContext } from '../../context/AppContext';
import { useTranslation } from 'react-i18next';
import userService from '../../services/api/userService';
import { getDeviceInfo } from '../../utils/navigationUtils';
import { navigateToDashboard } from '../../utils/navigationUtils';
import { getErrorMessage, showErrorModal } from '../../utils/errorManager';
import { API_CONFIG } from '../../config/api.config';
import { logger } from '../../utils/logger';
import Button from '../../components/Button';

const OtpVerification = ({ route, navigation }) => {
    const {
        phoneNumber,
        userExists,
        isExistingUser,
        userType,
        skipToRoleSelection = false
    } = route.params || {};

    const [otp, setOtp] = useState(['', '', '', '', '', '']);
    const [timer, setTimer] = useState(60);
    const [isResending, setIsResending] = useState(false);
    const [isVerifying, setIsVerifying] = useState(false);

    const inputRefs = useRef([]);
    const { colors, isDark } = useAppTheme();
    const { setThemeMode } = useAppContext();
    const { t } = useTranslation();

    useEffect(() => {
        inputRefs.current = inputRefs.current.slice(0, 6);
        const timer = setTimeout(() => inputRefs.current[0]?.focus(), 300);
        return () => clearTimeout(timer);
    }, []);

    useEffect(() => {
        if (timer > 0) {
            const interval = setInterval(() => {
                setTimer(prev => prev - 1);
            }, 1000);
            return () => clearInterval(interval);
        }
    }, [timer]);

    const handleOtpChange = (text, index) => {
        const newOtp = [...otp];
        newOtp[index] = text;
        setOtp(newOtp);

        if (text.length === 1 && index < 5) {
            inputRefs.current[index + 1].focus();
        }
    };

    const handleKeyPress = (e, index) => {
        if (e.nativeEvent.key === 'Backspace' && index > 0 && otp[index] === '') {
            inputRefs.current[index - 1].focus();
        }
    };

    const handleResendOtp = async () => {
        setIsResending(true);
        try {
            await userService.sendOtp(phoneNumber);
            setTimer(60);
        } catch (error) {
            showErrorModal(t('common.error'), getErrorMessage(error, t('auth.codeSendError')));
        } finally {
            setIsResending(false);
        }
    };

    const handleVerifyOtp = async () => {
        const otpString = otp.join('');
        if (otpString.length !== 6) {
            showErrorModal(t('common.error'), t('auth.enterCode'));
            return;
        }

        setIsVerifying(true);
        try {
            const deviceInfo = getDeviceInfo();
            const response = await userService.verifyOtp(
                phoneNumber,
                otpString,
                null,
                deviceInfo
            );

            if (response.data && response.data.success) {
                const isAdmin = response.data.data?.is_admin === true;
                if (isExistingUser && userType) {
                    if (userType) {
                        const { saveUserInfo } = await import('../../services/api/authHelpers');
                        await saveUserInfo(phoneNumber, userType);
                    }
                    navigateToDashboard(navigation, userType, isAdmin);
                } else if (isExistingUser && skipToRoleSelection) {
                    navigation.navigate('UserRoleSelection', {
                        phoneNumber,
                        userId: response.data.data?.id,
                        token: response.data.data?.token
                    });
                } else {
                    navigation.navigate('UserRoleSelection', {
                        phoneNumber,
                        userId: response.data.data?.id,
                        token: response.data.data?.token,
                    });
                }
            }
        } catch (error) {
            logger.error('OTP verification error:', error);
            setOtp(['', '', '', '', '', '']);
            inputRefs.current[0]?.focus();
            const errorMessage = error?.response?.status === 400
                ? t('auth.wrongCode')
                : getErrorMessage(error, t('auth.wrongCode'));
            showErrorModal(t('common.error'), errorMessage);
        } finally {
            setIsVerifying(false);
        }
    };

    const isOtpComplete = otp.every(digit => digit !== '') && otp.join('').length === 6;

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
                        <TouchableOpacity
                            style={styles.backButton}
                            onPress={() => navigation.goBack()}
                            activeOpacity={interactions.activeOpacity}
                        >
                            <Ionicons name="arrow-back" size={24} color={colors.primary} />
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.themeToggle, { backgroundColor: colors.opacity.background.primary }]}
                            onPress={() => setThemeMode(isDark ? 'light' : 'dark')}
                            activeOpacity={interactions.activeOpacityLight}
                        >
                            <Ionicons name={isDark ? 'sunny-outline' : 'moon-outline'} size={20} color={colors.primary} />
                        </TouchableOpacity>
                    </View>

                    <View style={styles.header}>
                        <Ionicons name="shield-checkmark-outline" size={64} color={colors.primary} />
                        <Text style={[styles.title, { color: colors.text.primary }]}>
                            {t('auth.verifyTitle')}
                        </Text>
                        <Text style={[styles.subtitle, { color: colors.text.secondary }]}>
                            {t('auth.verifySubtitle', { phone: phoneNumber })}
                        </Text>
                        {isExistingUser && (
                            <View style={[styles.existingUserBadge, { backgroundColor: colors.opacity.background.success }]}>
                                <Ionicons name="checkmark-circle" size={16} color={colors.primary} />
                                <Text style={[styles.existingUserText, { color: colors.success }]}>
                                    {userType ? `${userType === 'PROVIDER' ? t('onboarding.provider') : t('onboarding.customer')}` : t('common.user')}
                                </Text>
                            </View>
                        )}
                    </View>

                    <View style={styles.form}>
                        <View style={styles.otpContainer}>
                            {otp.map((digit, index) => (
                                <TextInput
                                    key={index}
                                    ref={ref => inputRefs.current[index] = ref}
                                    style={[
                                        styles.otpInput,
                                        { borderColor: colors.border.medium, color: colors.text.inverse, backgroundColor: colors.surface },
                                        digit && { borderColor: colors.primary },
                                    ]}
                                    value={digit}
                                    onChangeText={text => handleOtpChange(text, index)}
                                    onKeyPress={e => handleKeyPress(e, index)}
                                    keyboardType="number-pad"
                                    maxLength={1}
                                    textAlign="center"
                                    textContentType="oneTimeCode"
                                    autoComplete="sms-otp"
                                />
                            ))}
                        </View>

                        <Button
                            title={isVerifying ? t('auth.verifying') : t('auth.verify')}
                            onPress={handleVerifyOtp}
                            disabled={!isOtpComplete || isVerifying}
                            loading={isVerifying}
                            fullWidth
                        />

                        <View style={styles.resendContainer}>
                            <Text style={[styles.resendText, { color: colors.text.secondary }]}>
                                {t('auth.enterCode')}{' '}
                            </Text>
                            {timer > 0 ? (
                                <Text style={[styles.timerText, { color: colors.text.secondary }]}>
                                    {t('auth.resendIn', { count: timer })}
                                </Text>
                            ) : (
                                <TouchableOpacity onPress={handleResendOtp} disabled={isResending} activeOpacity={interactions.activeOpacityLight}>
                                    <Text style={[styles.resendButton, { color: colors.primary }]}>
                                        {isResending ? t('auth.resending') : t('auth.resend')}
                                    </Text>
                                </TouchableOpacity>
                            )}
                        </View>
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
    backButton: {
        padding: spacing.sm,
    },
    themeToggle: {
        width: 36,
        height: 36,
        borderRadius: radius.xl,
        justifyContent: 'center',
        alignItems: 'center',
    },
    header: {
        alignItems: 'center',
        marginBottom: spacing.xxxl,
        flex: 1,
        justifyContent: 'center',
    },
    title: {
        fontSize: typography.xxl,
        fontWeight: 'bold',
        marginTop: spacing.lg,
        marginBottom: spacing.sm,
        textAlign: 'center',
    },
    subtitle: {
        fontSize: typography.md,
        textAlign: 'center',
        lineHeight: 22,
        marginBottom: spacing.md,
    },
    existingUserBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.xs,
        borderRadius: radius.card,
        gap: spacing.xs,
    },
    existingUserText: {
        fontSize: typography.sm,
        fontWeight: '600',
    },
    form: {
        gap: spacing.xxl,
        paddingBottom: spacing.xxl,
    },
    otpContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingHorizontal: spacing.sm,
    },
    otpInput: {
        width: 48,
        height: 48,
        borderWidth: 2,
        borderRadius: radius.md,
        fontSize: typography.xl,
    },
    resendContainer: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        flexWrap: 'wrap',
    },
    resendText: { fontSize: typography.sm },
    timerText: { fontSize: typography.sm },
    resendButton: { fontWeight: 'bold', fontSize: typography.sm },
});

export default OtpVerification;

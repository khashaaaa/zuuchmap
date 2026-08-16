import React, { useState } from 'react';
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
import { spacing, typography, radius, interactions, isTablet } from '../../design/theme';
import { useAppTheme } from '../../hooks/useAppTheme';
import { useAppContext } from '../../context/AppContext';
import { useTranslation } from 'react-i18next';
import userService from '../../services/api/userService';
import { saveUserInfo } from '../../services/api/authHelpers';
import { getErrorMessage, showErrorModal } from '../../utils/errorManager';
import { logger } from '../../utils/logger';
import Button from '../../components/Button';
import { getDeviceInfo, navigateToDashboard } from '../../utils/navigationUtils';

const PhoneNumber = ({ navigation }) => {
    const [phoneNumber, setPhoneNumber] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const { colors, isDark } = useAppTheme();
    const { setThemeMode } = useAppContext();
    const { t } = useTranslation();

    const validatePhoneNumber = (number) => {
        return /^\d{8}$/.test(number);
    };

    // OTP screen is bypassed until real SMS delivery ships (server has no SMS
    // provider yet, so there's nothing for the user to read a code from).
    // Uses the code the send-otp endpoint already returns in its response.
    const autoVerify = async (phoneNumber, userType) => {
        const otpResponse = await userService.sendOtp(phoneNumber);
        const code = otpResponse?.data?.data?.code;
        const deviceInfo = getDeviceInfo();
        const response = await userService.verifyOtp(phoneNumber, code, null, deviceInfo);
        const isAdmin = response.data?.data?.is_admin === true;

        if (userType) {
            await saveUserInfo(phoneNumber, userType);
            navigateToDashboard(navigation, userType, isAdmin);
        } else {
            navigation.navigate('UserRoleSelection', {
                phoneNumber,
                userId: response.data?.data?.id,
                token: response.data?.data?.token,
            });
        }
    };

    const handleContinue = async () => {
        if (!validatePhoneNumber(phoneNumber)) {
            showErrorModal(t('auth.title'), t('auth.phonePlaceholder'));
            return;
        }

        setIsLoading(true);
        try {
            const userCheck = await userService.checkUserExists(phoneNumber);
            await autoVerify(phoneNumber, userCheck.exists ? userCheck.userType : null);
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
                            activeOpacity={interactions.activeOpacityLight}
                        >
                            <Ionicons name={isDark ? 'sunny-outline' : 'moon-outline'} size={20} color={colors.primary} />
                        </TouchableOpacity>
                    </View>
                    <View style={styles.header}>
                        <View style={[styles.iconContainer, { backgroundColor: colors.opacity.background.primary }]}>
                            <Ionicons name="call-outline" size={64} color={colors.primary} />
                        </View>
                        <Text style={[styles.title, { color: colors.text.primary }]}>
                            {t('auth.phoneTitle')}
                        </Text>
                        <Text style={[styles.subtitle, { color: colors.text.secondary }]}>
                            {t('auth.phoneSubtitle')}
                        </Text>
                    </View>

                    <View style={styles.form}>
                        <View style={[styles.inputContainer, { backgroundColor: colors.surface, borderColor: colors.border.medium }]}>
                            <View style={[styles.prefixContainer, { backgroundColor: colors.background, borderRightColor: colors.border.medium }]}>
                                <Text style={[styles.prefix, { color: colors.text.primary }]}>+976</Text>
                            </View>
                            <TextInput
                                style={[styles.input, { color: colors.text.inverse }]}
                                value={phoneNumber}
                                onChangeText={setPhoneNumber}
                                placeholder={t('auth.phonePlaceholder')}
                                placeholderTextColor={colors.text.placeholder}
                                keyboardType="phone-pad"
                                maxLength={8}
                                autoFocus
                            />
                        </View>

                        <Button
                            title={isLoading ? t('auth.sending') : t('auth.continue')}
                            onPress={handleContinue}
                            disabled={isLoading || !validatePhoneNumber(phoneNumber)}
                            loading={isLoading}
                            fullWidth
                        />
                    </View>

                    <View style={styles.footer}>
                        <Text style={[styles.footerText, { color: colors.text.tertiary }]}>
                            {t('auth.phoneSubtitle')}
                        </Text>
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
        borderRadius: radius.xl,
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
    title: {
        fontSize: typography.xxl,
        fontWeight: 'bold',
        marginBottom: spacing.sm,
        textAlign: 'center',
    },
    subtitle: {
        fontSize: typography.md,
        textAlign: 'center',
        lineHeight: 22,
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
        fontSize: typography.md,
        fontWeight: '600',
    },
    input: {
        flex: 1,
        height: 52,
        fontSize: typography.md,
        paddingHorizontal: spacing.md,
    },
    footer: {
        marginTop: spacing.xxl,
        paddingHorizontal: spacing.md,
    },
    footerText: {
        fontSize: typography.xs,
        textAlign: 'center',
        lineHeight: 18,
    },
});

export default PhoneNumber;

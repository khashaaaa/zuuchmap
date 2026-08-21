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
import { track } from '../../services/analytics';
import Button from '../../components/Button';
import { navigateToDashboard } from '../../utils/navigationUtils';

const PhoneNumber = ({ navigation }) => {
    const [phoneNumber, setPhoneNumber] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const { colors, isDark } = useAppTheme();
    const { setThemeMode } = useAppContext();
    const { t } = useTranslation();

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
            const userCheck = await userService.checkUserExists(phoneNumber);
            const userType = userCheck.exists ? userCheck.userType : null;
            const session = await userService.startVerification(phoneNumber);

            // Device already proved this number on a previous session.
            if (session.verified) {
                track('auth.verified', { trusted_device: true });
                await goAfterAuth(phoneNumber, userType, session.auth?.user?.is_admin === true);
                return;
            }

            navigation.navigate('OtpVerification', { phoneNumber, userType, session });
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
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
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
                                <Text style={[styles.prefix, { color: colors.text.primary }]}>{t('auth.phoneLabel')}</Text>
                            </View>
                            <TextInput
                                style={[styles.input, { color: colors.text.primary }]}
                                value={phoneNumber}
                                onChangeText={setPhoneNumber}
                                placeholder={t('auth.phonePlaceholder')}
                                placeholderTextColor={colors.text.placeholder}
                                keyboardType="phone-pad"
                                maxLength={8}
                                autoFocus
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
        paddingHorizontal: spacing.md,
    },
});

export default PhoneNumber;

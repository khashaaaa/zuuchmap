import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    Platform,
    StatusBar,
    StyleSheet,
    Linking,
    ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { spacing, typography, radius, interactions, isTablet } from '../../design/theme';
import { useAppTheme } from '../../hooks/useAppTheme';
import { useAppContext } from '../../context/AppContext';
import { useTranslation } from 'react-i18next';
import userService from '../../services/api/userService';
import { saveUserInfo } from '../../services/api/authHelpers';
import { navigateToDashboard } from '../../utils/navigationUtils';
import { getErrorMessage, showErrorModal } from '../../utils/errorManager';
import { track } from '../../services/analytics';
import { logger } from '../../utils/logger';
import Button from '../../components/Button';

/** Client poll cadence; the engine throttles its own upstream calls to 3s. */
const POLL_MS = 2000;

/** Letter-spacing on the code, mirrored as a margin so it stays centred. */
const CODE_TRACKING = 8;

/**
 * verify.mn is Mobile-Originated: we never send the user an SMS. We show a code
 * they text to the shortcode from the number they are claiming, and possession
 * is proven by that message arriving from that number.
 */
const OtpVerification = ({ route, navigation }) => {
    const { phoneNumber, userType, session } = route.params || {};

    const [status, setStatus] = useState('PENDING');
    const [now, setNow] = useState(() => Date.now());
    const settled = useRef(false);
    // Pinned once: deriving the fallback from the ticking clock would keep the
    // countdown frozen at five minutes forever when the session omits an expiry.
    const fallbackExpiry = useRef(Date.now() + 300000);

    const { colors, isDark } = useAppTheme();
    const { setThemeMode } = useAppContext();
    const { t } = useTranslation();

    const expiresAt = session?.expires_at ? Date.parse(session.expires_at) : fallbackExpiry.current;
    const secondsLeft = Math.max(0, Math.round((expiresAt - now) / 1000));
    const view = status === 'PENDING' && secondsLeft <= 0 ? 'EXPIRED' : status;

    const finish = useCallback(async (auth) => {
        const isAdmin = auth?.user?.is_admin === true;
        track('auth.verified', { trusted_device: false });

        if (userType) {
            await saveUserInfo(phoneNumber, userType);
            navigateToDashboard(navigation, userType, isAdmin);
        } else {
            navigation.navigate('UserRoleSelection', { phoneNumber });
        }
    }, [navigation, phoneNumber, userType]);

    const poll = useCallback(async () => {
        if (settled.current || !session?.session_id) return;
        try {
            const result = await userService.checkVerification(session.session_id, phoneNumber);

            if (result.status === 'VERIFIED' && result.auth) {
                settled.current = true;
                setStatus('VERIFIED');
                await finish(result.auth);
                return;
            }
            if (result.status === 'EXPIRED') {
                settled.current = true;
                setStatus('EXPIRED');
            }
        } catch (error) {
            // 410 means already consumed; anything else is transient and the
            // next tick retries.
            if (error?.response?.status === 410) {
                settled.current = true;
                setStatus('EXPIRED');
            } else {
                logger.debug('Verification poll failed, retrying', error?.message);
            }
        }
    }, [session?.session_id, phoneNumber, finish]);

    useEffect(() => {
        if (status !== 'PENDING') return undefined;
        const id = setInterval(poll, POLL_MS);
        return () => clearInterval(id);
    }, [status, poll]);

    useEffect(() => {
        if (status !== 'PENDING') return undefined;
        const id = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(id);
    }, [status]);

    const openSms = async () => {
        try {
            await Linking.openURL(session.sms_uri);
        } catch (error) {
            showErrorModal(t('common.error'), getErrorMessage(error, t('auth.smsOpenError')));
        }
    };

    const mins = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
    const secs = String(secondsLeft % 60).padStart(2, '0');

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
            <StatusBar backgroundColor={colors.surface} barStyle={isDark ? 'light-content' : 'dark-content'} />
            <View style={styles.tabletCentering}>
                <View style={styles.content}>
                    <View style={styles.topRow}>
                        <TouchableOpacity
                            style={styles.backButton}
                            onPress={() => navigation.goBack()}
                            activeOpacity={interactions.activeOpacityLight}
                            hitSlop={interactions.hitSlop}
                        >
                            <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.themeToggle, { backgroundColor: colors.opacity.background.primary }]}
                            onPress={() => setThemeMode(isDark ? 'light' : 'dark')}
                            activeOpacity={interactions.activeOpacityLight}
                            hitSlop={interactions.hitSlop}
                        >
                            <Ionicons name={isDark ? 'sunny-outline' : 'moon-outline'} size={20} color={colors.primary} />
                        </TouchableOpacity>
                    </View>

                    <View style={styles.header}>
                        <View style={[styles.iconContainer, { backgroundColor: colors.opacity.background.primary }]}>
                            <Ionicons name="chatbox-ellipses-outline" size={56} color={colors.primary} />
                        </View>
                        <Text style={[styles.title, { color: colors.text.primary }]}>
                            {t('auth.smsTitle')}
                        </Text>
                        <Text style={[styles.subtitle, { color: colors.text.secondary }]}>
                            {t('auth.smsLead', { shortcode: session?.shortcode ?? '144773' })}
                        </Text>

                        <View style={[styles.codeCard, { backgroundColor: colors.surface, borderColor: colors.border.medium }]}>
                            <Text style={[styles.codeLabel, { color: colors.text.secondary }]}>
                                {t('auth.yourCode')}
                            </Text>
                            <Text selectable style={[styles.code, { color: colors.text.primary }]}>
                                {session?.code}
                            </Text>
                        </View>
                    </View>

                    <View style={styles.form}>
                        {view === 'PENDING' && (
                            <>
                                <Button title={t('auth.openSms')} onPress={openSms} />
                                <Text style={[styles.manualHint, { color: colors.text.secondary }]}>
                                    {t('auth.manualHint', {
                                        code: session?.code,
                                        shortcode: session?.shortcode ?? '144773',
                                    })}
                                </Text>
                                <View style={styles.waitingRow}>
                                    <ActivityIndicator size="small" color={colors.primary} />
                                    <Text style={[styles.waitingText, { color: colors.text.secondary }]}>
                                        {t('auth.waiting')}
                                    </Text>
                                    <Text style={[styles.countdown, { color: colors.text.secondary }]}>
                                        {mins}:{secs}
                                    </Text>
                                </View>
                                <Text style={[styles.costNote, { color: colors.text.secondary }]}>
                                    {t('auth.cost')}
                                </Text>
                            </>
                        )}

                        {view === 'EXPIRED' && (
                            <>
                                <Text style={[styles.expiredText, { color: colors.danger }]}>
                                    {t('auth.expired')}
                                </Text>
                                <Button title={t('auth.startOver')} onPress={() => navigation.goBack()} />
                            </>
                        )}

                        {view === 'VERIFIED' && (
                            <Text style={[styles.waitingText, { color: colors.success, textAlign: 'center' }]}>
                                {t('auth.verified')}
                            </Text>
                        )}
                    </View>
                </View>
            </View>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1 },
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
    backButton: { padding: spacing.sm },
    themeToggle: {
        width: 36,
        height: 36,
        borderRadius: radius.full,
        justifyContent: 'center',
        alignItems: 'center',
    },
    header: {
        alignItems: 'center',
        flex: 1,
        justifyContent: 'center',
    },
    iconContainer: {
        width: 96,
        height: 96,
        borderRadius: radius.xl,
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
        marginBottom: spacing.xl,
    },
    codeCard: {
        alignSelf: 'stretch',
        alignItems: 'center',
        borderWidth: 1,
        borderRadius: radius.card,
        paddingVertical: spacing.lg,
    },
    codeLabel: { ...typography.styles.caption, marginBottom: spacing.xs },
    code: {
        ...typography.styles.display,
        letterSpacing: CODE_TRACKING,
        // Tracking is applied after the last glyph too, so centred text sits
        // half a space off; pull it back by the same amount.
        marginLeft: CODE_TRACKING,
        fontVariant: ['tabular-nums'],
    },
    form: {
        gap: spacing.lg,
        paddingBottom: spacing.xxl,
    },
    waitingRow: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        gap: spacing.sm,
    },
    waitingText: { ...typography.styles.caption },
    countdown: { ...typography.styles.caption, fontVariant: ['tabular-nums'] },
    manualHint: { ...typography.styles.small, textAlign: 'center' },
    costNote: {
        ...typography.styles.small,
        textAlign: 'center',
    },
    expiredText: {
        ...typography.styles.caption,
        textAlign: 'center',
    },
});

export default OtpVerification;

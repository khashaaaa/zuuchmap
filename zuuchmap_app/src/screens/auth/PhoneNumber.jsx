import React, { useState, useEffect, useRef } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    KeyboardAvoidingView,
    Platform,
    StyleSheet,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import CustomSafeAreaView from '../../components/CustomSafeAreaView';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useKeyboardOverlap } from '../../hooks/useKeyboardOverlap';
import { Ionicons } from '@expo/vector-icons';
import { spacing, typography, radius, interactions, isTablet, tintOn, toneForTheme } from '../../design/theme';
import { useAppTheme } from '../../hooks/useAppTheme';
import { useAppContext } from '../../context/AppContext';
import { useTranslation } from 'react-i18next';
import userService from '../../services/api/userService';
import postService from '../../services/api/postService';
import { useActiveCategorySchemas } from '../../hooks/useCategorySchemas';
import { getPostTypeConfig } from '../../utils/postUtils';
import { groupThousands } from '../../utils/displayUtils';
import Avatar from '../../components/Avatar';
import { saveUserInfo, getUserInfo } from '../../services/api/authHelpers';
import { API_CONFIG } from '../../config/api.config';
import { getErrorMessage, showErrorModal } from '../../utils/errorManager';
import { logger } from '../../utils/logger';
import { track } from '../../services/analytics';
import Button from '../../components/Button';
import FadeSlideIn from '../../components/FadeSlideIn';
import { navigateToDashboard } from '../../utils/navigationUtils';

const TILE = 52;
const TILE_GAP = 10;
const MAX_ROWS = 3;
const WALL_MARGIN = spacing.xxl;

/**
 * Every live category as a tile, laid in brick bond: courses alternate short
 * and long, so each sits offset by half a tile (13 categories lay 4/5/4).
 * Data-driven like every other category surface — a new vertical joins the
 * wall without a release. `maxHeight` is what the headline and form leave;
 * whole courses are dropped to fit it, because a first visit opens with the
 * keyboard up and the title must not be the thing that gives way.
 */
const CategoryWall = ({ schemas, colors, isDark, maxHeight }) => {
    const [width, setWidth] = useState(0);
    let rows = [];
    if (width && maxHeight > 0 && schemas.length) {
        const long = Math.min(5, Math.floor((width + TILE_GAP) / (TILE + TILE_GAP)));
        const fit = Math.min(MAX_ROWS, Math.floor((maxHeight + TILE_GAP) / (TILE + TILE_GAP)));
        for (let i = 0, r = 0; r < fit && i < schemas.length; r++) {
            const n = r % 2 === 0 ? long - 1 : long;
            rows.push(schemas.slice(i, i + n));
            i += n;
        }
    }
    return (
        <View
            style={styles.wall}
            onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
            accessible={false}
            importantForAccessibility="no-hide-descendants"
        >
            {rows.map((row, r) => (
                <View key={r} style={styles.wallRow}>
                    {row.map((schema, i) => {
                        const { iconName, color } = getPostTypeConfig(schema.key, colors, schemas);
                        return (
                            <FadeSlideIn key={schema.key} index={r * 5 + i} stagger={35}>
                                <View style={[styles.tile, { backgroundColor: tintOn(color, isDark ? 0.22 : 0.14, colors.background) }]}>
                                    <Ionicons name={iconName} size={24} color={toneForTheme(color, isDark)} />
                                </View>
                            </FadeSlideIn>
                        );
                    })}
                </View>
            ))}
        </View>
    );
};

const PhoneNumber = ({ navigation }) => {
    const [phoneNumber, setPhoneNumber] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    // The identity confirmLogout keeps behind: name/photo/phone of the person
    // who signed out, shown as a "welcome back" block with the number prefilled
    // (a trusted device then signs them back in with one tap, no SMS).
    const [savedUser, setSavedUser] = useState(null);
    const inputRef = useRef(null);
    const { colors, isDark } = useAppTheme();
    const insets = useSafeAreaInsets();
    const keyboard = useKeyboardOverlap();
    const { setThemeMode } = useAppContext();
    const { t } = useTranslation();
    const schemas = useActiveCategorySchemas();
    const [headerH, setHeaderH] = useState(0);
    const [headlineH, setHeadlineH] = useState(0);
    // Optional garnish: absent until it loads, and never blocks the form.
    const { data: stats } = useQuery({
        queryKey: ['posts', 'public-stats'],
        queryFn: postService.getPublicStats,
        staleTime: 5 * 60 * 1000,
    });

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

            navigation.navigate('PhoneVerification', { phoneNumber, session });
        } catch (error) {
            logger.error('Phone number verification error:', error);
            showErrorModal(t('common.error'), getErrorMessage(error, t('auth.sendError')));
        } finally {
            setIsLoading(false);
        }
    };

    return (
        // The same status-bar handling as every other screen. An opaque
        // <StatusBar> here, after the translucent one the rest of the app sets,
        // left the safe-area inset and the window disagreeing about where the
        // top was, and the top row slid up under the status bar.
        <CustomSafeAreaView backgroundColor={colors.background}>
            <KeyboardAvoidingView
                behavior="padding"
                // iOS only. Android pads by the measured overlap instead
                // (useKeyboardOverlap): `height` shrank an already-resized
                // window a second time and pushed the title under the status bar.
                enabled={Platform.OS === 'ios'}
                style={styles.flex1}
            >
                <View
                    ref={keyboard.ref}
                    onLayout={keyboard.onLayout}
                    style={[styles.tabletCentering, Platform.OS === 'android' && { paddingBottom: keyboard.overlap }]}
                >
            {/* The window runs behind the navigation bar; without its inset the
                "other number" link sat on the bar's edge. */}
            <View style={[styles.content, { paddingBottom: insets.bottom + spacing.lg }]}>
                    <View style={styles.topRow}>
                        {/*
                          * A guest who tapped "sign in" from browsing must be
                          * able to change their mind. Only rendered when there
                          * IS somewhere to go back to — on a cold start this is
                          * the root and a dead back arrow would be a lie.
                          */}
                        {navigation.canGoBack() ? (
                            <TouchableOpacity
                                style={[styles.themeToggle, { backgroundColor: colors.opacity.background.primary }]}
                                onPress={() => navigation.goBack()}
                                accessibilityRole="button"
                                accessibilityLabel={t('common.back')}
                                activeOpacity={interactions.activeOpacityLight}
                                hitSlop={interactions.hitSlop}
                            >
                                <Ionicons name="arrow-back" size={20} color={colors.iconAccent} />
                            </TouchableOpacity>
                        ) : (
                            <View />
                        )}
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
                    <View style={styles.header} onLayout={(e) => setHeaderH(e.nativeEvent.layout.height)}>
                        <CategoryWall
                            schemas={schemas}
                            colors={colors}
                            isDark={isDark}
                            maxHeight={headerH - headlineH - WALL_MARGIN}
                        />
                        <View style={styles.headline} onLayout={(e) => setHeadlineH(e.nativeEvent.layout.height)}>
                        <FadeSlideIn style={styles.headline}>
                            <Text style={[styles.title, { color: colors.text.primary }]}>
                                {savedUser ? t('auth.welcomeBack') : t('auth.phoneTitle')}
                            </Text>
                            {savedUser ? (
                                <View style={[styles.who, { backgroundColor: colors.surface, borderColor: colors.border.light }]}>
                                    <Avatar uri={savedUser.profilePicture} size={28} />
                                    <Text style={[styles.whoName, { color: colors.text.primary }]} numberOfLines={1}>
                                        {savedUser.name || savedUser.phoneNumber}
                                    </Text>
                                </View>
                            ) : (
                                <Text style={[styles.subtitle, { color: colors.text.secondary }]}>{t('auth.phoneSubtitle')}</Text>
                            )}
                            {stats?.total > 0 && (
                                <View style={styles.stats}>
                                    <View style={[styles.liveDot, { backgroundColor: colors.success }]} />
                                    <Text style={[styles.statsText, { color: colors.text.secondary }]}>
                                        {t('auth.liveStats', { listings: groupThousands(stats.total), provinces: stats.provinces })}
                                    </Text>
                                </View>
                            )}
                        </FadeSlideIn>
                        </View>
                    </View>

                    <View style={styles.form}>
                        <View style={[styles.inputContainer, { backgroundColor: colors.surface, borderColor: colors.border.medium }]}>
                            <View style={[styles.prefixContainer, { backgroundColor: colors.background, borderRightColor: colors.border.medium }]}>
                                <Text style={[styles.prefix, { color: colors.text.primary }]}>{t('auth.phoneLabel')}</Text>
                            </View>
                            <TextInput
                                ref={inputRef}
                                style={[styles.input, { color: colors.text.primary }]}
                                value={phoneNumber}
                                onChangeText={(v) => setPhoneNumber(v.replace(/\D/g, ''))}
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
        </CustomSafeAreaView>
    );
};

const styles = StyleSheet.create({
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
        borderRadius: radius.pill,
        justifyContent: 'center',
        alignItems: 'center',
    },
    header: {
        flex: 1,
        justifyContent: 'center',
        marginBottom: spacing.xxl,
    },
    wall: {
        gap: TILE_GAP,
        marginBottom: WALL_MARGIN,
    },
    wallRow: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: TILE_GAP,
    },
    tile: {
        width: TILE,
        height: TILE,
        borderRadius: radius.lg,
        justifyContent: 'center',
        alignItems: 'center',
    },
    headline: {
        alignItems: 'center',
    },
    who: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        maxWidth: '100%',
        paddingVertical: spacing.xs,
        paddingLeft: spacing.xs,
        paddingRight: spacing.md,
        borderRadius: radius.pill,
        borderWidth: 1,
    },
    whoName: {
        ...typography.styles.labelStrong,
        flexShrink: 1,
    },
    stats: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        marginTop: spacing.md,
    },
    liveDot: {
        width: 6,
        height: 6,
        borderRadius: radius.pill,
    },
    statsText: {
        ...typography.styles.caption,
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

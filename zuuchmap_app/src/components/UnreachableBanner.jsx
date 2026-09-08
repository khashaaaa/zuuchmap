import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { spacing, typography, radius, withAlpha } from '../design/theme';
import { useAppTheme } from '../hooks/useAppTheme';
import { enablePush, hasPushPermission } from '../utils/pushPrompt';
import PressableScale from './PressableScale';
import { showInfoModal } from '../utils/errorManager';

/**
 * "Nobody can reach you."
 *
 * There is no SMS transport — verify.mn is receive-only — and signup is by
 * phone, so most accounts carry no email address either. Email is a fallback
 * for an account with no registered device at all. Which leaves push as the
 * only way a provider hears that a customer has written to them, and a
 * provider who once tapped "Don't allow" hears nothing at all: they see the
 * enquiry the next time they happen to open the app, if they ever do, and the
 * customer meanwhile concludes the marketplace is dead.
 *
 * That is invisible from the inside, so it has to be said out loud on the
 * screen a provider actually opens.
 */
const UnreachableBanner = () => {
    const { colors } = useAppTheme();
    const { t } = useTranslation();
    const [reachable, setReachable] = useState(null);

    const check = useCallback(() => {
        let cancelled = false;
        hasPushPermission().then((ok) => { if (!cancelled) setReachable(ok); });
        return () => { cancelled = true; };
    }, []);

    useEffect(check, [check]);

    const handleEnable = useCallback(async () => {
        if (await enablePush()) {
            setReachable(true);
            return;
        }
        // The OS will not show its dialog again for this app, so another tap
        // does nothing — Settings is the only door left, and saying so beats
        // a button that silently fails.
        showInfoModal(t('push.blockedTitle'), t('push.blockedBody'), [
            { text: t('common.cancel') },
            { text: t('push.openSettings'), onPress: () => Linking.openSettings() },
        ]);
    }, [t]);

    // `null` until the permission read resolves — a banner that flashes on
    // every launch for someone perfectly reachable is its own annoyance.
    if (reachable !== false) return null;

    return (
        <View style={[styles.banner, {
            backgroundColor: withAlpha(colors.warning, 0.12),
            borderColor: withAlpha(colors.warning, 0.3),
        }]}>
            <Ionicons name="notifications-off-outline" size={20} color={colors.warning} />
            <View style={styles.body}>
                <Text style={[styles.title, { color: colors.text.primary }]} maxFontSizeMultiplier={1.3}>
                    {t('push.unreachableTitle')}
                </Text>
                <Text style={[styles.text, { color: colors.text.secondary }]} maxFontSizeMultiplier={1.3}>
                    {t('push.unreachableBody')}
                </Text>
                <PressableScale onPress={handleEnable} accessibilityRole="button">
                    <Text style={[styles.action, { color: colors.text.link }]} maxFontSizeMultiplier={1.3}>
                        {t('push.enable')}
                    </Text>
                </PressableScale>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    banner: {
        flexDirection: 'row',
        gap: spacing.sm,
        alignItems: 'flex-start',
        borderWidth: 1,
        borderRadius: radius.card,
        padding: spacing.md,
        marginBottom: spacing.md,
    },
    body: { flex: 1, gap: spacing.xs },
    title: { ...typography.styles.labelStrong },
    text: { ...typography.styles.small },
    action: { ...typography.styles.labelStrong, marginTop: spacing.xs },
});

export default UnreachableBanner;

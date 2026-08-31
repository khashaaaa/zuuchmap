import React, { useMemo, useEffect, useState } from 'react';
import { View, Text, SectionList, TouchableOpacity, StyleSheet, Switch } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { ScreenLayout, EmptyState } from '../../components';
import { spacing, typography, radius, withAlpha, interactions, isTablet } from '../../design/theme';
import { useAppTheme } from '../../hooks/useAppTheme';
import { useAppContext } from '../../context/AppContext';
import { SOUND_PREF_KEY, isSoundEnabled } from '../../hooks/useNotificationSync';

const TYPE_ICON = {
    success: 'checkmark-circle',
    error: 'close-circle',
    info: 'information-circle',
};

const TYPE_COLOR = (colors) => ({
    success: colors.success,
    error: colors.danger,
    info: colors.primary,
});

function NotifItem({ item, colors, onPress }) {
    const iconName = TYPE_ICON[item.type] || TYPE_ICON.info;
    const iconColor = TYPE_COLOR(colors)[item.type] || colors.primary;
    const ts = useMemo(() => {
        const d = new Date(item.ts);
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) +
            ' · ' + d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }, [item.ts]);

    const content = (
        <>
            <View style={[styles.iconWrap, { backgroundColor: withAlpha(iconColor, 0.09) }]}>
                <Ionicons name={iconName} size={20} color={iconColor} />
            </View>
            <View style={styles.body}>
                <View style={styles.titleRow}>
                    <Text style={[styles.title, { color: colors.text.primary }]} numberOfLines={1}>{item.title}</Text>
                    <Text style={[styles.ts, { color: colors.text.tertiary }]}>{ts}</Text>
                </View>
                {!!item.message && (
                    <Text style={[styles.message, { color: colors.text.secondary }]} numberOfLines={2}>{item.message}</Text>
                )}
            </View>
        </>
    );

    // Unread is one signal: a 3px amber rule on the row's leading edge.
    const itemStyle = [
        styles.item,
        { borderBottomColor: colors.border.light },
        !item.read && { borderLeftWidth: 3, borderLeftColor: colors.primary },
    ];
    // Rows without a target (generic info) stay plain views.
    if (!onPress) return <View style={itemStyle}>{content}</View>;
    return (
        <TouchableOpacity style={itemStyle} onPress={onPress} activeOpacity={interactions.activeOpacityLight}>
            {content}
        </TouchableOpacity>
    );
}

const NotificationsScreen = ({ navigation }) => {
    const { t } = useTranslation();
    const { colors } = useAppTheme();
    const { notifications, unreadCount, markAllRead } = useAppContext();

    // "approved 3 minutes ago" and "approved 3 weeks ago" are different news —
    // split the stream at midnight so time structure is visible.
    const sections = useMemo(() => {
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);
        const today = [];
        const earlier = [];
        notifications.forEach((n) => (new Date(n.ts) >= startOfToday ? today : earlier).push(n));
        const out = [];
        if (today.length) out.push({ title: t('notifications.today'), data: today });
        if (earlier.length) out.push({ title: t('notifications.earlier'), data: earlier });
        return out;
    }, [notifications, t]);

    // Mark read on the way out, not on arrival — clearing on mount erases the
    // unread tint before it has been seen and hides the header action entirely.
    useEffect(() => () => { markAllRead(); }, [markAllRead]);

    // Chime on foreground banners. Read by useNotificationSync at present time.
    const [sound, setSound] = useState(true);
    useEffect(() => { isSoundEnabled().then(setSound); }, []);
    const toggleSound = (v) => {
        setSound(v);
        AsyncStorage.setItem(SOUND_PREF_KEY, v ? '1' : '0').catch(() => {});
    };

    // Mirrors the push-tap routing in App.js: post events open the post,
    // booking events open the booking list on the relevant side.
    const pressHandlerFor = (item) => {
        if (item.conversationId) {
            return () => navigation.navigate('MessageThread', { id: item.conversationId });
        }
        if (item.reportId) {
            return () => navigation.navigate('AdminDashboard', { screen: 'Reports' });
        }
        if (item.postId) {
            return () => navigation.navigate('PostDetailScreen', {
                postId: item.postId,
                postType: item.postType,
                role: item.role || 'customer',
            });
        }
        if (item.bookingRole) {
            return () => navigation.navigate('BookingList', { role: item.bookingRole });
        }
        return null;
    };

    return (
        <ScreenLayout
            title={t('notifications.title')}
            showBack
            onBack={() => navigation.goBack()}
            rightComponent={unreadCount > 0 ? (
                <TouchableOpacity
                    onPress={markAllRead}
                    style={styles.readBtn}
                    activeOpacity={interactions.activeOpacityLight}
                    hitSlop={interactions.hitSlop}
                >
                    <Text style={[styles.readBtnText, { color: colors.text.link }]}>{t('notifications.markAllRead')}</Text>
                </TouchableOpacity>
            ) : null}
        >
            <View style={[styles.soundRow, { borderBottomColor: colors.border.light }]}>
                <Ionicons name={sound ? 'volume-high-outline' : 'volume-mute-outline'} size={18} color={colors.text.secondary} />
                <Text style={[styles.soundLabel, { color: colors.text.primary }]}>{t('notifications.sound')}</Text>
                <Switch
                    value={sound}
                    onValueChange={toggleSound}
                    trackColor={{ true: colors.primary }}
                    accessibilityLabel={t('notifications.sound')}
                />
            </View>
            {notifications.length === 0 ? (
                <EmptyState
                    icon="notifications-off-outline"
                    variant="neutral"
                    title={t('notifications.empty')}
                    subtitle={t('notifications.emptySubtitle')}
                />
            ) : (
                <SectionList
                    sections={sections}
                    keyExtractor={(item) => String(item.id)}
                    renderItem={({ item, index }) => (
                            <NotifItem item={item} colors={colors} onPress={pressHandlerFor(item)} />
                    )}
                    renderSectionHeader={({ section }) => (
                        <Text style={[styles.sectionHeader, { color: colors.text.tertiary, backgroundColor: colors.background }]}>
                            {section.title}
                        </Text>
                    )}
                    stickySectionHeadersEnabled
                    contentContainerStyle={styles.list}
                />
            )}
        </ScreenLayout>
    );
};

const styles = StyleSheet.create({
    list: {
        paddingBottom: spacing.xl,
        ...(isTablet ? { maxWidth: 680, alignSelf: 'center', width: '100%' } : {}),
    },

    item: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.md,
        borderBottomWidth: StyleSheet.hairlineWidth,
        gap: spacing.md,
    },
    iconWrap: {
        width: 36,
        height: 36,
        borderRadius: radius.full,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: spacing.xxs,
    },
    body: { flex: 1 },
    titleRow: {
        flexDirection: 'row',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        gap: spacing.sm,
        marginBottom: spacing.xxs,
    },
    title: { ...typography.styles.labelStrong, flexShrink: 1 },
    message: { ...typography.styles.caption },
    ts: { ...typography.styles.micro },
    sectionHeader: {
        ...typography.styles.overline,
        textTransform: 'uppercase',
        paddingHorizontal: spacing.lg,
        paddingTop: spacing.md,
        paddingBottom: spacing.xs,
    },
    soundRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.sm,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    soundLabel: { ...typography.styles.label, flex: 1 },
    readBtn: { paddingHorizontal: spacing.sm, paddingVertical: spacing.sm },
    readBtnText: { ...typography.styles.label },
});

export default NotificationsScreen;

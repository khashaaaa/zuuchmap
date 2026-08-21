import React, { useMemo, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { ScreenLayout, EmptyState, FadeSlideIn } from '../../components';
import { spacing, typography, radius, withAlpha, interactions } from '../../design/theme';
import { useAppTheme } from '../../hooks/useAppTheme';
import { useAppContext } from '../../context/AppContext';

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

function NotifItem({ item, colors }) {
    const iconName = TYPE_ICON[item.type] || TYPE_ICON.info;
    const iconColor = TYPE_COLOR(colors)[item.type] || colors.primary;
    const ts = useMemo(() => {
        const d = new Date(item.ts);
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) +
            ' · ' + d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }, [item.ts]);

    return (
        <View style={[
            styles.item,
            { backgroundColor: item.read ? 'transparent' : withAlpha(iconColor, 0.07), borderBottomColor: colors.border.light },
        ]}>
            <View style={[styles.iconWrap, { backgroundColor: withAlpha(iconColor, 0.09) }]}>
                <Ionicons name={iconName} size={20} color={iconColor} />
            </View>
            <View style={styles.body}>
                <Text style={[styles.title, { color: colors.text.primary }]} numberOfLines={1}>{item.title}</Text>
                {!!item.message && (
                    <Text style={[styles.message, { color: colors.text.secondary }]} numberOfLines={2}>{item.message}</Text>
                )}
                <Text style={[styles.ts, { color: colors.text.tertiary }]}>{ts}</Text>
            </View>
            {!item.read && <View style={[styles.dot, { backgroundColor: iconColor }]} />}
        </View>
    );
}

const NotificationsScreen = ({ navigation }) => {
    const { t } = useTranslation();
    const { colors } = useAppTheme();
    const { notifications, unreadCount, markAllRead } = useAppContext();

    useEffect(() => {
        if (unreadCount > 0) markAllRead();
    }, []);

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
                    hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
                >
                    <Text style={[styles.readBtnText, { color: colors.primary }]}>{t('notifications.markAllRead')}</Text>
                </TouchableOpacity>
            ) : null}
        >
            {notifications.length === 0 ? (
                <EmptyState
                    icon="notifications-off-outline"
                    title={t('notifications.empty')}
                    subtitle={t('notifications.emptySubtitle')}
                />
            ) : (
                <FlatList
                    data={notifications}
                    keyExtractor={(item) => String(item.id)}
                    renderItem={({ item, index }) => (
                        <FadeSlideIn index={index}>
                            <NotifItem item={item} colors={colors} />
                        </FadeSlideIn>
                    )}
                    contentContainerStyle={styles.list}
                />
            )}
        </ScreenLayout>
    );
};

const styles = StyleSheet.create({
    list: { paddingBottom: spacing.xl },
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
    title: { ...typography.styles.title, marginBottom: spacing.xxs },
    message: { ...typography.styles.small, lineHeight: typography.xs * 1.5, marginBottom: spacing.xs },
    ts: { ...typography.styles.small },
    dot: { width: 8, height: 8, borderRadius: radius.full, marginTop: spacing.xs },
    readBtn: { paddingHorizontal: spacing.sm, paddingVertical: spacing.sm },
    readBtnText: { ...typography.styles.label },
});

export default NotificationsScreen;

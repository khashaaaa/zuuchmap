import React from 'react';
import { TouchableOpacity, View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useAppContext } from '../context/AppContext';
import { useAppTheme } from '../hooks/useAppTheme';
import { spacing, typography, radius, interactions } from '../design/theme';

export default function NotificationBell() {
    const navigation = useNavigation();
    const { unreadCount } = useAppContext();
    const { colors } = useAppTheme();
    const { t } = useTranslation();

    return (
        <TouchableOpacity
            style={styles.btn}
            onPress={() => navigation.navigate('Notifications')}
            activeOpacity={interactions.activeOpacity}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel={t('notifications.title')}
        >
            <Ionicons name="notifications-outline" size={22} color={colors.primary} />
            {unreadCount > 0 && (
                <View style={[styles.badge, { backgroundColor: colors.danger }]}>
                    <Text style={styles.badgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
                </View>
            )}
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    btn: {
        padding: spacing.sm,
        position: 'relative',
    },
    badge: {
        position: 'absolute',
        top: spacing.xs,
        right: spacing.xs,
        minWidth: 16,
        height: 16,
        borderRadius: radius.badge,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 3,
    },
    badgeText: {
        color: '#ffffff',
        fontSize: 10,
        fontWeight: 'bold',
        lineHeight: 12,
    },
});

import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { Platform } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useTranslation } from 'react-i18next';
import { useAppTheme } from '../../hooks/useAppTheme';
import { spacing, typography } from '../../design/theme';
import { useQuery } from '@tanstack/react-query';
import reportService, { REPORTS_KEY } from '../../services/api/reportService';
import postService from '../../services/api/postService';

import AdminApproval from './AdminApproval';
import AdminProfile from './AdminProfile';
import AdminReports from './AdminReports';
import CustomerPostList from '../customer/CustomerPostList';

const Tab = createBottomTabNavigator();

const AdminDashboard = () => {
    const insets = useSafeAreaInsets();
    const { colors, isDark } = useAppTheme();
    const { t } = useTranslation();
    // Open-report badge. useNotificationSync invalidates REPORTS_KEY on the
    // socket event; the interval is the fallback for a missed one.
    const { data: openReports = 0 } = useQuery({
        queryKey: [...REPORTS_KEY, 'count'],
        queryFn: reportService.countOpen,
        refetchInterval: 60 * 1000,
    });
    // Queue-depth badge. Same key and fetcher as AdminApproval, so the two
    // share one cache entry and the socket's `['admin']` invalidation moves
    // both. The more urgent of the two queues was the one with no count.
    const { data: pendingPosts = 0 } = useQuery({
        queryKey: ['admin', 'stats'],
        queryFn: async () => (await postService.getAdminStats()).data,
        staleTime: 30 * 1000,
        refetchInterval: 60 * 1000,
        select: (stats) => stats?.totals?.pending ?? 0,
    });

    return (
        <SafeAreaProvider>
            <StatusBar style={isDark ? 'light' : 'dark'} backgroundColor={colors.surface} translucent={false} />

            <Tab.Navigator
                screenOptions={({ route }) => ({
                    tabBarIcon: ({ focused, color, size }) => {
                        const icons = {
                            Browse: focused ? 'list' : 'list-outline',
                            Approval: focused ? 'shield-checkmark' : 'shield-checkmark-outline',
                            Reports: focused ? 'flag' : 'flag-outline',
                            Profile: focused ? 'person' : 'person-outline',
                        };
                        return <Ionicons name={icons[route.name]} size={size} color={color} />;
                    },
                    tabBarActiveTintColor: colors.primary,
                    tabBarInactiveTintColor: colors.text.tertiary,
                    headerShown: false,
                    // Laid out, not `position: 'absolute'`: overlaid, it hid the
                    // last row of every tab list that forgot to pad for it.
                    tabBarStyle: {
                        ...colors.elevation.md,
                        height: Platform.OS === 'ios' ? 88 : 65 + insets.bottom,
                        paddingBottom: Platform.OS === 'ios' ? spacing.xxl : spacing.sm + insets.bottom,
                        paddingTop: spacing.xs,
                        backgroundColor: colors.surface,
                        borderTopWidth: 1,
                        borderTopColor: colors.border.light,
                    },
                    // Same as the provider bar: the padding comes off the item so the
                    // label keeps its width.
                    tabBarItemStyle: { paddingVertical: spacing.xs, paddingHorizontal: spacing.xxs },
                    tabBarLabelStyle: { ...typography.styles.micro, marginTop: spacing.xs },
                    tabBarHideOnKeyboard: Platform.OS === 'android',
                })}
                safeAreaInsets={{ bottom: Platform.OS === 'android' ? insets.bottom : 0 }}
            >
                <Tab.Screen
                    name="Browse"
                    component={CustomerPostList}
                    options={{ tabBarLabel: t('nav.browse') }}
                />
                <Tab.Screen
                    name="Approval"
                    component={AdminApproval}
                    options={{ tabBarLabel: t('admin.pendingPostsShort'), tabBarBadge: pendingPosts > 0 ? pendingPosts : undefined }}
                />
                <Tab.Screen
                    name="Reports"
                    component={AdminReports}
                    options={{ tabBarLabel: t('report.queue'), tabBarBadge: openReports > 0 ? openReports : undefined }}
                />
                <Tab.Screen
                    name="Profile"
                    component={AdminProfile}
                    options={{ tabBarLabel: t('nav.profile') }}
                />
            </Tab.Navigator>
        </SafeAreaProvider>
    );
};

export default AdminDashboard;

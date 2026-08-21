import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { Platform, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useTranslation } from 'react-i18next';
import { useAppTheme } from '../../hooks/useAppTheme';
import { spacing, typography } from '../../design/theme';

import CustomerPostList from './CustomerPostList';
import CustomerProfile from './CustomerProfile';
import CustomerMapView from './CustomerMapView';
import CustomerLikeList from '../customer/CustomerLikeList';

const Tab = createBottomTabNavigator();

const CustomerDashboard = () => {
    const insets = useSafeAreaInsets();
    const { colors, isDark } = useAppTheme();
    const { t } = useTranslation();

    return (
        <SafeAreaProvider>
            {Platform.OS === 'android' && (
                <View style={{ height: 0, backgroundColor: colors.surface, position: 'absolute', top: 0, left: 0, right: 0, zIndex: 1000 }} />
            )}
            <StatusBar style={isDark ? 'light' : 'dark'} backgroundColor={colors.surface} translucent={false} />

            <Tab.Navigator
                screenOptions={({ route }) => ({
                    tabBarIcon: ({ focused, color, size }) => {
                        let iconName;
                        if (route.name === 'AllPosts') {
                            iconName = focused ? 'list' : 'list-outline';
                        } else if (route.name === 'Saved') {
                            iconName = focused ? 'heart' : 'heart-outline';
                        } else if (route.name === 'Map') {
                            iconName = focused ? 'map' : 'map-outline';
                        } else if (route.name === 'Profile') {
                            iconName = focused ? 'person' : 'person-outline';
                        }
                        return <Ionicons name={iconName} size={size} color={color} />;
                    },
                    tabBarActiveTintColor: colors.primary,
                    tabBarInactiveTintColor: colors.text.tertiary,
                    headerShown: false,
                    tabBarStyle: {
                        ...colors.elevation.md,
                        height: Platform.OS === 'ios' ? 88 : 65 + insets.bottom,
                        paddingBottom: Platform.OS === 'ios' ? 25 : spacing.sm + insets.bottom,
                        paddingTop: spacing.xs,
                        backgroundColor: colors.surface,
                        borderTopWidth: 1,
                        borderTopColor: colors.border.light,
                        position: 'absolute',
                        bottom: 0,
                        left: 0,
                        right: 0,
                    },
                    tabBarItemStyle: { paddingVertical: spacing.xs, paddingHorizontal: spacing.sm },
                    tabBarLabelStyle: { ...typography.styles.micro, marginTop: spacing.xs },
                    tabBarHideOnKeyboard: Platform.OS === 'android',
                })}
                safeAreaInsets={{ bottom: Platform.OS === 'android' ? insets.bottom : 0 }}
            >
                <Tab.Screen name="AllPosts" component={CustomerPostList} options={{ tabBarLabel: t('nav.browse') }} />
                <Tab.Screen name="Saved" component={CustomerLikeList} options={{ tabBarLabel: t('nav.saved') }} />
                <Tab.Screen name="Map" component={CustomerMapView} options={{ tabBarLabel: t('nav.map') }} />
                <Tab.Screen name="Profile" component={CustomerProfile} options={{ tabBarLabel: t('nav.profile') }} />
            </Tab.Navigator>
        </SafeAreaProvider>
    );
};

export default CustomerDashboard;

import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';
import { TouchableOpacity, View, Platform, StyleSheet } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useTranslation } from 'react-i18next';
import { useAppTheme } from '../../hooks/useAppTheme';
import { spacing, shadows, typography, radius, interactions } from '../../design/theme';

import ProviderPostList from './ProviderPostList';
import ProviderProfile from './ProviderProfile';

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

const EmptyScreen = () => null;

const CreatePostButton = ({ navigation, colors }) => {
    const handleCreatePress = () => {
        navigation.navigate('CategorySelectScreen', { role: 'provider' });
    };

    return (
        <TouchableOpacity
            onPress={handleCreatePress}
            style={styles.createButtonContainer}
            activeOpacity={interactions.activeOpacity}
        >
            <View style={[styles.createButton, { backgroundColor: colors.primary }]}>
                <Ionicons name="add" size={28} color={colors.onPrimary} />
            </View>
        </TouchableOpacity>
    );
};

const PostsStack = ({ navigation: stackNavigation }) => {
    const { colors } = useAppTheme();
    const tabNavigation = stackNavigation.getParent();

    React.useEffect(() => {
        if (!tabNavigation) return;
        const unsubscribe = tabNavigation.addListener('tabPress', (e) => {
            const state = stackNavigation.getState();
            if (state && state.index > 0) {
                e.preventDefault();
                stackNavigation.navigate('PostsList');
            }
        });
        return unsubscribe;
    }, [tabNavigation, stackNavigation]);

    return (
        <Stack.Navigator screenOptions={{ headerShown: false, cardStyle: { backgroundColor: colors.background } }}>
            <Stack.Screen name="PostsList" component={ProviderPostList} />
        </Stack.Navigator>
    );
};

const ProviderDashboard = ({ navigation }) => {
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
                        if (route.name === 'Posts') {
                            iconName = focused ? 'list' : 'list-outline';
                        } else if (route.name === 'Create') {
                            return null;
                        } else if (route.name === 'Profile') {
                            iconName = focused ? 'person' : 'person-outline';
                        }
                        return <Ionicons name={iconName} size={size} color={color} />;
                    },
                    tabBarActiveTintColor: colors.primary,
                    tabBarInactiveTintColor: colors.text.tertiary,
                    headerShown: false,
                    tabBarStyle: {
                        height: Platform.OS === 'ios' ? 88 : 65 + insets.bottom,
                        paddingBottom: Platform.OS === 'ios' ? spacing.md : spacing.sm + insets.bottom,
                        paddingTop: spacing.xs,
                        backgroundColor: colors.surface,
                        borderTopWidth: 1,
                        borderTopColor: colors.border.light,
                        ...shadows.medium,
                    },
                    tabBarItemStyle: { paddingVertical: spacing.xs, paddingHorizontal: spacing.sm },
                    tabBarLabelStyle: { fontSize: typography.xs, fontWeight: '500', marginTop: spacing.xs },
                    tabBarHideOnKeyboard: Platform.OS === 'android',
                })}
                safeAreaInsets={{ bottom: Platform.OS === 'android' ? insets.bottom : 0 }}
            >
                <Tab.Screen
                    name="Posts"
                    component={PostsStack}
                    options={{ tabBarLabel: t('nav.myPosts') }}
                />
                <Tab.Screen
                    name="Create"
                    component={EmptyScreen}
                    options={{
                        tabBarLabel: '',
                        tabBarButton: (props) => (
                            <CreatePostButton navigation={navigation} colors={colors} {...props} />
                        ),
                    }}
                />
                <Tab.Screen
                    name="Profile"
                    component={ProviderProfile}
                    options={{ tabBarLabel: t('nav.profile') }}
                />
            </Tab.Navigator>
        </SafeAreaProvider>
    );
};

const styles = StyleSheet.create({
    createButtonContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'transparent',
        marginBottom: Platform.OS === 'android' ? spacing.xs : 0,
    },
    createButton: {
        width: 56,
        height: 56,
        borderRadius: radius.xxxl,
        justifyContent: 'center',
        alignItems: 'center',
        ...shadows.medium,
    },
});

export default ProviderDashboard;

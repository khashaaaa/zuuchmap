import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';
import { View, Platform, StyleSheet } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useTranslation } from 'react-i18next';
import { useAppTheme } from '../../hooks/useAppTheme';
import PressableScale from '../../components/PressableScale';
import { spacing, typography, radius } from '../../design/theme';

import ProviderPostList from './ProviderPostList';
import ProviderProfile from './ProviderProfile';
// A provider is a customer too — for renting the machine they do not own, for
// hiring the crew they do not employ. The bar used to be Posts/Create/Profile,
// which left an account that had chosen "Зар нийтлэгч" with no route to any
// listing but its own: no browse, so no thread, no booking, no saved search.
// The web has always had `/browse` open to every signed-in user.
import CustomerPostList from '../customer/CustomerPostList';
import MessagesScreen from '../shared/MessagesScreen';
import { useUnreadMessages } from '../../services/api/messageService';


// A tab count: hidden at zero, capped like the web sidebar so a deep queue
// cannot widen the pill across the icon.
const tabBadge = (n) => (n > 0 ? (n > 99 ? '99+' : n) : undefined);
const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

const EmptyScreen = () => null;

const CreatePostButton = ({ navigation, colors }) => {
    const { t } = useTranslation();
    const handleCreatePress = () => {
        navigation.navigate('CategorySelectScreen', { role: 'provider' });
    };

    return (
        <PressableScale
            onPress={handleCreatePress}
            style={styles.createButtonContainer}
            accessibilityRole="button"
            accessibilityLabel={t('posts.createNew')}
        >
            <View style={[styles.createButton, colors.elevation.md, { backgroundColor: colors.primary }]}>
                <Ionicons name="add" size={28} color={colors.onPrimary} />
            </View>
        </PressableScale>
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
    const unread = useUnreadMessages();
    const { colors, isDark } = useAppTheme();
    const { t } = useTranslation();

    return (
        <SafeAreaProvider>
            <StatusBar style={isDark ? 'light' : 'dark'} backgroundColor={colors.surface} translucent={false} />

            <Tab.Navigator
                // Browse sits first so the FAB is the middle of five, but a provider
                // opening the app still lands on their own listings.
                initialRouteName="Posts"
                screenOptions={({ route }) => ({
                    tabBarIcon: ({ focused, color, size }) => {
                        let iconName;
                        if (route.name === 'Browse') {
                            iconName = focused ? 'search' : 'search-outline';
                        } else if (route.name === 'Posts') {
                            iconName = focused ? 'list' : 'list-outline';
                        } else if (route.name === 'Create') {
                            return null;
                        } else if (route.name === 'Messages') {
                            iconName = focused ? 'chatbubbles' : 'chatbubbles-outline';
                        } else if (route.name === 'Profile') {
                            iconName = focused ? 'person' : 'person-outline';
                        }
                        return <Ionicons name={iconName} size={size} color={color} />;
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
                    // Five slots, so the horizontal padding comes off the item
                    // rather than the label: at spacing.sm "Миний зарууд"
                    // ellipsised on a 6.5" phone.
                    tabBarItemStyle: { paddingVertical: spacing.xs, paddingHorizontal: spacing.xxs },
                    tabBarLabelStyle: { ...typography.styles.micro, marginTop: spacing.xs },
                    // The same badge as ProfileActionRow's, not the platform's red.
                    tabBarBadgeStyle: { ...typography.styles.badge, includeFontPadding: false, textAlignVertical: 'center', lineHeight: 18, backgroundColor: colors.danger, color: colors.text.onColor },
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
                    name="Posts"
                    component={PostsStack}
                    options={{ tabBarLabel: t('nav.myPostsShort') }}
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
                    name="Messages"
                    component={MessagesScreen}
                    options={{ tabBarLabel: t('messages.title'), tabBarBadge: tabBadge(unread) }}
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
    },
});

export default ProviderDashboard;

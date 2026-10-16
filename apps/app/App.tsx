import { useEffect, useRef, useState } from 'react';
import { Animated, Platform, StyleSheet, View } from 'react-native';
import { motion } from '@zuuchmap/tokens';
import { StatusBar } from 'expo-status-bar';
import * as NavigationBar from 'expo-navigation-bar';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { NavigationContainer, DefaultTheme, DarkTheme, useNavigationContainerRef } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { notificationTarget, type NotificationKind, type NotificationData } from '@zuuchmap/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nextProvider } from 'react-i18next';
import i18n from './src/i18n';
import { ThemeProvider, useAppTheme } from './src/design/theme';
import { Kit } from './src/screens/Kit';
import { PushPromptHost } from './src/ui/PushPromptSheet';
import { Toaster } from './src/ui/Toast';
import { NavigationTabBar } from './src/ui/TabBar';
import { api, ApiError } from './src/lib/api';
import { loadRecent } from './src/lib/browse';
import { loadLocale } from './src/lib/locale';
import { openTarget, usePlanUsage, useUnreadCount } from './src/lib/notifications';
import { usePushSync } from './src/lib/push';
import { useRealtime } from './src/lib/realtime';
import { loadGuestSaved } from './src/lib/saved';
import type { RootStackParamList, TabParamList } from './src/nav';
import { BlockDays } from './src/screens/provider/BlockDays';
import { BookingValueScreen } from './src/screens/provider/BookingValue';
import { CompanyScreen } from './src/screens/provider/Company';
import { ProviderHomeScreen } from './src/screens/provider/Home';
import { MyListings } from './src/screens/provider/MyListings';
import { Performance } from './src/screens/provider/Performance';
import { ProviderProfile } from './src/screens/provider/ProviderProfile';
import { Wizard } from './src/screens/provider/Wizard';
import { getToken, loadAuth, patchUser, useAuth } from './src/lib/auth';
import { Browse } from './src/screens/customer/Browse';
import { BecomeProvider } from './src/screens/customer/BecomeProvider';
import { CategoryPicker, SubcategoryPicker } from './src/screens/customer/CategoryPicker';
import { Gallery } from './src/screens/customer/Gallery';
import { ListingDetail } from './src/screens/customer/ListingDetail';
import { Messages } from './src/screens/customer/Messages';
import { Profile } from './src/screens/customer/Profile';
import { Saved } from './src/screens/customer/Saved';
import { SignIn } from './src/screens/customer/SignIn';
import { AuthSheetProvider } from './src/screens/customer/SignInFlow';
import { Sos } from './src/screens/customer/Sos';
import { BookingRequests } from './src/screens/deal/BookingRequests';
import { MyBookings } from './src/screens/deal/MyBookings';
import { Reviews } from './src/screens/deal/Reviews';
import { Seller } from './src/screens/deal/Seller';
import { Thread } from './src/screens/deal/Thread';
import { NotificationSettings } from './src/screens/shared/NotificationSettings';
import { Notifications as NotificationCentre } from './src/screens/shared/Notifications';
import { useReduceMotion } from './src/ui/useReduceMotion';

// One native splash on the theme ground; hidden with a 200 ms crossfade once fonts are in.
void SplashScreen.preventAutoHideAsync();
SplashScreen.setOptions({ duration: 200, fade: true });

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // A client error will not get better on retry; a dropped connection might.
      retry: (count, e) => count < 1 && !(e instanceof ApiError && e.status >= 400 && e.status < 500),
    },
  },
});
const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();
const TAB_ROUTES: readonly string[] = ['browse', 'saved', 'messages', 'profile', 'home', 'myPosts', 'add'];
const Nothing = () => null;

/** Tab screens cross-fade; none under reduce-motion. */
function useTabOptions() {
  const reduce = useReduceMotion();
  return { headerShown: false, animation: reduce ? 'none' : 'fade' } as const;
}

function CustomerTabs() {
  const unread = useUnreadCount().data ?? 0;
  const options = useTabOptions();
  return (
    <Tab.Navigator tabBar={(p) => <NavigationTabBar {...p} preset="customer" counts={{ messages: unread }} />} screenOptions={options}>
      <Tab.Screen name="browse" component={Browse} />
      <Tab.Screen name="saved" component={Saved} />
      <Tab.Screen name="messages" component={Messages} />
      <Tab.Screen name="profile" component={Profile} />
    </Tab.Navigator>
  );
}

/** The centre "+" is an action, not a screen: pressing it opens the wizard. */
function ProviderTabs() {
  const unread = useUnreadCount().data ?? 0;
  const plan = usePlanUsage().data;
  const options = useTabOptions();
  return (
    <Tab.Navigator
      tabBar={(p) => <NavigationTabBar {...p} preset="provider" counts={{ messages: unread }} quota={plan ? { used: Math.min(plan.active_posts, plan.post_limit), total: plan.post_limit } : undefined} />}
      screenOptions={options}
    >
      <Tab.Screen name="home" component={ProviderHomeScreen} />
      <Tab.Screen name="myPosts" component={MyListings} />
      <Tab.Screen
        name="add"
        component={Nothing}
        listeners={({ navigation }) => ({
          tabPress: (e) => {
            e.preventDefault();
            navigation.getParent()?.navigate('Wizard');
          },
        })}
      />
      <Tab.Screen name="messages" component={Messages} />
      <Tab.Screen name="profile" component={ProviderProfile} />
    </Tab.Navigator>
  );
}

/** Providers get their own shell; everyone else (guests included) keeps the customer tabs. */
function RoleTabs() {
  return useAuth().user?.type === 'PROVIDER' ? <ProviderTabs /> : <CustomerTabs />;
}

const FONTS = {
  'Geologica-Regular': require('@zuuchmap/tokens/fonts/Geologica-Regular.ttf'),
  'Geologica-Medium': require('@zuuchmap/tokens/fonts/Geologica-Medium.ttf'),
  'Geologica-SemiBold': require('@zuuchmap/tokens/fonts/Geologica-SemiBold.ttf'),
  'Geologica-Bold': require('@zuuchmap/tokens/fonts/Geologica-Bold.ttf'),
  'Geologica-ExtraBold': require('@zuuchmap/tokens/fonts/Geologica-ExtraBold.ttf'),
};

/** On a theme switch the old ground covers the repaint in the same commit, then fades off it. */
function ThemeFade({ color }: { color: string }) {
  const reduce = useReduceMotion();
  const [fade, setFade] = useState<{ color: string; from: string | null; opacity: Animated.Value }>(() => ({ color, from: null, opacity: new Animated.Value(1) }));
  if (fade.color !== color) setFade({ color, from: reduce ? null : fade.color, opacity: new Animated.Value(1) });
  useEffect(() => {
    if (!fade.from) return;
    Animated.timing(fade.opacity, { toValue: 0, duration: motion.durationSlow, useNativeDriver: true }).start(() => setFade((f) => (f.opacity === fade.opacity ? { ...f, from: null } : f)));
  }, [fade.from, fade.opacity]);
  return fade.from ? <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: fade.from, opacity: fade.opacity }]} /> : null;
}

function Root() {
  const { colors, isDark } = useAppTheme();
  // Three-button nav bar: transparent (enforceContrast off in app.json), so its buttons follow the theme.
  useEffect(() => {
    if (Platform.OS === 'android') NavigationBar.setStyle(isDark ? 'light' : 'dark');
  }, [isDark]);
  const [loaded, fontError] = useFonts(FONTS);
  const ready = loaded || !!fontError;
  const navRef = useNavigationContainerRef<RootStackParamList>();
  const [onTabs, setOnTabs] = useState(true);
  useRealtime();
  usePushSync();

  // A tapped notification (also the one that cold-started the app) goes to its target and is marked read.
  const last = Notifications.useLastNotificationResponse();
  const [navReady, setNavReady] = useState(false);
  const { ready: authReady } = useAuth();
  const handled = useRef<string | null>(null);
  useEffect(() => {
    if (!last || !navReady || !authReady) return;
    const id = `${last.notification.request.identifier}|${last.notification.date}`;
    if (handled.current === id) return;
    handled.current = id;
    const d = last.notification.request.content.data as { notification_id?: string | null; kind?: NotificationKind; data?: NotificationData } | null;
    if (!d?.kind) return;
    if (d.notification_id) api(`/notifications/${d.notification_id}/read`, { method: 'PUT' }).then(() => queryClient.invalidateQueries({ queryKey: ['badges'] })).catch(() => undefined);
    openTarget(navRef as unknown as Parameters<typeof openTarget>[0], notificationTarget({ kind: d.kind, data: d.data ?? {} }));
  }, [last, navReady, authReady, navRef]);

  // Startup never waits on the network: stored session, device saves, recents and locale are local reads.
  useEffect(() => {
    void Promise.all([loadAuth(), loadGuestSaved(), loadRecent(), loadLocale()]).then(() => {
      // a 401 signs out inside `api`; the role may have changed on another device
      if (getToken()) api<{ type: 'PROVIDER' | 'CUSTOMER' | null }>('/user/profile').then((u) => patchUser({ type: u.type })).catch(() => undefined);
    });
  }, []);

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  const base = isDark ? DarkTheme : DefaultTheme;
  return (
    // Themed ground behind the navigator: no white flash on dark.
    <View style={{ flex: 1, backgroundColor: colors.bgCanvas }}>
      <AuthSheetProvider>
      <NavigationContainer ref={navRef} onReady={() => setNavReady(true)} onStateChange={() => setOnTabs(TAB_ROUTES.includes(navRef.getCurrentRoute()?.name ?? 'browse'))} theme={{ ...base, colors: { ...base.colors, background: colors.bgCanvas, card: colors.bgSurface, text: colors.textPrimary, border: colors.borderDefault, primary: colors.textLink } }}>
        <Stack.Navigator screenOptions={{ headerShown: false, gestureEnabled: Platform.OS === 'ios', contentStyle: { backgroundColor: colors.bgCanvas } }}>
          <Stack.Screen name="Tabs" component={RoleTabs} />
          <Stack.Screen name="ListingDetail" component={ListingDetail} />
          <Stack.Screen name="Gallery" component={Gallery} options={{ animation: 'fade' }} />
          <Stack.Screen name="Sos" component={Sos} />
          <Stack.Screen name="SignIn" component={SignIn} />
          <Stack.Screen name="CategoryPicker" component={CategoryPicker} />
          <Stack.Screen name="SubcategoryPicker" component={SubcategoryPicker} />
          <Stack.Screen name="BecomeProvider" component={BecomeProvider} />
          <Stack.Screen name="MyBookings" component={MyBookings} />
          <Stack.Screen name="BookingRequests" component={BookingRequests} />
          <Stack.Screen name="Thread" component={Thread} />
          <Stack.Screen name="Seller" component={Seller} />
          <Stack.Screen name="Reviews" component={Reviews} />
          <Stack.Screen name="Wizard" component={Wizard} />
          <Stack.Screen name="BlockDays" component={BlockDays} />
          <Stack.Screen name="Performance" component={Performance} />
          <Stack.Screen name="BookingValue" component={BookingValueScreen} />
          <Stack.Screen name="Company" component={CompanyScreen} />
          <Stack.Screen name="Notifications" component={NotificationCentre} />
          <Stack.Screen name="NotificationSettings" component={NotificationSettings} />
          <Stack.Screen name="Kit" component={Kit} />
        </Stack.Navigator>
      </NavigationContainer>
      </AuthSheetProvider>
      <PushPromptHost />
      <Toaster aboveTabBar={onTabs} />
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <ThemeFade color={colors.bgCanvas} />
    </View>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <I18nextProvider i18n={i18n}>
            <ThemeProvider>
              <Root />
            </ThemeProvider>
          </I18nextProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

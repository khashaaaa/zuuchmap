import React, { useState, useEffect, useRef } from 'react';
import { QueryClientProvider, focusManager } from '@tanstack/react-query';
import { NavigationContainer } from '@react-navigation/native';
import { navigationRef } from './src/utils/navigationUtils';
import { createStackNavigator } from '@react-navigation/stack';
import { View, ActivityIndicator, Text, StyleSheet, Platform, Animated, AppState } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import userService from './src/services/api/userService';
import { queryClient, invalidatePostData } from './src/services/queryClient';
import { palettes, dimensions, typography, spacing, fonts, animations } from './src/design/theme';

// Splash and the pre-provider loading screen render before AppContext
// (and the stored theme preference) is available — they commit to dark.
const colors = palettes.dark;
import { useAppTheme } from './src/hooks/useAppTheme';
import CustomSafeAreaView from './src/components/CustomSafeAreaView';
import { getUserInfo, getUserType, getAuthToken } from './src/services/api/authHelpers';

const SplashStart = ({ onFinish }) => {
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.sequence([
      Animated.timing(opacity, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.delay(900),
      Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start(onFinish);
  }, []);
  return (
    <View style={splashStyles.container}>
      <Animated.View style={{ opacity, alignItems: 'center' }}>
        <Text style={splashStyles.title}>ZuuchMap</Text>
        <Text style={splashStyles.subtitle}>Барилгын зах зээл</Text>
      </Animated.View>
    </View>
  );
};

const splashStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 36,
    fontFamily: fonts.extrabold,
    color: colors.primary,
    letterSpacing: 1,
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: typography.md,
    color: colors.text.secondary,
    letterSpacing: 0.5,
  },
});
import { getDashboardScreen } from './src/utils/navigationUtils';
import { logger } from './src/utils/logger';
import { resolveNotificationRoute, notificationTouches } from './src/utils/notificationRouting';
import { AppProvider } from './src/context/AppContext';
import { useNotificationSync } from './src/hooks/useNotificationSync';
import { socketService } from './src/services/socketService';
import { reportError } from './src/services/analytics';
import { useFonts } from 'expo-font';
import { fontAssets } from './src/design/theme';
import './src/i18n'; // initialize i18next

if (global.ErrorUtils) {
  const prevHandler = global.ErrorUtils.getGlobalHandler();
  global.ErrorUtils.setGlobalHandler((error, isFatal) => {
    // logger is compiled out of release builds, so reportError is the only way
    // a crash on a real user's phone ever reaches us.
    logger.error(`Uncaught JS error [fatal=${isFatal}]: ${error?.message}`);
    reportError(error, isFatal ? 'global.fatal' : 'global.nonfatal');
    prevHandler?.(error, isFatal);
  });
}

try {
  Notifications.setNotificationHandler({
    handleNotification: async () => {
      // While the realtime socket is live the same event already lands in the
      // in-app bell — suppress the duplicate OS banner. Backgrounded (or
      // disconnected) the socket is down, so pushes surface normally.
      const realtimeLive = socketService.isConnected();
      return {
        shouldShowBanner: !realtimeLive,
        shouldShowList: true,
        shouldPlaySound: !realtimeLive,
        shouldSetBadge: false,
      };
    },
  });
} catch {
  // Expo Go does not support push notifications; silently skip
}

import PhoneNumber from './src/screens/auth/PhoneNumber';
import OtpVerification from './src/screens/auth/OtpVerification';
import UserRoleSelection from './src/screens/onboarding/UserRoleSelection';

import ProviderDashboard from './src/screens/provider/ProviderDashboard';
import ProviderLocationSelection from './src/screens/provider/ProviderLocationSelection';
import ProviderPostForm from './src/screens/provider/ProviderPostForm';
import EditProfileScreen from './src/screens/shared/EditProfileScreen';
import ProviderCompany from './src/screens/provider/ProviderCompany'

import CustomerDashboard from './src/screens/customer/CustomerDashboard';
import CustomerPostList from './src/screens/customer/CustomerPostList';
import CustomerLikeList from './src/screens/customer/CustomerLikeList';

import CategorySelectScreen from './src/screens/shared/CategorySelectScreen';
import SubcategorySelectScreen from './src/screens/shared/SubcategorySelectScreen';
import PostDetailScreen from './src/screens/shared/PostDetailScreen';
import PolicyScreen from './src/screens/shared/PolicyScreen';
import HelpSupportScreen from './src/screens/shared/HelpSupportScreen';
import NotificationsScreen from './src/screens/shared/NotificationsScreen';
import SavedSearchesScreen from './src/screens/customer/SavedSearchesScreen';
import BookingListScreen from './src/screens/shared/BookingListScreen';
import AccountDeletionScreen from './src/screens/shared/AccountDeletionScreen';
import ErrorModalManager from './src/components/ErrorModalManager';
import ErrorBoundary from './src/components/ErrorBoundary';
import { useTranslation } from 'react-i18next';
import OfflineBanner from './src/components/OfflineBanner';
import useOnline from './src/hooks/useOnline';
import useOtaUpdates from './src/hooks/useOtaUpdates';
import { initObservability } from './src/utils/observability';
import MessagesScreen from './src/screens/shared/MessagesScreen';
import MessageThreadScreen from './src/screens/shared/MessageThreadScreen';
import BillingScreen from './src/screens/provider/BillingScreen';

// Before the tree renders, so a crash during the first paint is still reported.
// No-op without SENTRY_DSN.
initObservability();

import AdminDashboard from './src/screens/admin/AdminDashboard';
import AdminPostList from './src/screens/admin/AdminPostList';

const Stack = createStackNavigator();

// Refetch stale queries when the app returns to the foreground
AppState.addEventListener('change', (state) => {
  focusManager.setFocused(state === 'active');
});

const App = () => {
  // Commissioner is bundled, so this resolves in milliseconds — but the JS
  // splash below is itself set in Commissioner, so we hold on the native splash
  // (return null) until it is registered rather than flashing a fallback face.
  // A load failure is not fatal: we report it and continue on the system font.
  const [fontsLoaded, fontError] = useFonts(fontAssets);

  const [showSplash, setShowSplash] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [authState, setAuthState] = useState({
    isAuthenticated: false,
    userType: null,
    isAdmin: false,
  });

  useEffect(() => {
    if (fontError) reportError(fontError, 'fonts.load');
  }, [fontError]);

  useEffect(() => {
    if (!showSplash) {
      checkAuthStatus();
    }
  }, [showSplash]);

  const handleSplashFinish = () => {
    setShowSplash(false);
  };

  const checkAuthStatus = async () => {
    try {
      const storedUserInfo = await getUserInfo();
      const storedUserType = await getUserType();
      const storedToken = await getAuthToken();

      const storedIsAdmin = storedUserInfo?.is_admin === true;

      if (storedUserInfo && !storedToken) {
        setAuthState({
          isAuthenticated: false,
          userType: storedUserType,
          isAdmin: storedIsAdmin,
        });
        setIsLoading(false);
        return;
      }

      if (storedToken) {
        try {
          const authResult = await userService.isAuthenticated();

          if (authResult?.authenticated) {
            setAuthState({
              isAuthenticated: true,
              userType: authResult.userType || null,
              isAdmin: storedIsAdmin,
            });
            // Push-token registration lives in useNotificationSync — it runs on
            // this same startup path AND on fresh logins (auth events).
          } else if (authResult?.rateLimited) {
            setAuthState({
              isAuthenticated: false,
              userType: null,
              isAdmin: false,
            });
          } else {
            setAuthState({
              isAuthenticated: false,
              userType: storedUserType,
              isAdmin: storedIsAdmin,
            });
          }
        } catch (error) {
          logger.error('Auth verification error:', error);
          setAuthState({
            isAuthenticated: false,
            userType: storedUserType,
            isAdmin: storedIsAdmin,
          });
        }
      } else {
        setAuthState({
          isAuthenticated: false,
          userType: storedUserType,
          isAdmin: storedIsAdmin,
        });
      }
    } catch (error) {
      logger.error('Auth check error:', error);
      setAuthState({
        isAuthenticated: false,
        userType: null,
        isAdmin: false,
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    let receivedSub, responseSub;

    const handleNotificationResponse = (response) => {
      const data = response.notification.request.content.data ?? {};
      const touches = notificationTouches(data);
      if (touches.bookings) queryClient.invalidateQueries({ queryKey: ['bookings'] });
      if (touches.posts) invalidatePostData();

      const route = resolveNotificationRoute(data);
      if (!route || !navigationRef.isReady()) return;
      navigationRef.navigate(route.screen, route.params);
    };

    try {
      receivedSub = Notifications.addNotificationReceivedListener((notification) => {
        // App is foregrounded when notification arrives
        const data = notification.request.content.data ?? {};
        const touches = notificationTouches(data);
        if (touches.bookings) queryClient.invalidateQueries({ queryKey: ['bookings'] });
        if (touches.posts) invalidatePostData();
      });

      responseSub = Notifications.addNotificationResponseReceivedListener(handleNotificationResponse);

      // Handle a notification tap that launched the app from a killed state
      Notifications.getLastNotificationResponseAsync().then((response) => {
        if (response) handleNotificationResponse(response);
        // Rejects rather than throws where the native module is absent (web,
        // Expo Go), so the surrounding try/catch cannot see it — an unhandled
        // rejection surfaced in the console on every web mount.
      }).catch(() => {});
    } catch {
      // Not available in Expo Go
    }
    return () => {
      receivedSub?.remove();
      responseSub?.remove();
    };
  }, []);

  const getInitialRoute = () => {
    const { isAuthenticated, userType, isAdmin } = authState;

    if (isAuthenticated && userType) {
      return getDashboardScreen(userType, isAdmin);
    }

    if (isAuthenticated && !userType) {
      return 'UserRoleSelection';
    }

    return 'PhoneNumber';
  };

  if (!fontsLoaded && !fontError) return null;

  if (showSplash) {
    return <SplashStart onFinish={handleSplashFinish} />;
  }

  if (isLoading) {
    // Rendered before AppProvider mounts — must stay free of theme-hook
    // components (CustomSafeAreaView calls useAppTheme and would throw here).
    return (
      <SafeAreaProvider>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Ачаалж байна...</Text>
        </View>
      </SafeAreaProvider>
    );
  }

  const initialRoute = getInitialRoute();

  return (
    <QueryClientProvider client={queryClient}>
    <AppProvider>
    <SafeAreaProvider>
      <ThemedApp initialRoute={initialRoute} />
    </SafeAreaProvider>
    </AppProvider>
    </QueryClientProvider>
  );
};

const ThemedApp = ({ initialRoute }) => {
  const { colors, isDark } = useAppTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const online = useOnline();
  useNotificationSync();
  // Fetches a JavaScript update in the background and applies it the next time
  // the app comes back from the background — never mid-form.
  useOtaUpdates();
  return (
    <>
      {Platform.OS === 'android' && (
        <View style={{
          height: dimensions.statusBarHeight,
          backgroundColor: colors.surface,
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 1000,
        }} />
      )}
      <StatusBar style={isDark ? 'light' : 'dark'} backgroundColor={colors.surface} translucent={false} />

      {/* One connectivity bar for the whole app, matching the web's AppLayout.
          It sits in the flex flow above the navigator so it pushes screens down
          rather than covering a header. Android already clears the status bar
          via the filler above and `translucent={false}`; iOS does not, so the
          banner carries the top inset itself when it is the topmost element. */}
      <OfflineBanner
        visible={!online}
        message={t('offline.noConnection')}
        style={Platform.OS === 'ios' ? { paddingTop: insets.top + spacing.sm } : undefined}
      />

      <ErrorBoundary>
        <NavigationContainer ref={navigationRef}>
          <Stack.Navigator
            initialRouteName={initialRoute}
            screenOptions={{
              headerShown: false,
              cardStyle: { backgroundColor: colors.background },
              // Screen transitions were the platform default with no declared
              // timing; drive them from the motion tokens so a push feels like
              // the same system as a press or a list entrance.
              animation: 'slide_from_right',
              animationDuration: animations.duration.slow,
              gestureEnabled: true,
            }}
          >
            <Stack.Screen name="PhoneNumber" component={PhoneNumber} />
            <Stack.Screen name="OtpVerification" component={OtpVerification} />
            <Stack.Screen name="UserRoleSelection" component={UserRoleSelection} />

            <Stack.Screen name="ProviderDashboard" component={ProviderDashboard} />
            <Stack.Screen name="ProviderLocationSelection" component={ProviderLocationSelection} />
            <Stack.Screen name="ProviderPostCreate" component={ProviderPostForm} />
            <Stack.Screen name="ProviderPostEdit" component={ProviderPostForm} />
            <Stack.Screen name="ProviderEditProfile" component={EditProfileScreen} />
            <Stack.Screen name="ProviderCompanyCreate" component={ProviderCompany} />
            <Stack.Screen name="ProviderCompany" component={ProviderCompany} />

            <Stack.Screen name="CustomerDashboard" component={CustomerDashboard} />
            <Stack.Screen name="CustomerEditProfile" component={EditProfileScreen} />
            <Stack.Screen name="CustomerPostList" component={CustomerPostList} />
            <Stack.Screen name="CustomerLikeList" component={CustomerLikeList} />
            <Stack.Screen name="SavedSearches" component={SavedSearchesScreen} />


            <Stack.Screen name="CategorySelectScreen" component={CategorySelectScreen} />
            <Stack.Screen name="SubcategorySelectScreen" component={SubcategorySelectScreen} />
            <Stack.Screen name="PostDetailScreen" component={PostDetailScreen} />
            <Stack.Screen name="PrivacyPolicy" component={PolicyScreen} initialParams={{ doc: 'privacy' }} />
            <Stack.Screen name="Terms" component={PolicyScreen} initialParams={{ doc: 'terms' }} />
            <Stack.Screen name="HelpSupport" component={HelpSupportScreen} />
            <Stack.Screen name="Notifications" component={NotificationsScreen} />
            <Stack.Screen name="BookingList" component={BookingListScreen} />
            <Stack.Screen name="AccountDeletion" component={AccountDeletionScreen} />
            {/* Messaging belongs to neither role — a thread has a customer and
                a provider, and both open it from here. */}
            <Stack.Screen name="Messages" component={MessagesScreen} />
            <Stack.Screen name="MessageThread" component={MessageThreadScreen} />
            <Stack.Screen name="Billing" component={BillingScreen} />

            <Stack.Screen name="AdminDashboard" component={AdminDashboard} />
            <Stack.Screen name="AdminPostList" component={AdminPostList} />
          </Stack.Navigator>
        </NavigationContainer>
      </ErrorBoundary>
      <ErrorModalManager />
    </>
  );
};

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: colors.text.secondary,
  },
});

export default App;
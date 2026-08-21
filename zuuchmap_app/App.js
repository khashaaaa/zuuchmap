import React, { useState, useEffect, useRef } from 'react';
import { QueryClientProvider, focusManager } from '@tanstack/react-query';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';

const navigationRef = createNavigationContainerRef();
import { createStackNavigator } from '@react-navigation/stack';
import { View, ActivityIndicator, Text, StyleSheet, Platform, Animated, AppState } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import userService from './src/services/api/userService';
import apiClient from './src/services/api/apiClient';
import { API_CONFIG } from './src/config/api.config';
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
import { AppProvider } from './src/context/AppContext';
import { useNotificationSync } from './src/hooks/useNotificationSync';
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
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
} catch {
  // Expo Go does not support push notifications; silently skip
}

async function registerForPushNotifications() {
  if (!Device.isDevice) return null;
  try {
    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;
    if (existing !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') return null;
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: '40d1a5b1-f537-4097-88f7-ffad9545f7d0',
    });
    return tokenData.data;
  } catch {
    // Push notifications not available in Expo Go
    return null;
  }
}

import PhoneNumber from './src/screens/auth/PhoneNumber';
import OtpVerification from './src/screens/auth/OtpVerification';
import UserRoleSelection from './src/screens/onboarding/UserRoleSelection';

import ProviderDashboard from './src/screens/provider/ProviderDashboard';
import ProviderLocationSelection from './src/screens/provider/ProviderLocationSelection';
import ProviderPostForm from './src/screens/provider/ProviderPostForm';
import ProviderProfile from './src/screens/provider/ProviderProfile';
import EditProfileScreen from './src/screens/shared/EditProfileScreen';
import ProviderCompany from './src/screens/provider/ProviderCompany'

import CustomerDashboard from './src/screens/customer/CustomerDashboard';
import CustomerProfile from './src/screens/customer/CustomerProfile';
import CustomerPostList from './src/screens/customer/CustomerPostList';
import CustomerLikeList from './src/screens/customer/CustomerLikeList';

import CategorySelectScreen from './src/screens/shared/CategorySelectScreen';
import SubcategorySelectScreen from './src/screens/shared/SubcategorySelectScreen';
import PostDetailScreen from './src/screens/shared/PostDetailScreen';
import PolicyScreen from './src/screens/shared/PolicyScreen';
import HelpSupportScreen from './src/screens/shared/HelpSupportScreen';
import NotificationsScreen from './src/screens/shared/NotificationsScreen';
import BookingListScreen from './src/screens/shared/BookingListScreen';
import AccountDeletionScreen from './src/screens/shared/AccountDeletionScreen';
import ErrorModalManager from './src/components/ErrorModalManager';
import ErrorBoundary from './src/components/ErrorBoundary';

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
            registerForPushNotifications().then(token => {
              if (token) {
                apiClient.put(API_CONFIG.ENDPOINTS.USER.SAVE_PUSH_TOKEN, { push_token: token })
                  .catch((err) => logger.warn?.('Push token registration failed:', err?.message));
              }
            });
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
      const data = response.notification.request.content.data;
      if (data?.bookingId) {
        queryClient.invalidateQueries({ queryKey: ['bookings'] });
        if (navigationRef.isReady()) {
          navigationRef.navigate('BookingList', {
            role: data.notifType === 'booking_requested' ? 'provider' : 'customer',
          });
        }
        return;
      }
      if (!data?.postId) return;
      invalidatePostData();
      if (!navigationRef.isReady()) return;
      if (data.notifType === 'new_post') {
        navigationRef.navigate('PostDetailScreen', { postId: data.postId, role: 'admin' });
      } else {
        navigationRef.navigate('PostDetailScreen', { postId: data.postId, role: 'provider' });
      }
    };

    try {
      receivedSub = Notifications.addNotificationReceivedListener((notification) => {
        // App is foregrounded when notification arrives
        const data = notification.request.content.data;
        if (data?.bookingId) {
          queryClient.invalidateQueries({ queryKey: ['bookings'] });
        } else if (data?.postId) {
          invalidatePostData();
        }
      });

      responseSub = Notifications.addNotificationResponseReceivedListener(handleNotificationResponse);

      // Handle a notification tap that launched the app from a killed state
      Notifications.getLastNotificationResponseAsync().then((response) => {
        if (response) handleNotificationResponse(response);
      });
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
  useNotificationSync();
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
            <Stack.Screen name="ProviderProfile" component={ProviderProfile} />
            <Stack.Screen name="ProviderEditProfile" component={EditProfileScreen} />
            <Stack.Screen name="ProviderCompanyCreate" component={ProviderCompany} />
            <Stack.Screen name="ProviderCompany" component={ProviderCompany} />

            <Stack.Screen name="CustomerDashboard" component={CustomerDashboard} />
            <Stack.Screen name="CustomerProfile" component={CustomerProfile} />
            <Stack.Screen name="CustomerEditProfile" component={EditProfileScreen} />
            <Stack.Screen name="CustomerPostList" component={CustomerPostList} />
            <Stack.Screen name="CustomerLikeList" component={CustomerLikeList} />


            <Stack.Screen name="CategorySelectScreen" component={CategorySelectScreen} />
            <Stack.Screen name="SubcategorySelectScreen" component={SubcategorySelectScreen} />
            <Stack.Screen name="PostDetailScreen" component={PostDetailScreen} />
            <Stack.Screen name="PrivacyPolicy" component={PolicyScreen} initialParams={{ doc: 'privacy' }} />
            <Stack.Screen name="Terms" component={PolicyScreen} initialParams={{ doc: 'terms' }} />
            <Stack.Screen name="HelpSupport" component={HelpSupportScreen} />
            <Stack.Screen name="Notifications" component={NotificationsScreen} />
            <Stack.Screen name="BookingList" component={BookingListScreen} />
            <Stack.Screen name="AccountDeletion" component={AccountDeletionScreen} />

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
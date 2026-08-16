import * as Device from 'expo-device';
import { Platform } from 'react-native';

export const getDashboardScreen = (userType, isAdmin = false) => {
    if (isAdmin) return 'AdminDashboard';
    return userType === 'PROVIDER' ? 'ProviderDashboard' : 'CustomerDashboard';
};

export const navigateToDashboard = (navigation, userType, isAdmin = false) => {
    navigation.reset({
        index: 0,
        routes: [{ name: getDashboardScreen(userType, isAdmin) }],
    });
};

export const navigateToPhoneNumber = (navigation) => {
    navigation.reset({
        index: 0,
        routes: [{ name: 'PhoneNumber' }],
    });
};

export const navigateToProviderPostList = (navigation) => {
    navigation.navigate('ProviderDashboard', { screen: 'Posts' });
};

export const getDeviceInfo = () => ({
    deviceId: Device.deviceName || Device.modelId || 'тодорхойгүй-төхөөрөмж',
    model: Platform.OS === 'ios' ? 'iPhone' : 'Android',
    os: Platform.OS,
    osVersion: Platform.Version.toString(),
});

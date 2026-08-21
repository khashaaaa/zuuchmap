
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

/**
 * The logout confirm dialog + flow, shared by the three profile screens
 * (it was copy-pasted in each). Keeps display info for the next login screen,
 * clears the session, and resets to the auth stack.
 * userService is imported lazily: userService -> navigationUtils is already an
 * import edge, and a static import here would close the cycle.
 */
export const confirmLogout = ({ t, navigation, phoneNumber, userType, name, profilePicture }) => {
    const { showErrorModal, hideErrorModal } = require('./errorManager');
    showErrorModal(
        t('nav.logout'),
        t('common.confirm'),
        [
            { text: t('common.cancel') },
            {
                text: t('nav.logout'),
                style: 'destructive',
                onPress: async () => {
                    try {
                        hideErrorModal();
                        const { saveUserInfo } = require('../services/api/authHelpers');
                        const userService = require('../services/api/userService').default;
                        await saveUserInfo(phoneNumber, userType, { name, profilePicture });
                        await userService.logout(true);
                        navigation.reset({ index: 0, routes: [{ name: 'PhoneNumber' }] });
                    } catch (error) {
                        const { logger } = require('./logger');
                        logger.error('Logout error:', error);
                        showErrorModal(t('common.error'), t('common.error'));
                    }
                },
            },
        ],
        'warning'
    );
};

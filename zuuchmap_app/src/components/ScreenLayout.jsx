import React from 'react';
import { StyleSheet } from 'react-native';
import CustomSafeAreaView from './CustomSafeAreaView';
import ScreenHeader from './ScreenHeader';
import ScreenLoading from './ScreenLoading';
import ScreenError from './ScreenError';
import KeyboardAvoider from './KeyboardAvoider';
import { useAppTheme } from '../hooks/useAppTheme';

/**
 * Standard screen shell: SafeArea + header + (loading | error | children).
 * Use for detail, profile, and list screens that share the same chrome.
 * The body lifts clear of the keyboard, so a screen inside never adds its own
 * KeyboardAvoider.
 */
const ScreenLayout = ({
    title,
    onBack,
    rightComponent,
    showBack = true,
    loading = false,
    loadingMessage,
    error = false,
    errorTitle,
    errorMessage,
    onRetry,
    children,
    style,
}) => {
    const { colors, isDark } = useAppTheme();
    return (
        <CustomSafeAreaView
            backgroundColor={colors.background}
            statusBarColor={colors.surface}
            statusBarStyle={isDark ? 'light-content' : 'dark-content'}
            style={style}
        >
            <ScreenHeader
                title={title}
                onBack={onBack}
                rightComponent={rightComponent}
                showBack={showBack}
            />
            {loading ? (
                <ScreenLoading message={loadingMessage} />
            ) : error ? (
                <ScreenError
                    title={errorTitle}
                    message={errorMessage}
                    onRetry={onRetry}
                />
            ) : (
                <KeyboardAvoider style={styles.body}>{children}</KeyboardAvoider>
            )}
        </CustomSafeAreaView>
    );
};

const styles = StyleSheet.create({
    body: { flex: 1 },
});

export default ScreenLayout;

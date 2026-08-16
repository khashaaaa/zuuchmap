import React from 'react';
import { View, Platform, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { dimensions } from '../design/theme';
import { useAppTheme } from '../hooks/useAppTheme';

const CustomSafeAreaView = ({
    children,
    style,
    backgroundColor,
    statusBarColor,
    statusBarStyle,
    edges = ['top', 'left', 'right'],
    includeStatusBar = true
}) => {
    const { colors, isDark } = useAppTheme();
    backgroundColor = backgroundColor ?? colors.background;
    statusBarColor = statusBarColor ?? colors.surface;
    statusBarStyle = statusBarStyle ?? (isDark ? 'light-content' : 'dark-content');
    if (Platform.OS === 'android') {
        return (
            <View style={[{ flex: 1, backgroundColor }, style]}>
                {includeStatusBar && (
                    <View style={{
                        height: dimensions.statusBarHeight,
                        backgroundColor: statusBarColor,
                    }} />
                )}

                <StatusBar
                    backgroundColor="transparent"
                    translucent
                    barStyle={statusBarStyle}
                />

                <View style={{ flex: 1, backgroundColor }}>
                    {children}
                </View>
            </View>
        );
    }

    return (
        <SafeAreaView style={[{ flex: 1, backgroundColor }, style]} edges={edges}>
            <StatusBar backgroundColor={statusBarColor} barStyle={statusBarStyle} />
            {children}
        </SafeAreaView>
    );
};

export default CustomSafeAreaView;
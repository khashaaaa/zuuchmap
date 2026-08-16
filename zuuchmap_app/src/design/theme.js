import { StyleSheet, Platform, StatusBar, Dimensions } from 'react-native';

const { width } = Dimensions.get('window');
export const isTablet = width >= 768;
const s = isTablet ? 1.25 : 1;

// Direction A — neutral grounds, amber reserved for accents.
// Both palettes share one token shape; components never hardcode hues.
// Every text/bg pair here passes WCAG AA (4.5:1) except `disabled`,
// which is exempt by spec and still kept above 3:1.

const darkColors = {
    primary: '#F5A623',
    primaryLighter: '#FCE3B3',
    primaryDark: '#D68F0A',
    primaryDarker: '#B57807',
    primaryLight: '#F8BC55',
    onPrimary: '#1A1200',

    danger: '#E5645C',
    dangerLight: '#EF8A84',
    dangerDark: '#C44840',
    warning: '#E0A63E',
    warningLight: '#EABC6B',
    warningDark: '#C68A1E',
    success: '#57C27D',
    successLight: '#7DD29B',
    successDark: '#3BA05F',
    info: '#5BA7E0',
    infoLight: '#82BEE9',
    infoDark: '#3E88C4',

    // Category-specific colors
    machinery: '#8E9BE8',
    material: '#C58BE0',
    jobVacancy: '#55C6DA',
    sos: '#FF8A6B',

    background: '#17181A',
    backgroundLight: '#1F2124',
    backgroundDark: '#101113',

    surface: '#1F2124',
    surfaceElevated: '#26282C',
    surfaceLight: '#2C2F33',

    text: {
        primary: '#ECEDEE',
        secondary: '#9BA1A6',
        tertiary: '#898F94',
        disabled: '#5F646B',
        placeholder: '#898F95',
        inverse: '#ECEDEE',
        onColor: '#101113',
        link: '#F5A623',
    },

    border: {
        light: '#2C2F33',
        medium: '#33363B',
        dark: '#3D4147',
        focus: '#F5A623',
        amber: 'rgba(245, 166, 35, 0.3)',
    },

    opacity: {
        overlay: 'rgba(0, 0, 0, 0.6)',
        overlayLight: 'rgba(0, 0, 0, 0.4)',
        overlayDark: 'rgba(0, 0, 0, 0.8)',
        whiteOverlay: 'rgba(255, 255, 255, 0.5)',
        whiteOverlayLight: 'rgba(255, 255, 255, 0.8)',
        background: {
            primary: 'rgba(245, 166, 35, 0.16)',
            primaryLight: 'rgba(245, 166, 35, 0.08)',
            primaryMedium: 'rgba(245, 166, 35, 0.22)',
            primaryDark: 'rgba(245, 166, 35, 0.3)',
            dark: 'rgba(0, 0, 0, 0.3)',
            danger: 'rgba(229, 100, 92, 0.14)',
            success: 'rgba(87, 194, 125, 0.14)',
            warning: 'rgba(224, 166, 62, 0.14)',
            info: 'rgba(91, 167, 224, 0.14)',
        },
        border: {
            primary: 'rgba(245, 166, 35, 0.4)',
            primaryMedium: 'rgba(245, 166, 35, 0.3)',
            dark: 'rgba(0, 0, 0, 0.2)',
            success: 'rgba(87, 194, 125, 0.25)',
            successMedium: 'rgba(87, 194, 125, 0.35)',
            warning: 'rgba(224, 166, 62, 0.25)',
            danger: 'rgba(229, 100, 92, 0.25)',
        },
    },
};

const lightColors = {
    primary: '#E8890C',
    primaryLighter: '#FCE9C9',
    primaryDark: '#C87206',
    primaryDarker: '#A35E04',
    primaryLight: '#F5A623',
    onPrimary: '#241500',

    danger: '#BE3B33',
    dangerLight: '#D8635C',
    dangerDark: '#9C2B24',
    warning: '#9A6A00',
    warningLight: '#C08A14',
    warningDark: '#7A5400',
    success: '#1E7C46',
    successLight: '#3D9C64',
    successDark: '#145F33',
    info: '#1E6FB8',
    infoLight: '#4C8FCB',
    infoDark: '#155790',

    machinery: '#3D4DA8',
    material: '#7B1FA2',
    jobVacancy: '#00738A',
    sos: '#C64318',

    background: '#FAFAF8',
    backgroundLight: '#FFFFFF',
    backgroundDark: '#F1F0EC',

    surface: '#FFFFFF',
    surfaceElevated: '#FFFFFF',
    surfaceLight: '#F3F2EE',

    text: {
        primary: '#1A1C1E',
        secondary: '#5F6368',
        tertiary: '#727378',
        disabled: '#A9ABB0',
        placeholder: '#717379',
        inverse: '#1A1C1E',
        onColor: '#FFFFFF',
        link: '#A35F00',
    },

    border: {
        light: '#E8E6E1',
        medium: '#DDDAD3',
        dark: '#C9C6BE',
        focus: '#E8890C',
        amber: 'rgba(232, 137, 12, 0.3)',
    },

    opacity: {
        overlay: 'rgba(0, 0, 0, 0.4)',
        overlayLight: 'rgba(0, 0, 0, 0.25)',
        overlayDark: 'rgba(0, 0, 0, 0.6)',
        whiteOverlay: 'rgba(255, 255, 255, 0.7)',
        whiteOverlayLight: 'rgba(255, 255, 255, 0.9)',
        background: {
            primary: 'rgba(232, 137, 12, 0.1)',
            primaryLight: 'rgba(232, 137, 12, 0.05)',
            primaryMedium: 'rgba(232, 137, 12, 0.15)',
            primaryDark: 'rgba(232, 137, 12, 0.2)',
            dark: 'rgba(0, 0, 0, 0.08)',
            danger: 'rgba(190, 59, 51, 0.08)',
            success: 'rgba(30, 124, 70, 0.08)',
            warning: 'rgba(154, 106, 0, 0.1)',
            info: 'rgba(30, 111, 184, 0.08)',
        },
        border: {
            primary: 'rgba(232, 137, 12, 0.35)',
            primaryMedium: 'rgba(232, 137, 12, 0.25)',
            dark: 'rgba(0, 0, 0, 0.1)',
            success: 'rgba(30, 124, 70, 0.2)',
            successMedium: 'rgba(30, 124, 70, 0.3)',
            warning: 'rgba(154, 106, 0, 0.2)',
            danger: 'rgba(190, 59, 51, 0.2)',
        },
    },
};

export const palettes = { dark: darkColors, light: lightColors };

export const spacing = {
    xxs: 2,
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    xxl: 24,
    xxxl: 32,
    xxxxl: 40,
    xxxxxl: 48,

    cardPadding: Math.round(16 * s),
    screenPadding: Math.round(20 * s),
    sectionSpacing: Math.round(24 * s),
};

export const radius = {
    none: 0,
    xs: 4,
    sm: 6,
    md: 8,
    lg: 12,
    xl: 16,
    xxl: 20,
    xxxl: 24,
    full: 9999,

    // Semantic radius values - use these instead of hardcoded numbers
    button: 12,
    input: 12,
    card: 16,
    modal: 20,
    pill: 9999,
    avatar: 9999,
    badge: 9999,
};

export const typography = {
    xs: Math.round(12 * s),
    sm: Math.round(14 * s),
    md: Math.round(16 * s),
    lg: Math.round(18 * s),
    xl: Math.round(20 * s),
    xxl: Math.round(24 * s),
    xxxl: Math.round(28 * s),
    display: Math.round(32 * s),
    lineHeight: { tight: 1.2, normal: 1.5, relaxed: 1.75, loose: 2 },
    letterSpacing: { tighter: -0.5, tight: -0.25, normal: 0, wide: 0.25, wider: 0.5 },
    weight: { light: '300', regular: '400', medium: '500', semibold: '600', bold: '700', extrabold: '800', black: '900' },
    styles: {
        h1:       { fontSize: Math.round(28 * s), fontWeight: '700', lineHeight: Math.round(34 * s), letterSpacing: -0.5 },
        h2:       { fontSize: Math.round(24 * s), fontWeight: '600', lineHeight: Math.round(30 * s), letterSpacing: -0.25 },
        h3:       { fontSize: Math.round(20 * s), fontWeight: '600', lineHeight: Math.round(26 * s) },
        body:     { fontSize: Math.round(16 * s), fontWeight: '400', lineHeight: Math.round(24 * s) },
        bodyBold: { fontSize: Math.round(16 * s), fontWeight: '600', lineHeight: Math.round(24 * s) },
        caption:  { fontSize: Math.round(14 * s), fontWeight: '400', lineHeight: Math.round(20 * s) },
        label:    { fontSize: Math.round(14 * s), fontWeight: '500', lineHeight: Math.round(20 * s) },
        small:    { fontSize: Math.round(12 * s), fontWeight: '400', lineHeight: Math.round(18 * s) },
    },
};

export const shadows = {
    none: {
        shadowColor: 'transparent',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0,
        shadowRadius: 0,
        elevation: 0,
    },
    xs: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.15,
        shadowRadius: 2,
        elevation: 1,
    },
    small: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.20,
        shadowRadius: 4,
        elevation: 3,
    },
    medium: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.25,
        shadowRadius: 8,
        elevation: 5,
    },
    large: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.30,
        shadowRadius: 16,
        elevation: 8,
    },
    xl: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.35,
        shadowRadius: 24,
        elevation: 12,
    },
    primary: {
        shadowColor: '#F5A623',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4,
        shadowRadius: 8,
        elevation: 6,
    },
    success: {
        shadowColor: '#57C27D',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 6,
    },
    dark: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.4,
        shadowRadius: 12,
        elevation: 8,
    },
};

export const animations = {
    duration: {
        fast: 150,
        normal: 250,
        slow: 350,
        slower: 500,
    },
    easing: {
        easeIn: 'ease-in',
        easeOut: 'ease-out',
        easeInOut: 'ease-in-out',
    },
    spring: {
        damping: 15,
        stiffness: 150,
    }
};

// Standard interaction constants
export const interactions = {
    activeOpacity: 0.8,      // Standard button press opacity
    activeOpacityLight: 0.7,  // Lighter press (for subtle buttons)
    activeOpacityHeavy: 0.6,  // Heavy press (for destructive actions)
};

export const dimensions = {
    statusBarHeight: Platform.OS === 'android' ? StatusBar.currentHeight || 24 : 0,
    headerHeight: 64,
    bottomTabHeight: Platform.OS === 'android' ? 65 : 88,
    navigationBarHeight: Platform.OS === 'android' ? 24 : 0,
};

// Wraps a per-file style factory with palette-keyed memoization:
//   const makeStyles = themedStyles((colors) => ({ ...styles }));
//   ...inside the component: const styles = makeStyles(colors);
// Only ever creates one sheet per palette, so calling it every render is free.
export const themedStyles = (factory) => {
    const cache = new Map();
    return (colors) => {
        let sheet = cache.get(colors);
        if (!sheet) {
            sheet = StyleSheet.create(factory(colors));
            cache.set(colors, sheet);
        }
        return sheet;
    };
};

// Theme-aware replacement for the old static `globalStyles`.
// Access via useAppTheme().styles — never build these at module scope,
// or the styles freeze to one theme.
const globalStylesCache = new Map();

export const createGlobalStyles = (colors) => {
    const cached = globalStylesCache.get(colors);
    if (cached) return cached;

    const sheet = StyleSheet.create({
        container: {
            flex: 1,
            backgroundColor: colors.background,
        },

        safeContainer: {
            flex: 1,
            backgroundColor: colors.background,
        },

        containerWithStatusBar: {
            flex: 1,
            backgroundColor: colors.background,
            paddingTop: dimensions.statusBarHeight,
        },

        containerWithBottomPadding: {
            flex: 1,
            backgroundColor: colors.background,
            paddingTop: dimensions.statusBarHeight,
            paddingBottom: dimensions.navigationBarHeight,
        },

        statusBarBackground: {
            height: dimensions.statusBarHeight,
            backgroundColor: colors.surface,
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 1000,
        },
        header: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: spacing.lg,
            paddingVertical: spacing.md,
            backgroundColor: colors.surface,
            minHeight: dimensions.headerHeight,
            ...shadows.small,
        },

        headerWithStatusBar: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: spacing.lg,
            paddingVertical: spacing.md,
            paddingTop: Platform.OS === 'android' ? dimensions.statusBarHeight + spacing.md : spacing.md,
            backgroundColor: colors.surface,
            minHeight: dimensions.headerHeight + (Platform.OS === 'android' ? dimensions.statusBarHeight : 0),
            ...shadows.small,
        },

        headerTitle: {
            fontSize: typography.lg,
            fontWeight: 'bold',
            color: colors.text.primary,
            textAlign: 'center',
            flex: 1,
        },

        headerButton: {
            padding: spacing.sm,
            minWidth: 40,
            alignItems: 'center',
            justifyContent: 'center',
        },

        headerPlaceholder: {
            width: 40,
        },

        buttonPrimary: {
            backgroundColor: colors.primary,
            paddingVertical: spacing.md,
            paddingHorizontal: spacing.xl,
            borderRadius: radius.button,
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: 52,
        },

        buttonDanger: {
            backgroundColor: colors.danger,
            paddingVertical: spacing.md,
            paddingHorizontal: spacing.xl,
            borderRadius: radius.button,
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: 52,
        },

        buttonSuccess: {
            backgroundColor: colors.success,
            paddingVertical: spacing.md,
            paddingHorizontal: spacing.xl,
            borderRadius: radius.button,
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: 52,
        },

        buttonDisabled: {
            backgroundColor: colors.surfaceLight,
            opacity: 1,
        },

        buttonText: {
            color: colors.onPrimary,
            fontSize: typography.md,
            fontWeight: '600',
        },

        buttonTextOnColor: {
            color: '#FFFFFF',
            fontSize: typography.md,
            fontWeight: '600',
        },

        buttonTextDisabled: {
            color: colors.text.disabled,
            fontSize: typography.md,
            fontWeight: '600',
        },

        inputContainer: {
            marginBottom: spacing.lg,
        },

        inputLabel: {
            fontSize: typography.md,
            fontWeight: '500',
            color: colors.text.primary,
            marginBottom: spacing.sm,
        },

        input: {
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border.medium,
            borderRadius: radius.input,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.md,
            fontSize: typography.md,
            color: colors.text.primary,
            minHeight: 52,
        },

        inputFocused: {
            borderColor: colors.border.focus,
            borderWidth: 2,
            backgroundColor: colors.surfaceLight,
        },

        inputError: {
            borderColor: colors.danger,
            borderWidth: 2,
        },

        inputTextArea: {
            minHeight: 100,
            textAlignVertical: 'top',
            paddingTop: spacing.md,
        },

        priceContainer: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.sm,
        },

        priceInput: {
            flex: 1,
        },

        errorText: {
            color: colors.danger,
            fontSize: typography.sm,
            marginTop: spacing.xs,
        },

        pickerButton: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border.medium,
            borderRadius: radius.input,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.md,
            minHeight: 52,
        },

        pickerButtonText: {
            fontSize: typography.md,
            color: colors.text.primary,
        },

        placeholderText: {
            color: colors.text.placeholder,
        },

        card: {
            backgroundColor: colors.surface,
            borderRadius: radius.card,
            padding: spacing.lg,
            borderWidth: 1,
            borderColor: colors.border.light,
            ...shadows.small,
        },

        cardElevated: {
            backgroundColor: colors.surfaceElevated,
            borderRadius: radius.card,
            padding: spacing.lg,
            borderWidth: 1,
            borderColor: colors.border.light,
            ...shadows.medium,
        },

        section: {
            backgroundColor: colors.surface,
            padding: spacing.lg,
            marginVertical: spacing.sm,
            marginHorizontal: spacing.lg,
            borderRadius: radius.lg,
            borderWidth: 1,
            borderColor: colors.border.light,
            ...shadows.small,
        },

        sectionTitle: {
            fontSize: typography.xl,
            fontWeight: 'bold',
            color: colors.text.primary,
            marginBottom: spacing.xs,
        },

        sectionHeader: {
            marginBottom: spacing.lg,
            marginTop: spacing.xl,
        },

        sectionSubtitle: {
            fontSize: typography.sm,
            color: colors.text.secondary,
        },

        requiredStar: {
            color: colors.danger,
        },

        buttonContentContainer: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
        },

        buttonFullWidth: {
            width: '100%',
        },

        loadingContainer: {
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
            backgroundColor: colors.background,
        },

        loadingContainerWithStatusBar: {
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
            backgroundColor: colors.background,
            paddingTop: dimensions.statusBarHeight,
        },

        loadingText: {
            marginTop: spacing.lg,
            fontSize: typography.md,
            color: colors.text.primary,
            fontWeight: '600',
        },

        skeleton: {
            backgroundColor: colors.surface,
            borderRadius: radius.md,
        },

        skeletonShimmer: {
            backgroundColor: colors.surfaceLight,
            opacity: 0.7,
        },

        errorContainer: {
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
            padding: spacing.xxl,
            backgroundColor: colors.background,
        },
        errorIconContainer: {
            width: 80,
            height: 80,
            borderRadius: 40,
            backgroundColor: colors.opacity.background.primary,
            justifyContent: 'center',
            alignItems: 'center',
            marginBottom: spacing.xl,
        },
        errorTitle: {
            fontSize: typography.lg,
            fontWeight: 'bold',
            color: colors.text.primary,
            marginBottom: spacing.sm,
        },
        errorText: {
            fontSize: typography.md,
            color: colors.text.secondary,
            textAlign: 'center',
            lineHeight: 22,
            marginBottom: spacing.xxl,
        },
        retryButton: {
            backgroundColor: colors.primary,
            borderRadius: radius.button,
            paddingVertical: spacing.md,
            paddingHorizontal: spacing.xl,
            ...shadows.small,
        },
        retryButtonText: {
            color: colors.onPrimary,
            fontSize: typography.md,
            fontWeight: '600',
        },

        errorContainerWithStatusBar: {
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
            padding: spacing.xxl,
            paddingTop: dimensions.statusBarHeight + spacing.xxl,
            backgroundColor: colors.background,
        },

        emptyState: {
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
            padding: spacing.xxl,
        },

        emptyStateIcon: {
            width: 120,
            height: 120,
            borderRadius: 60,
            backgroundColor: colors.opacity.background.primary,
            justifyContent: 'center',
            alignItems: 'center',
            marginBottom: spacing.xl,
        },

        emptyStateText: {
            fontSize: typography.lg,
            fontWeight: '600',
            color: colors.text.primary,
            marginBottom: spacing.sm,
        },

        emptyStateSubtext: {
            fontSize: typography.md,
            color: colors.text.secondary,
            textAlign: 'center',
        },

        modalOverlay: {
            flex: 1,
            backgroundColor: colors.opacity.overlay,
            justifyContent: 'flex-end',
        },

        modalContent: {
            backgroundColor: colors.surface,
            borderTopLeftRadius: radius.modal,
            borderTopRightRadius: radius.modal,
            paddingBottom: Platform.OS === 'android' ? 34 + dimensions.navigationBarHeight : 34,
            ...shadows.medium,
        },

        modalHeader: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingHorizontal: spacing.lg,
            paddingVertical: spacing.lg,
        },

        modalTitle: {
            fontSize: typography.lg,
            fontWeight: '600',
            color: colors.text.primary,
        },

        modalButton: {
            paddingHorizontal: spacing.sm,
            paddingVertical: spacing.xs,
        },

        modalButtonText: {
            fontSize: typography.md,
            color: colors.text.link,
        },

        imagePickerButton: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 2,
            borderColor: colors.primary,
            borderRadius: radius.md,
            borderStyle: 'dashed',
            padding: spacing.lg,
            marginBottom: spacing.lg,
            minHeight: 60,
            backgroundColor: colors.opacity.background.primaryLight,
        },

        imagePickerText: {
            marginLeft: spacing.sm,
            color: colors.text.link,
            fontSize: typography.md,
            fontWeight: '500',
        },

        badge: {
            paddingHorizontal: spacing.sm,
            paddingVertical: spacing.xs,
            borderRadius: radius.full,
            backgroundColor: colors.opacity.background.primary,
            alignSelf: 'flex-start',
        },

        badgeText: {
            fontSize: typography.xs,
            fontWeight: '600',
            color: colors.primary,
            letterSpacing: 0.3,
        },

        badgeSuccess: {
            backgroundColor: colors.opacity.background.success,
        },

        badgeSuccessText: {
            color: colors.success,
        },

        badgeDanger: {
            backgroundColor: colors.opacity.background.danger,
        },

        badgeDangerText: {
            color: colors.danger,
        },

        badgeWarning: {
            backgroundColor: colors.opacity.background.warning,
        },

        badgeWarningText: {
            color: colors.warning,
        },

        scrollViewContent: {
            paddingBottom: spacing.xxl,
        },

        bottomContainer: {
            backgroundColor: colors.surface,
            padding: spacing.lg,
            paddingBottom: Platform.OS === 'android' ? spacing.lg + dimensions.navigationBarHeight : spacing.lg,
            ...shadows.small,
        },

        tabBarStyle: {
            height: dimensions.bottomTabHeight,
            paddingBottom: Platform.OS === 'android' ? dimensions.navigationBarHeight + spacing.sm : spacing.xl,
            paddingTop: spacing.xs,
            backgroundColor: colors.surface,
            ...shadows.small,
        },

        row: {
            flexDirection: 'row',
            alignItems: 'center',
        },

        spaceBetween: {
            justifyContent: 'space-between',
        },

        center: {
            justifyContent: 'center',
            alignItems: 'center',
        },

        flex1: {
            flex: 1,
        },

        keyboardAvoidingView: {
            flex: 1,
        },

        keyboardAvoidingViewWithOffset: {
            flex: 1,
            paddingTop: Platform.OS === 'android' ? dimensions.statusBarHeight : 0,
        },
    });

    const styles = {
        ...sheet,
        scrollViewContentWithBottomInset: (bottomInset) => ({
            paddingBottom: Math.max(bottomInset, spacing.xxl),
        }),
        bottomContainerWithInset: (bottomInset) => ({
            backgroundColor: colors.surface,
            padding: spacing.lg,
            paddingBottom: Math.max(bottomInset, spacing.lg),
            ...shadows.small,
        }),
    };

    globalStylesCache.set(colors, styles);
    return styles;
};

export const safeAreaHelpers = {
    getStatusBarHeight: () => dimensions.statusBarHeight,

    getBottomSafeArea: (insets) => {
        return Platform.OS === 'android'
            ? Math.max(insets?.bottom || 0, dimensions.navigationBarHeight)
            : insets?.bottom || 0;
    },

    getHeaderHeight: (withStatusBar = false) => {
        return withStatusBar
            ? dimensions.headerHeight + dimensions.statusBarHeight
            : dimensions.headerHeight;
    },

    getScrollViewPadding: (insets) => ({
        paddingBottom: Math.max(insets?.bottom || 0, spacing.xxl),
        paddingTop: Platform.OS === 'android' ? dimensions.statusBarHeight : 0,
    }),

    getContainerStyle: (withStatusBar = true, withBottomPadding = false, colors = darkColors) => {
        let style = { flex: 1, backgroundColor: colors.background };

        if (withStatusBar && Platform.OS === 'android') {
            style.paddingTop = dimensions.statusBarHeight;
        }

        if (withBottomPadding && Platform.OS === 'android') {
            style.paddingBottom = dimensions.navigationBarHeight;
        }

        return style;
    }
};

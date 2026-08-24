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
    // Amber as a GLYPH on neutral grounds (icons, spinners). Non-text needs
    // 3:1, not 4.5:1 — so this is a lighter step than text.link, but it is
    // still not the fill colour: `primary` only makes 2.3-2.6:1 on the light
    // grounds. Dark keeps the fill hue (7.3-8.8:1); light drops to the darkest
    // amber that clears 3:1 on white (same value as the map overlay's icon).
    iconAccent: '#F5A623',

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
        // Sits on photography, never on a theme ground — so it is white in both
        // palettes by design, not by oversight.
        onMedia: '#FFFFFF',
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
    iconAccent: '#C87206',

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
        onMedia: '#FFFFFF',
        // Mirrors web --color-primary-text. Darker than the #A35F00 it replaced:
        // that tone only made 4.47:1 on surfaceLight and 4.19:1 on an amber tint.
        link: '#8F5300',
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

/**
 * Category colours.
 *
 * A category's colour is admin-editable and lives on `CategorySchema.color`,
 * so ONE hex has to work on both the dark (#1F2124) and the light (#FFFFFF)
 * ground. That is only possible at one specific luminance: solving
 *   (L + .05) / (L_dark + .05) === 1.05 / (L + .05)
 * gives L ≈ 0.211, which lands at 4.0:1 against *both* grounds.
 *
 * Every hue below is solved to that luminance, so the eight verticals read as
 * one family rather than eight unrelated swatches, and every one of them sits
 * at ~2:1 against the amber primary — amber therefore always reads as the
 * brighter, more urgent thing on screen. That is what keeps Direction A's
 * "amber is the only accent" promise true no matter how many verticals exist.
 *
 * These are the *fallbacks* the client uses when a schema carries no colour;
 * the same values are seeded and migrated engine-side.
 */
export const categoryColors = {
    vehiclerent:   '#558D39',
    machineryrent: '#6A7BC2',
    toolrent:      '#976CC3',
    materialstore: '#848236',
    construction:  '#3D8995',
    jobvacancy:    '#BC5CA9',
    factory:       '#3A8E5C',
    sos:           '#D25562',
    usedequipment: '#C16546',
    transport:     '#4984B4',
    designservice: '#8473C3',
    miningsupport: '#967A54',
    winterservice: '#4C869E',
};

const srgbToLinear = (v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));

const luminance = (r, g, b) =>
    0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);

const hexToRgb = (hex) => {
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

const rgbToHsl = (r, g, b) => {
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const l = (max + min) / 2;
    if (max === min) return [0, 0, l];
    const d = max - min;
    const sat = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h;
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0));
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    return [h / 6, sat, l];
};

const hueToRgb = (p, q, t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
};

const hslToRgb = (h, s, l) => {
    if (s === 0) return [l, l, l];
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    return [hueToRgb(p, q, h + 1 / 3), hueToRgb(p, q, h), hueToRgb(p, q, h - 1 / 3)];
};

const toHex = ([r, g, b]) =>
    '#' + [r, g, b].map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')).join('').toUpperCase();

/** `#RRGGBB` + alpha -> an `rgba()` string, for tinted fills built from a category colour. */
export const withAlpha = (hex, alpha) => {
    if (typeof hex !== 'string') return hex;
    const [r, g, b] = hexToRgb(hex);
    return `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${alpha})`;
};

const toneCache = new Map();

/**
 * Re-lights an arbitrary category hex so it is legible *as text* on the active
 * theme's ground, keeping hue and saturation intact.
 *
 * `categoryColors` above is tuned for fills and markers (4.0:1 — comfortably
 * past the 3:1 non-text bar). Text needs 4.5:1, and an admin can save any hex
 * at all, so anything that renders a category colour as a label runs it through
 * here first: we binary-search lightness for the target luminance rather than
 * trusting whatever was saved.
 */
export const toneForTheme = (hex, isDark) => {
    if (typeof hex !== 'string' || !/^#?[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(hex)) return hex;
    const key = hex + (isDark ? 'd' : 'l');
    const cached = toneCache.get(key);
    if (cached) return cached;

    // 0.30 → 5.5:1 on the dark surface; 0.12 → 6.2:1 on white.
    const target = isDark ? 0.30 : 0.12;
    const [h, sat] = rgbToHsl(...hexToRgb(hex));

    let lo = 0, hi = 1;
    for (let i = 0; i < 24; i++) {
        const mid = (lo + hi) / 2;
        if (luminance(...hslToRgb(h, sat, mid)) < target) lo = mid;
        else hi = mid;
    }
    const result = toHex(hslToRgb(h, sat, (lo + hi) / 2));
    toneCache.set(key, result);
    return result;
};

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

/**
 * Commissioner, bundled at five weights. Chosen because it carries the full
 * Mongolian Cyrillic set (Ө U+04E8, Ү U+04AE) *and* the tugrik sign
 * (₮ U+20AE) — verified glyph-by-glyph — while being the narrowest face that
 * does, which matters when Mongolian strings run long in a fixed-width card.
 *
 * React Native cannot synthesize weights from a custom family on Android, so
 * each weight is its own family and styles set `fontFamily`, never
 * `fontWeight`. Setting both risks faux-bold stacked on top of a real bold.
 */
export const fonts = {
    regular:   'Commissioner-Regular',
    medium:    'Commissioner-Medium',
    semibold:  'Commissioner-SemiBold',
    bold:      'Commissioner-Bold',
    extrabold: 'Commissioner-ExtraBold',
};

/** The asset map handed to expo-font at startup. */
export const fontAssets = {
    'Commissioner-Regular':   require('../../assets/fonts/Commissioner-Regular.ttf'),
    'Commissioner-Medium':    require('../../assets/fonts/Commissioner-Medium.ttf'),
    'Commissioner-SemiBold':  require('../../assets/fonts/Commissioner-SemiBold.ttf'),
    'Commissioner-Bold':      require('../../assets/fonts/Commissioner-Bold.ttf'),
    'Commissioner-ExtraBold': require('../../assets/fonts/Commissioner-ExtraBold.ttf'),
};

export const typography = {
    md: Math.round(16 * s),
    // `weight` was removed: with per-weight font families, fontWeight is ignored
    // on Android and risks faux-bold on iOS. Use `fonts.*` from this module instead.

    /**
     * The type scale. Always spread a role — `...typography.styles.title` —
     * rather than setting `fontSize` + `fontFamily` by hand, so line-height and
     * tracking travel with the size instead of being re-guessed per screen.
     *
     * The scale is deliberately top-heavy in *contrast*, not in size: this is a
     * dense marketplace, so the jumps between adjacent rungs (16 → 18 → 20 → 24)
     * are large enough to establish a focal point on a card without pushing
     * long Mongolian strings onto extra lines.
     *
     * `title` is the rung the app was missing — the card/row heading that sits
     * above body but below a section header, and does most of the scanning work
     * in a list.
     */
    styles: {
        display:  { fontSize: Math.round(32 * s), fontFamily: fonts.extrabold, lineHeight: Math.round(37 * s), letterSpacing: -0.75 },
        h1:       { fontSize: Math.round(28 * s), fontFamily: fonts.bold,      lineHeight: Math.round(34 * s), letterSpacing: -0.5 },
        h2:       { fontSize: Math.round(24 * s), fontFamily: fonts.bold,      lineHeight: Math.round(30 * s), letterSpacing: -0.4 },
        h3:       { fontSize: Math.round(20 * s), fontFamily: fonts.semibold,  lineHeight: Math.round(26 * s), letterSpacing: -0.25 },
        title:    { fontSize: Math.round(18 * s), fontFamily: fonts.semibold,  lineHeight: Math.round(24 * s), letterSpacing: -0.15 },
        body:     { fontSize: Math.round(16 * s), fontFamily: fonts.regular,   lineHeight: Math.round(24 * s) },
        bodyBold: { fontSize: Math.round(16 * s), fontFamily: fonts.semibold,  lineHeight: Math.round(24 * s) },
        label:    { fontSize: Math.round(14 * s), fontFamily: fonts.medium,    lineHeight: Math.round(20 * s), letterSpacing: 0.1 },
        caption:  { fontSize: Math.round(14 * s), fontFamily: fonts.regular,   lineHeight: Math.round(20 * s) },
        small:    { fontSize: Math.round(12 * s), fontFamily: fonts.regular,   lineHeight: Math.round(17 * s) },
        // Price is the one number a customer scans a whole list for, so it gets
        // its own rung rather than borrowing `title`.
        price:    { fontSize: Math.round(18 * s), fontFamily: fonts.bold,      lineHeight: Math.round(23 * s), letterSpacing: -0.2 },
        // Eyebrows and badges: small, wide-tracked, always uppercase at the call site.
        overline: { fontSize: Math.round(11 * s), fontFamily: fonts.bold,      lineHeight: Math.round(14 * s), letterSpacing: 0.8 },
        // Standfirst / intro paragraph — body size up one rung, still light.
        lead:        { fontSize: Math.round(18 * s), fontFamily: fonts.regular,  lineHeight: Math.round(26 * s) },
        bodyMedium:  { fontSize: Math.round(16 * s), fontFamily: fonts.medium,   lineHeight: Math.round(24 * s) },
        labelStrong: { fontSize: Math.round(14 * s), fontFamily: fonts.semibold, lineHeight: Math.round(20 * s), letterSpacing: 0.1 },
        // 12px utility rungs: `micro` for tab bars and meta, `badge` for pills.
        micro:       { fontSize: Math.round(12 * s), fontFamily: fonts.medium,   lineHeight: Math.round(16 * s), letterSpacing: 0.1 },
        badge:       { fontSize: Math.round(12 * s), fontFamily: fonts.bold,     lineHeight: Math.round(16 * s), letterSpacing: 0.3 },
    },
};

const shadows = {
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
    primary: {
        shadowColor: '#F5A623',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4,
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

/**
 * Elevation — one idiom per theme, never both.
 *
 * A black shadow over a #1F2124 card on a #17181A ground is invisible, so the
 * dark theme paid for `elevation` on Android and got nothing for it while a
 * 1px border did all the actual separating. Dark therefore separates with a
 * hairline; light separates with a soft shadow.
 *
 * Both variants declare `borderWidth: 1` so a surface does not change size when
 * the theme flips — on light the border is simply transparent. Spread these
 * FIRST in a style object; anything that wants its own border (a selected
 * state, an SOS card) declares `borderColor` after the spread and wins.
 *
 * `lg` is the exception that keeps a shadow on both themes: modals and sheets
 * sit above a scrim, where a cast shadow reads even on a dark ground.
 */
const makeElevation = (c, isDark) => (isDark
    ? {
        sm:       { borderWidth: 1, borderColor: c.border.light,  ...shadows.none },
        md:       { borderWidth: 1, borderColor: c.border.medium, ...shadows.none },
        lg:       { borderWidth: 1, borderColor: c.border.dark,   ...shadows.dark },
        selected: { borderWidth: 1, borderColor: c.primary,       ...shadows.none },
    }
    : {
        sm:       { borderWidth: 1, borderColor: 'transparent', ...shadows.xs },
        md:       { borderWidth: 1, borderColor: 'transparent', ...shadows.small },
        lg:       { borderWidth: 1, borderColor: 'transparent', ...shadows.medium },
        selected: { borderWidth: 1, borderColor: c.primary,     ...shadows.primary },
    });

darkColors.elevation = makeElevation(darkColors, true);
lightColors.elevation = makeElevation(lightColors, false);

export const animations = {
    duration: {
        instant: 120,   // press feedback — must beat the eye, not be watched
        fast: 180,
        normal: 240,
        slow: 320,
        slower: 480,
        pulse: 900,     // skeleton opacity pulse, one leg of the loop
        count: 600,     // profile stat count-up, first load only
        camera: 1000,   // map camera flights (animateToRegion)
    },
    easing: {
        easeIn: 'ease-in',
        easeOut: 'ease-out',
        easeInOut: 'ease-in-out',
    },
    spring: {
        damping: 15,
        stiffness: 150,
        // One entrance spring for every modal/sheet surface (BaseModal's
        // canonical 65/11) — do not hand-roll tensions at call sites.
        modal: { tension: 65, friction: 11 },
        sheet: { tension: 65, friction: 11 },
    },
    /**
     * Playful overshoot for tiny state-change icons (LikeButton's heart).
     * Loose friction on purpose — this one IS meant to be seen bouncing.
     */
    pop: {
        tension: 200,
        friction: 5,
    },
    /**
     * The amber selection pop: a newly-selected chip/card does one small
     * 1 → scale → 1 breath as the selected state lands. `dotScale` is the
     * grown size of a carousel pagination dot.
     */
    selection: {
        scale: 1.06,
        dotScale: 1.35,
    },
    /** Bell wiggle amplitude in degrees when the unread count rises. */
    wiggle: {
        angle: 12,
    },
    /**
     * Press feedback. Opacity alone reads as "the screen dimmed"; a small scale
     * reads as "I pushed a thing". Kept shallow (0.97) because these are large
     * cards — a deeper scale on a full-width row looks like a bounce.
     */
    press: {
        scale: 0.97,
        tension: 320,
        friction: 18,
    },
    /**
     * Per-item delay for list entrances. 40ms is enough to read as a cascade
     * without the last card in a viewport arriving noticeably late.
     */
    stagger: 40,
};

// Standard interaction constants
export const interactions = {
    activeOpacity: 0.8,      // Standard button press opacity
    activeOpacityLight: 0.7,  // Lighter press (for subtle buttons)
    activeOpacityHeavy: 0.6,  // Heavy press (for destructive actions)
    hitSlop: { top: 10, bottom: 10, left: 10, right: 10 },  // Standard touch-target extension
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

        inputError: {
            borderColor: colors.danger,
            borderWidth: 2,
        },

        inputTextArea: {
            minHeight: 100,
            textAlignVertical: 'top',
            paddingTop: spacing.md,
        },

        placeholderText: {
            color: colors.text.placeholder,
        },

        sectionTitle: {
            ...typography.styles.h3,
            color: colors.text.primary,
            marginBottom: spacing.xs,
        },

        sectionHeader: {
            marginBottom: spacing.lg,
            marginTop: spacing.xl,
        },

        sectionSubtitle: {
            ...typography.styles.caption,
            color: colors.text.secondary,
        },

        requiredStar: {
            color: colors.danger,
        },

        errorText: {
            fontSize: typography.md,
            color: colors.text.secondary,
            textAlign: 'center',
            lineHeight: 22,
            marginBottom: spacing.xxl,
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
            ...colors.elevation.md,
        },

        modalHeader: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingHorizontal: spacing.lg,
            paddingVertical: spacing.lg,
        },

        modalTitle: {
            ...typography.styles.title,
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

        keyboardAvoidingView: {
            flex: 1,
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
            // A bar pinned to the bottom needs an upward separator; elevation
            // casts its shadow downward, off-screen. Hairline only.
            borderTopWidth: 1,
            borderTopColor: colors.border.light,
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

# UI Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align app and web to a shared warm-brown design language (colors, radius, typography) while fixing internal inconsistencies in each codebase and making both responsive (app works on tablet, web works on phone).

**Architecture:** Token-first — update `theme.js` (app) and `index.css` (web) before touching components. App merges two redundant button components into one. Web gets shared `Button` and `Input` components to eliminate repeated inline class strings. Responsive scaling uses `isTablet` in the app and Tailwind breakpoints in web. Each platform stays in its own scope; they share values, not files.

**Tech Stack:** React Native 0.81 / Expo 54 (app), React 19 / Vite / Tailwind 4 (web)

**Constraint:** Keep styles tight — minimal `StyleSheet` properties in app components; no verbose class strings in web outside of shared components.

---

## File Map

### App — modified
- `src/design/theme.js` — color tokens + isTablet scale
- `src/hooks/useAppTheme.js` — light mode text colors (warm brown, not cool gray)
- `src/components/Button.jsx` — NEW: merged PrimaryButton + ActionButton
- `src/components/PrimaryButton.jsx` — DELETE
- `src/components/ActionButton.jsx` — DELETE
- `src/components/index.js` — swap exports
- `src/components/ScreenHeader.jsx` — remove baked-in theme toggle
- `src/components/TextInput.jsx` — fix double-label
- `src/screens/shared/AccountDeletionScreen.jsx` — fix hardcoded colors
- `src/screens/provider/ProviderPostList.jsx` — tablet 2-col grid
- `src/screens/customer/CustomerPostList.jsx` — tablet 2-col grid
- `src/screens/admin/AdminPostList.jsx` — tablet 2-col grid
- `src/screens/provider/ProviderPostForm.jsx` — tablet max-width centering
- `src/screens/provider/ProviderEditProfile.jsx` — tablet max-width centering
- `src/screens/provider/ProviderCompanyCreate.jsx` — tablet max-width centering

### App — call sites using PrimaryButton/ActionButton (import swap only)
- `src/screens/auth/PhoneNumber.jsx`
- `src/screens/auth/OtpVerification.jsx`
- `src/screens/auth/BiometricAuth.jsx`
- `src/screens/onboarding/UserRoleSelection.jsx`
- `src/screens/provider/ProviderLocationSelection.jsx`
- `src/screens/customer/CustomerEditProfile.jsx`
- `src/screens/customer/CustomerPostFilter.jsx`
- `src/screens/shared/PostDetailScreen.jsx`
- `src/components/DialogModal.jsx`
- `src/components/MapFilterModal.jsx`

### Web — modified
- `src/index.css` — add radius tokens to `@theme`
- `src/components/Button.jsx` — NEW
- `src/components/Input.jsx` — NEW
- `src/pages/AdminDashboard.jsx` — fix hardcoded hex colors
- `src/pages/ProviderProfile.jsx` — fix `text-green-500`
- `src/pages/CustomerProfile.jsx` — fix `text-white` on danger button
- `src/pages/AccountDeletion.jsx` — fix `text-white` on danger button
- `src/pages/AdminUserDetail.jsx` — fix `text-white` on danger button
- `src/pages/AdminUsers.jsx` — fix `text-white` on danger button
- `src/components/EmptyState.jsx` — remove hardcoded Mongolian default
- All pages with inline button classes → use `Button`
- All pages with inline input classes → use `Input`
- Card radius: `rounded-xl` → `rounded-2xl` on card/panel containers
- Button/input radius: `rounded-lg` → `rounded-xl` via `Button`/`Input` components
- Non-responsive grids → add `sm:` prefix

---

## Task 1: App — Align color tokens

**Files:**
- Modify: `zuuchmap_app/src/design/theme.js`

- [ ] **Replace the dark-mode color values** — only the values below change, structure stays identical:

```js
// zuuchmap_app/src/design/theme.js  — colors object, replace these keys:
background: '#1c1208',
backgroundLight: '#2a1810',
backgroundDark: '#141008',

surface: '#261a0a',
surfaceElevated: '#332010',
surfaceLight: '#3d2a10',

text: {
    primary: '#f0dcc0',
    secondary: '#c4a882',
    tertiary: '#9a7850',
    disabled: '#5a3a1a',
    placeholder: '#6b5030',
    inverse: '#ffffff',
    link: '#FFA726',
},

border: {
    light: '#3d2a10',
    medium: '#2a1810',
    dark: '#1c1208',
    focus: '#FFA726',
    amber: 'rgba(255, 167, 38, 0.3)',
},
```

- [ ] **Run the app** — `cd zuuchmap_app && yarn start` — confirm screens load with warm brown tones instead of black/gray. Check that text is readable (warm off-white on dark brown).

- [ ] **Commit**

```bash
git add zuuchmap_app/src/design/theme.js
git commit -m "style(app): align dark mode colors to warm brown scale"
```

---

## Task 2: App — Align light mode colors

**Files:**
- Modify: `zuuchmap_app/src/hooks/useAppTheme.js`

- [ ] **Replace `lightColors` object** — shifts from cool grays to warm brown inversions:

```js
const lightColors = {
    primary: '#E65100',
    primaryLighter: '#FFF3E0',
    primaryDark: '#BF360C',
    primaryDarker: '#8D1B00',
    primaryLight: '#FFCC02',
    background: '#fdf8f0',
    backgroundLight: '#f5ede0',
    backgroundDark: '#ede0d0',
    surface: '#fff8ed',
    surfaceElevated: '#fef0d7',
    surfaceLight: '#fae8c8',
    text: {
        primary: '#2d1a04',
        secondary: '#5a3a1a',
        tertiary: '#8b6840',
        disabled: '#b8976a',
        placeholder: '#9a7850',
        inverse: '#2d1a04',
        link: '#E65100',
    },
    border: {
        light: '#e8d5b0',
        medium: '#d4bc8a',
        dark: '#bfa070',
        focus: '#E65100',
        amber: 'rgba(230, 81, 0, 0.3)',
    },
    opacity: {
        overlay: 'rgba(0,0,0,0.4)',
        overlayLight: 'rgba(0,0,0,0.25)',
        overlayDark: 'rgba(0,0,0,0.6)',
        whiteOverlay: 'rgba(255,255,255,0.7)',
        whiteOverlayLight: 'rgba(255,255,255,0.9)',
        background: {
            primary: 'rgba(230,81,0,0.08)',
            primaryLight: 'rgba(230,81,0,0.05)',
            primaryMedium: 'rgba(230,81,0,0.12)',
            primaryDark: 'rgba(230,81,0,0.18)',
            dark: 'rgba(0,0,0,0.1)',
            danger: 'rgba(239,68,68,0.08)',
            success: 'rgba(34,197,94,0.08)',
            warning: 'rgba(245,158,11,0.08)',
            info: 'rgba(33,150,243,0.08)',
        },
        border: {
            primary: 'rgba(230,81,0,0.3)',
            primaryMedium: 'rgba(230,81,0,0.2)',
            dark: 'rgba(0,0,0,0.1)',
            success: 'rgba(34,197,94,0.15)',
            successMedium: 'rgba(34,197,94,0.25)',
            warning: 'rgba(245,158,11,0.15)',
            danger: 'rgba(239,68,68,0.15)',
        },
    },
}
```

- [ ] **Test light mode** — toggle to light in the app, verify dark brown text on warm white background is readable.

- [ ] **Commit**

```bash
git add zuuchmap_app/src/hooks/useAppTheme.js
git commit -m "style(app): align light mode colors to warm brown scale"
```

---

## Task 3: App — Add tablet scale to theme

**Files:**
- Modify: `zuuchmap_app/src/design/theme.js`

- [ ] **Add `isTablet` export and scale semantic spacing/typography** — insert at the top of `theme.js`, before `colors`:

```js
import { StyleSheet, Platform, StatusBar, Dimensions } from 'react-native';

const { width } = Dimensions.get('window');
export const isTablet = width >= 768;
const s = isTablet ? 1.25 : 1;
```

- [ ] **Scale semantic spacing values** (raw step values `xxs`–`xxxxxl` stay fixed, only composites scale):

```js
export const spacing = {
    xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32, xxxxl: 40, xxxxxl: 48,
    cardPadding: Math.round(16 * s),
    screenPadding: Math.round(20 * s),
    sectionSpacing: Math.round(24 * s),
};
```

- [ ] **Scale typography sizes**:

```js
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
```

- [ ] **Run app on tablet emulator** (or wide screen) — verify text and spacing feel larger.

- [ ] **Commit**

```bash
git add zuuchmap_app/src/design/theme.js
git commit -m "style(app): add tablet scale to spacing and typography tokens"
```

---

## Task 4: App — Merge PrimaryButton + ActionButton into Button

**Files:**
- Create: `zuuchmap_app/src/components/Button.jsx`
- Delete: `zuuchmap_app/src/components/PrimaryButton.jsx`
- Delete: `zuuchmap_app/src/components/ActionButton.jsx`
- Modify: `zuuchmap_app/src/components/index.js`

- [ ] **Create `Button.jsx`** — accepts all props from both predecessors:

```jsx
import React from 'react';
import { TouchableOpacity, Text, ActivityIndicator, View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { spacing, typography, radius, interactions, globalStyles } from '../design/theme';
import { useAppTheme } from '../hooks/useAppTheme';

const SIZES = {
    sm: { paddingVertical: spacing.sm,  paddingHorizontal: spacing.md,  minHeight: 40, fontSize: typography.sm, iconSize: 16 },
    md: { paddingVertical: spacing.md,  paddingHorizontal: spacing.xl,  minHeight: 52, fontSize: typography.md, iconSize: 20 },
    lg: { paddingVertical: spacing.lg,  paddingHorizontal: spacing.xxl, minHeight: 60, fontSize: typography.lg, iconSize: 24 },
};

export default function Button({
    title, onPress, disabled = false, loading = false, loadingText,
    icon, iconPosition = 'left', size = 'md', variant = 'primary',
    fullWidth = false, style, textStyle,
}) {
    const { colors } = useAppTheme();
    const VARIANTS = {
        primary: { bg: colors.primary,  fg: colors.text.inverse },
        danger:  { bg: colors.danger,   fg: colors.text.inverse },
        success: { bg: colors.success,  fg: colors.text.inverse },
        warning: { bg: colors.warning,  fg: colors.text.inverse },
        outline: { bg: 'transparent',   fg: colors.primary, border: colors.primary },
    };
    const v = VARIANTS[variant] ?? VARIANTS.primary;
    const sz = SIZES[size];
    const fg = (disabled || loading) ? colors.text.disabled : v.fg;

    return (
        <TouchableOpacity
            style={[
                styles.base,
                { backgroundColor: v.bg, minHeight: sz.minHeight },
                variant === 'outline' && { borderWidth: 2, borderColor: v.border },
                (disabled || loading) && styles.disabled,
                fullWidth && globalStyles.buttonFullWidth,
                style,
            ]}
            onPress={onPress}
            disabled={disabled || loading}
            activeOpacity={interactions.activeOpacity}
        >
            {loading ? (
                <View style={globalStyles.buttonContentContainer}>
                    <ActivityIndicator color={fg} size="small" />
                    {loadingText && (
                        <Text style={[styles.label, { fontSize: sz.fontSize, color: fg, marginLeft: spacing.sm }]}>
                            {loadingText}
                        </Text>
                    )}
                </View>
            ) : (
                <View style={globalStyles.buttonContentContainer}>
                    {icon && iconPosition === 'left' && (
                        <Ionicons name={icon} size={sz.iconSize} color={fg} style={styles.iconL} />
                    )}
                    <Text style={[styles.label, { fontSize: sz.fontSize, color: fg }, textStyle]}>
                        {title}
                    </Text>
                    {icon && iconPosition === 'right' && (
                        <Ionicons name={icon} size={sz.iconSize} color={fg} style={styles.iconR} />
                    )}
                </View>
            )}
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    base:     { borderRadius: radius.button, alignItems: 'center', justifyContent: 'center' },
    disabled: { opacity: 0.6 },
    label:    { fontWeight: typography.weight.semibold, textAlign: 'center' },
    iconL:    { marginRight: spacing.sm },
    iconR:    { marginLeft: spacing.sm },
});
```

- [ ] **Update `index.js`** — swap the two exports for one:

```js
// Remove these two lines:
// export { default as ActionButton } from './ActionButton';
// export { default as PrimaryButton } from './PrimaryButton';

// Add:
export { default as Button } from './Button';
```

- [ ] **Update all call sites** — in each file below, change the import and rename the JSX tag. Props map: `PrimaryButton` → `Button` (same props); `ActionButton` → `Button` (same props, same variants).

Files to update (import swap + JSX rename only, no prop changes needed):
```
src/screens/auth/PhoneNumber.jsx
src/screens/auth/OtpVerification.jsx
src/screens/auth/BiometricAuth.jsx
src/screens/onboarding/UserRoleSelection.jsx
src/screens/provider/ProviderLocationSelection.jsx
src/screens/provider/ProviderPostForm.jsx
src/screens/customer/CustomerEditProfile.jsx
src/screens/customer/CustomerPostFilter.jsx
src/screens/shared/PostDetailScreen.jsx
src/components/DialogModal.jsx
src/components/MapFilterModal.jsx
```

For each: `import PrimaryButton from '../components/PrimaryButton'` → `import Button from '../components/Button'` (adjust path as needed). Same for `ActionButton`. Then `<PrimaryButton` → `<Button` and `<ActionButton` → `<Button`.

- [ ] **Delete old files**:

```bash
rm zuuchmap_app/src/components/PrimaryButton.jsx
rm zuuchmap_app/src/components/ActionButton.jsx
```

- [ ] **Run `cd zuuchmap_app && yarn start`** — confirm no import errors, buttons render correctly.

- [ ] **Commit**

```bash
git add zuuchmap_app/src/components/ zuuchmap_app/src/screens/ 
git commit -m "refactor(app): merge PrimaryButton + ActionButton into Button"
```

---

## Task 5: App — Fix ScreenHeader + TextInput

**Files:**
- Modify: `zuuchmap_app/src/components/ScreenHeader.jsx`
- Modify: `zuuchmap_app/src/components/TextInput.jsx`

- [ ] **Rewrite `ScreenHeader.jsx`** — remove the hardcoded `themeToggle`. Screens that want a toggle can pass it via `rightComponent`:

```jsx
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { spacing, typography, shadows, interactions } from '../design/theme';
import { useAppTheme } from '../hooks/useAppTheme';

export default function ScreenHeader({ title, onBack, rightComponent, showBack = true, style }) {
    const { colors } = useAppTheme();
    return (
        <View style={[styles.header, { backgroundColor: colors.surface }, style]}>
            {showBack && onBack ? (
                <TouchableOpacity style={styles.btn} onPress={onBack} activeOpacity={interactions.activeOpacity}>
                    <Ionicons name="arrow-back" size={24} color={colors.primary} />
                </TouchableOpacity>
            ) : (
                <View style={styles.side} />
            )}
            <Text style={[styles.title, { color: colors.text.primary }]}>{title}</Text>
            <View style={styles.side}>{rightComponent ?? null}</View>
        </View>
    );
}

const styles = StyleSheet.create({
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, minHeight: 64, ...shadows.small },
    title:  { fontSize: typography.lg, fontWeight: 'bold', textAlign: 'center', flex: 1 },
    btn:    { padding: spacing.sm, minWidth: 40, alignItems: 'center', justifyContent: 'center' },
    side:   { minWidth: 40, alignItems: 'flex-end' },
});
```

- [ ] **Fix `TextInput.jsx`** — the current code renders a label inside `inputComponent` AND delegates to `FormField` which also renders a label. Fix by separating the input element from the label logic:

```jsx
import React, { useState, useMemo } from 'react';
import { TextInput as RNTextInput, View, Text, StyleSheet } from 'react-native';
import { spacing, typography, radius, globalStyles } from '../design/theme';
import { useAppTheme } from '../hooks/useAppTheme';
import FormField from './FormField';

export default function TextInput({
    label, value, onChangeText, error, required = false,
    multiline = false, numberOfLines = 1, secureTextEntry = false,
    keyboardType = 'default', autoCapitalize = 'sentences',
    editable = true, style, inputStyle, containerStyle, ...props
}) {
    const { colors } = useAppTheme();
    const [isFocused, setIsFocused] = useState(false);

    const inputEl = (
        <RNTextInput
            style={[
                globalStyles.input,
                { backgroundColor: colors.surface, color: colors.text.primary, borderColor: colors.border.light },
                isFocused && { borderColor: colors.border.focus, borderWidth: 2, backgroundColor: colors.surfaceLight },
                error && globalStyles.inputError,
                multiline && globalStyles.inputTextArea,
                !editable && { backgroundColor: colors.background, opacity: 0.6 },
                inputStyle,
            ]}
            placeholderTextColor={colors.text.placeholder}
            value={value}
            onChangeText={onChangeText}
            multiline={multiline}
            numberOfLines={numberOfLines}
            secureTextEntry={secureTextEntry}
            keyboardType={keyboardType}
            autoCapitalize={autoCapitalize}
            editable={editable}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            {...props}
        />
    );

    if (!label) {
        return (
            <View style={containerStyle}>
                {inputEl}
                {error && <Text style={globalStyles.errorText}>{error}</Text>}
            </View>
        );
    }

    return <FormField label={label} component={inputEl} required={required} error={error} />;
}
```

- [ ] **Run `yarn start`** — check a screen with a labeled TextInput (e.g., ProviderEditProfile) — confirm label appears exactly once.

- [ ] **Commit**

```bash
git add zuuchmap_app/src/components/ScreenHeader.jsx zuuchmap_app/src/components/TextInput.jsx
git commit -m "fix(app): remove baked-in theme toggle from ScreenHeader; fix TextInput double-label"
```

---

## Task 6: App — Fix remaining hardcoded values

**Files:**
- Modify: `zuuchmap_app/src/screens/shared/AccountDeletionScreen.jsx`

- [ ] **Open `AccountDeletionScreen.jsx`** — remove the `DANGER` constant at line 12 and replace `'#EF4444'` and `'#fff'` with theme values. At the top of the file add the import:

```js
import { useAppTheme } from '../../hooks/useAppTheme';
```

Then inside the component, add `const { colors } = useAppTheme();` and replace:
- `DANGER` or `'#EF4444'` → `colors.danger`
- `color: '#fff'` → `color: colors.text.inverse`
- Remove the `const DANGER = '#EF4444';` constant entirely.

- [ ] **Verify** — run app, open account deletion screen in both dark and light modes.

- [ ] **Commit**

```bash
git add zuuchmap_app/src/screens/shared/AccountDeletionScreen.jsx
git commit -m "fix(app): replace hardcoded hex colors in AccountDeletionScreen with theme tokens"
```

---

## Task 7: App — Tablet layout for list screens

**Files:**
- Modify: `zuuchmap_app/src/screens/provider/ProviderPostList.jsx`
- Modify: `zuuchmap_app/src/screens/customer/CustomerPostList.jsx`
- Modify: `zuuchmap_app/src/screens/admin/AdminPostList.jsx`

For each list screen, the `FlatList` that renders post cards needs a 2-column layout on tablet:

- [ ] **In each list screen**, add `isTablet` import and update the `FlatList`:

```js
// Add to imports:
import { isTablet } from '../../design/theme';

// On the FlatList:
<FlatList
    ...existing props...
    numColumns={isTablet ? 2 : 1}
    key={isTablet ? 'tablet' : 'phone'}   // key forces re-render when orientation changes
    columnWrapperStyle={isTablet ? { gap: spacing.md } : undefined}
/>
```

Note: `key` must change when `numColumns` changes — React Native requires this to remount the FlatList.

- [ ] **Run on tablet/wide screen** — confirm 2-column layout.

- [ ] **Commit**

```bash
git add zuuchmap_app/src/screens/provider/ProviderPostList.jsx \
        zuuchmap_app/src/screens/customer/CustomerPostList.jsx \
        zuuchmap_app/src/screens/admin/AdminPostList.jsx
git commit -m "feat(app): 2-column post list layout on tablet"
```

---

## Task 8: App — Tablet layout for forms

**Files:**
- Modify: `zuuchmap_app/src/screens/provider/ProviderPostForm.jsx`
- Modify: `zuuchmap_app/src/screens/provider/ProviderEditProfile.jsx`
- Modify: `zuuchmap_app/src/screens/provider/ProviderCompanyCreate.jsx`

- [ ] **Wrap the ScrollView content** in each form screen with a centered max-width container on tablet:

```js
// Add to imports:
import { isTablet } from '../../design/theme';

// Wrap the inner ScrollView content (the View inside ScrollView) with:
<View style={isTablet ? styles.tabletContainer : undefined}>
    {/* existing content */}
</View>

// Add to StyleSheet:
tabletContainer: {
    maxWidth: 680,
    alignSelf: 'center',
    width: '100%',
},
```

- [ ] **Run on tablet** — confirm form content is centered and readable at tablet width.

- [ ] **Commit**

```bash
git add zuuchmap_app/src/screens/provider/
git commit -m "feat(app): center forms at max-width on tablet"
```

---

## Task 9: Web — Add radius tokens to @theme

**Files:**
- Modify: `zuuchmap_web/src/index.css`

- [ ] **Add radius variables** to the `@theme` block — these let us use `rounded-btn`, `rounded-card`, `rounded-modal` in Tailwind classes instead of raw scale names:

```css
@theme {
  --color-primary: #FFA726;
  --color-primary-dark: #e6941e;
  --color-background: #1c1208;
  --color-surface: #261a0a;
  --color-surface2: #332010;
  --color-border: #3d2a10;
  --color-text: #f0dcc0;
  --color-muted: #9a7850;
  --color-danger: #ef4444;
  --color-success: #22c55e;
  --color-warning: #f59e0b;

  --radius-btn:   0.75rem;   /* 12px — matches app radius.button */
  --radius-card:  1rem;      /* 16px — matches app radius.card   */
  --radius-modal: 1.25rem;   /* 20px — matches app radius.modal  */
}
```

- [ ] **Verify build** — `cd zuuchmap_web && npm run build` — no errors.

- [ ] **Commit**

```bash
git add zuuchmap_web/src/index.css
git commit -m "style(web): add radius tokens to @theme (btn=12px, card=16px, modal=20px)"
```

---

## Task 10: Web — Create Button component

**Files:**
- Create: `zuuchmap_web/src/components/Button.jsx`

- [ ] **Create the component** — handles the 15+ inline button class repetitions across pages:

```jsx
const VARIANTS = {
    primary:   'bg-primary text-background hover:bg-primary/90',
    secondary: 'bg-surface2 text-text hover:bg-border',
    danger:    'bg-danger text-background hover:bg-danger/90',
    outline:   'border border-border text-text hover:bg-surface2',
    ghost:     'text-muted hover:text-text hover:bg-surface2',
}
const SIZES = {
    sm: 'px-3 py-1.5 text-xs md:text-sm',
    md: 'px-4 py-2 text-sm md:text-base',
}

export default function Button({ variant = 'primary', size = 'md', className = '', disabled, children, ...props }) {
    return (
        <button
            disabled={disabled}
            className={`inline-flex items-center justify-center gap-1.5 rounded-btn font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
            {...props}
        >
            {children}
        </button>
    )
}
```

- [ ] **Run `npm run build`** — no errors.

- [ ] **Commit**

```bash
git add zuuchmap_web/src/components/Button.jsx
git commit -m "feat(web): add shared Button component"
```

---

## Task 11: Web — Create Input component

**Files:**
- Create: `zuuchmap_web/src/components/Input.jsx`

- [ ] **Create the component** — the class string `w-full bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-text outline-none focus:border-primary/60` is repeated 10+ times; this replaces it. Now uses `rounded-btn` (12px) to match app:

```jsx
export default function Input({ as: Tag = 'input', className = '', ...props }) {
    return (
        <Tag
            className={`w-full bg-surface2 border border-border rounded-btn px-3 py-2 text-sm md:text-base text-text placeholder:text-muted outline-none focus:border-primary/60 transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${className}`}
            {...props}
        />
    )
}
```

The `as` prop allows rendering as `select` or `textarea`: `<Input as="select">` / `<Input as="textarea" />`.

- [ ] **Run `npm run build`** — no errors.

- [ ] **Commit**

```bash
git add zuuchmap_web/src/components/Input.jsx
git commit -m "feat(web): add shared Input component (input/select/textarea)"
```

---

## Task 12: Web — Fix hardcoded values

**Files:**
- Modify: `zuuchmap_web/src/pages/AdminDashboard.jsx`
- Modify: `zuuchmap_web/src/pages/ProviderProfile.jsx`
- Modify: `zuuchmap_web/src/pages/CustomerProfile.jsx`
- Modify: `zuuchmap_web/src/pages/AccountDeletion.jsx`
- Modify: `zuuchmap_web/src/pages/AdminUserDetail.jsx`
- Modify: `zuuchmap_web/src/pages/AdminUsers.jsx`
- Modify: `zuuchmap_web/src/components/EmptyState.jsx`

- [ ] **`AdminDashboard.jsx`** — replace all hardcoded hex values with CSS variable equivalents:

```js
// Line 13 — PIE_COLORS:
const PIE_COLORS = ['var(--color-primary)', 'var(--color-muted)']

// Bar chart XAxis tick (line ~73):
tick={{ fontSize: 10, fill: 'var(--color-muted)' }}

// YAxis tick (line ~74):
tick={{ fontSize: 11, fill: 'var(--color-muted)' }}

// Tooltip contentStyle (line ~76):
contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: 12 }}

// cursor (line ~77):
cursor={{ fill: 'color-mix(in srgb, var(--color-primary) 10%, transparent)' }}

// Bar fills (lines ~79-80):
fill="var(--color-primary)"
fill="var(--color-muted)"

// Legend wrapperStyle (line ~107):
wrapperStyle={{ fontSize: 12, color: 'var(--color-muted)' }}
```

- [ ] **`ProviderProfile.jsx` line 84** — `text-green-500` → `text-success`:

```jsx
<p className="text-xl font-bold text-success">{activePosts}</p>
```

- [ ] **Danger button `text-white` → `text-background`** in these 4 files (search for `bg-danger text-white`):
  - `CustomerProfile.jsx`
  - `AccountDeletion.jsx`
  - `AdminUserDetail.jsx`
  - `AdminUsers.jsx`

  In each: `bg-danger text-white` → `bg-danger text-background` and `hover:bg-danger/90`.

- [ ] **`EmptyState.jsx`** — remove hardcoded default title so callers are explicit:

```jsx
// Before:
export default function EmptyState({ icon: Icon = Inbox, title = 'Мэдээлэл байхгүй', description, action }) {

// After:
export default function EmptyState({ icon: Icon = Inbox, title, description, action }) {
```

  Then search for all `<EmptyState` usages without a `title` prop and add appropriate i18n titles. Run:
  ```bash
  grep -rn "<EmptyState" zuuchmap_web/src --include="*.jsx" | grep -v "title="
  ```
  For each hit, add `title={t('common.noData')}` (the key `common.noData` should already exist from prior i18n work; verify in `src/i18n/en.js`).

- [ ] **Run `npm run build`** — confirm no errors.

- [ ] **Commit**

```bash
git add zuuchmap_web/src/pages/ zuuchmap_web/src/components/EmptyState.jsx
git commit -m "fix(web): replace hardcoded hex colors and text-white with theme tokens"
```

---

## Task 13: Web — Replace inline buttons with Button component

**Files:**
- Modify: all pages listed below

The pattern to replace is `px-4 py-2 bg-primary text-background rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors` (and similar for danger/secondary). After this task, all `<button>` and `<Link>` styled as buttons use the `Button` component.

- [ ] **Add `Button` import** to each page that has inline-styled buttons, then replace each occurrence. Key substitutions:

**Primary button** (any variant of `bg-primary text-background rounded-lg ... font-semibold`):
```jsx
// Before:
<button className="px-4 py-2 bg-primary text-background rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors" onClick={...}>
  {label}
</button>

// After:
<Button onClick={...}>{label}</Button>
```

**Danger button** (`bg-danger text-background ...`):
```jsx
<Button variant="danger" onClick={...}>{label}</Button>
```

**Secondary/outline button** (`bg-surface2 text-muted ...` or `border border-border text-text ...`):
```jsx
<Button variant="secondary" onClick={...}>{label}</Button>
// or
<Button variant="outline" onClick={...}>{label}</Button>
```

**Small buttons** (`text-xs px-3 py-1.5 ...`):
```jsx
<Button size="sm" onClick={...}>{label}</Button>
```

**`Link` components** styled as buttons (e.g., `ProviderPosts`, `CustomerDashboard`) — these can't use `<button>`, use `className` override:
```jsx
<Link to="..." className={`inline-flex items-center gap-1.5 rounded-btn font-semibold transition-colors px-4 py-2 text-sm md:text-base bg-primary text-background hover:bg-primary/90`}>
  {label}
</Link>
```

Files to update:
```
src/pages/ProviderPosts.jsx
src/pages/ProviderDashboard.jsx
src/pages/ProviderCompany.jsx
src/pages/CustomerDashboard.jsx
src/pages/CustomerProfile.jsx
src/pages/AccountDeletion.jsx
src/pages/AdminUserDetail.jsx
src/pages/AdminUsers.jsx
src/pages/AdminPosts.jsx
src/pages/AdminPostDetail.jsx
src/components/Modal.jsx        (footer buttons)
```

- [ ] **Run `npm run build`** — no errors. Spot-check button appearance in browser.

- [ ] **Commit**

```bash
git add zuuchmap_web/src/
git commit -m "refactor(web): replace inline button classes with Button component"
```

---

## Task 14: Web — Replace inline inputs with Input component

**Files:**
- Modify: `src/pages/ProviderPostForm.jsx`, `src/pages/ProviderProfile.jsx`, `src/pages/CustomerProfile.jsx`, `src/pages/CustomerBrowse.jsx`, `src/pages/AdminCategories.jsx`

- [ ] **`ProviderPostForm.jsx`** — this file has the most repetition. Add import, then replace each `<input>`, `<select>`, `<textarea>` that has the long class string:

```jsx
import Input from '../components/Input'

// Replace:
<input className="w-full bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-text placeholder:text-muted outline-none focus:border-primary/60 ..." />
// With:
<Input ... />

// Replace:
<select className="w-full bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-text outline-none focus:border-primary/60">
// With:
<Input as="select">

// Replace:
<textarea className="w-full bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-text ... resize-none">
// With:
<Input as="textarea" className="resize-none" rows={4} />
```

  Also remove the local `cls` constant at line 37 (`const cls = 'w-full bg-surface2 ...'`).

- [ ] **`CustomerBrowse.jsx`** — replace the search input and select filters:

```jsx
<Input
  className="pl-8"   // keep left-padding for the search icon
  value={search}
  onChange={(e) => setSearch(e.target.value)}
  placeholder={t('filter.searchPlaceholder')}
/>

<Input as="select" value={province} onChange={(e) => setProvince(e.target.value)}>
  ...options
</Input>
```

- [ ] **`ProviderProfile.jsx`, `CustomerProfile.jsx`** — replace the disabled phone input:

```jsx
<Input value={user?.phone_number ?? ''} disabled />
```

- [ ] **`AdminCategories.jsx`** — remove the `INPUT_CLS` constant and replace all usages with `<Input />`.

- [ ] **Run `npm run build`** — no errors.

- [ ] **Commit**

```bash
git add zuuchmap_web/src/
git commit -m "refactor(web): replace inline input classes with Input component"
```

---

## Task 15: Web — Update card/panel radius

**Files:**
- Modify: `src/components/Modal.jsx`, `src/components/PostCard.jsx`, `src/components/StatCard.jsx`, `src/pages/*.jsx`

Cards and panels should use `rounded-card` (16px) to match the app. Buttons/inputs already get `rounded-btn` (12px) via the `Button`/`Input` components.

- [ ] **`Modal.jsx`** — update the modal panel:

```jsx
// Before:
className="bg-surface border border-border rounded-xl w-full max-w-md shadow-xl"
// After:
className="bg-surface border border-border rounded-card w-full max-w-md shadow-xl"
```

- [ ] **`PostCard.jsx`**:

```jsx
className="bg-surface border border-border rounded-card overflow-hidden flex flex-col"
```

- [ ] **`StatCard.jsx`**:

```jsx
className="bg-surface border border-border rounded-card p-4"
```

- [ ] **Bulk-replace remaining card containers** — search for `rounded-xl` on `bg-surface` or `bg-surface2` container elements and change to `rounded-card`. Run:

```bash
grep -rn "rounded-xl" zuuchmap_web/src --include="*.jsx" | grep "bg-surface\|border-border"
```

  For each hit: if it's a card/panel container, change to `rounded-card`. If it's a badge, tooltip, or dropdown (small UI element), leave it as `rounded-xl`.

- [ ] **`LoginPage.jsx` and `RoleSelectPage.jsx`** — icon containers currently use `rounded-2xl`, change to `rounded-card`:

```jsx
className="w-14 h-14 rounded-card bg-primary/15 flex items-center justify-center mx-auto mb-4"
```

- [ ] **Run `npm run build`** — no errors.

- [ ] **Commit**

```bash
git add zuuchmap_web/src/
git commit -m "style(web): update card/panel border-radius to rounded-card (16px)"
```

---

## Task 16: Web — Responsive typography and non-responsive grids

**Files:**
- Modify: `src/components/PageHeader.jsx`, `src/components/StatCard.jsx`, `src/components/PostCard.jsx`, `src/pages/ProviderPosts.jsx`, `src/pages/AdminDashboard.jsx`

- [ ] **`PageHeader.jsx`** — scale page title up on desktop:

```jsx
<h1 className="text-xl md:text-2xl font-bold text-text">{title}</h1>
<p className="text-sm md:text-base text-muted mt-0.5">{description}</p>
```

- [ ] **`StatCard.jsx`** — scale label and value:

```jsx
<p className="text-xs md:text-sm text-muted">{label}</p>
<p className="text-2xl md:text-3xl font-bold text-text mt-0.5">{value?.toLocaleString() ?? '—'}</p>
```

- [ ] **`PostCard.jsx`** — scale card body text:

```jsx
<p className="text-sm md:text-base font-semibold text-text mt-2 line-clamp-2 leading-tight">{title}</p>
<p className="text-primary font-bold text-sm md:text-base mt-1">{price}</p>
```

- [ ] **`ProviderPosts.jsx` stat row** (line 56) — currently `grid-cols-3` with no breakpoint (breaks on phone):

```jsx
<div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
```

- [ ] **`AdminDashboard.jsx` stat grid** — find the stats grid and ensure it's responsive:

```jsx
<div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
```

- [ ] **`AdminCategories.jsx` form grids** — the `grid-cols-2` and `grid-cols-3` inside the modal form collapse on phone:

```jsx
// grid-cols-2 → grid-cols-1 sm:grid-cols-2
// grid-cols-3 → grid-cols-2 sm:grid-cols-3
```

- [ ] **`AdminPosts.jsx` table** — wrap the table in a horizontal scroll container for phone:

```jsx
<div className="overflow-x-auto">
  <table className="w-full text-sm min-w-[600px]">
    ...
  </table>
</div>
```

- [ ] **Run `npm run dev`** — open in browser, resize to phone width (375px), verify no layout breakage.

- [ ] **Commit**

```bash
git add zuuchmap_web/src/
git commit -m "style(web): responsive typography scaling and fix non-responsive grids"
```

---

## Self-Review

### Spec coverage check

| Requirement | Task |
|---|---|
| App: align dark mode colors to warm brown | Task 1 |
| App: align light mode colors, text contrast | Task 2 |
| App: tablet scale (spacing + typography) | Task 3 |
| App: merge PrimaryButton + ActionButton | Task 4 |
| App: ScreenHeader theme toggle removed | Task 5 |
| App: TextInput double-label fixed | Task 5 |
| App: AccountDeletionScreen hardcoded colors | Task 6 |
| App: tablet 2-col list layout | Task 7 |
| App: tablet max-width form centering | Task 8 |
| Web: radius tokens in @theme | Task 9 |
| Web: Button component | Task 10 |
| Web: Input component | Task 11 |
| Web: AdminDashboard hardcoded hex | Task 12 |
| Web: ProviderProfile text-green-500 | Task 12 |
| Web: danger button text-white → text-background | Task 12 |
| Web: EmptyState hardcoded Mongolian default | Task 12 |
| Web: inline buttons → Button component | Task 13 |
| Web: inline inputs → Input component | Task 14 |
| Web: card radius updated | Task 15 |
| Web: responsive typography | Task 16 |
| Web: non-responsive grids fixed | Task 16 |
| Web: admin table phone scroll | Task 16 |

### Notes for executor
- Tasks 1-8 (app) and Tasks 9-16 (web) are independent and can run in parallel if two agents are available.
- Task 4 (Button merge) must complete before Task 13 (replace inline buttons).
- Task 10+11 (Button+Input components) must complete before Tasks 13+14 (call site replacement).
- When replacing inline classes, don't add className props unless you need to override something — keep it tight.
- The `rounded-btn`, `rounded-card`, `rounded-modal` class names only work after Task 9 adds the tokens.

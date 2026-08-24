import React from 'react';
import { View, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { spacing, typography, radius, interactions } from '../design/theme';
import { useAppTheme } from '../hooks/useAppTheme';
import { useTranslation } from 'react-i18next';

const SearchInput = ({
    value = '',
    onChangeText,
    placeholder,
    onFocus,
    onBlur,
    showClearButton = true,
    containerStyle,
    inputStyle
}) => {
    const { colors } = useAppTheme();
    const { t } = useTranslation();
    const resolvedPlaceholder = placeholder ?? t('common.search');
    const [isFocused, setIsFocused] = React.useState(false);

    const handleFocus = (e) => {
        setIsFocused(true);
        if (onFocus) onFocus(e);
    };

    const handleBlur = (e) => {
        setIsFocused(false);
        if (onBlur) onBlur(e);
    };

    const handleClear = () => {
        onChangeText('');
    };

    return (
        <View style={[styles.searchContainer, containerStyle]}>
            <View style={[
                styles.searchInputContainer,
                colors.elevation.sm, { backgroundColor: colors.surface, borderColor: colors.border.light },
                isFocused && { borderColor: colors.border.focus, borderWidth: 2, backgroundColor: colors.surfaceLight }
            ]}>
                <View style={[styles.searchIcon, { backgroundColor: colors.opacity.background.primary }]}>
                    <Ionicons name="search" size={20} color={colors.iconAccent} />
                </View>
                <TextInput
                    style={[styles.searchInput, { color: colors.text.primary }, inputStyle]}
                    placeholder={resolvedPlaceholder}
                    placeholderTextColor={colors.text.placeholder}
                    value={value}
                    onChangeText={onChangeText}
                    onFocus={handleFocus}
                    onBlur={handleBlur}
                    // A search box is not prose: iOS otherwise capitalises the
                    // first letter and autocorrects Mongolian trade terms as
                    // they are typed. Mirrors TextInput.jsx's handling.
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="search"
                    accessibilityLabel={resolvedPlaceholder}
                />
                {showClearButton && value.length > 0 && (
                    <TouchableOpacity
                        onPress={handleClear}
                        style={styles.clearButton}
                        activeOpacity={interactions.activeOpacityLight}
                        hitSlop={interactions.hitSlop}
                        accessibilityRole="button"
                        accessibilityLabel={t('filter.searchClear')}
                    >
                        <Ionicons name="close-circle" size={20} color={colors.iconAccent} />
                    </TouchableOpacity>
                )}
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    searchContainer: {
        padding: spacing.lg,
    },
    searchInputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: radius.input,
        paddingHorizontal: spacing.lg,
        borderWidth: 1,
        minHeight: 52,
    },
    searchIcon: {
        marginRight: spacing.md,
        borderRadius: radius.input,
        padding: spacing.xs,
    },
    searchInput: {
        flex: 1,
        ...typography.styles.body,
        lineHeight: undefined,
    },
    clearButton: {
        padding: spacing.xs,
    },
});

export default SearchInput;

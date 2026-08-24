import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { spacing, typography } from '../design/theme';
import { useAppTheme } from '../hooks/useAppTheme';
import { useTranslation } from 'react-i18next';

const LocationRow = ({
    location,
    address,
    province,
    district,
    iconSize = 12,
    textStyle,
    containerStyle,
    numberOfLines = 1
}) => {
    const { colors } = useAppTheme();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const { t } = useTranslation();

    const getLocationText = () => {
        if (location) return location;
        if (address) return address;
        // province/district are enum codes (ULAANBAATAR, BAYANZURKH). Printing
        // them raw showed the storage format to the user; the labels live in
        // i18n under `province.<CODE>` / `district.<CODE>`.
        const locationParts = [
            province && t(`province.${province}`, { defaultValue: province }),
            district && t(`district.${district}`, { defaultValue: district }),
        ].filter(Boolean);
        return locationParts.length > 0
            ? locationParts.join(', ')
            : t('provider.locationUnknown');
    };

    return (
        <View style={[styles.container, containerStyle]}>
            <Ionicons name="location-outline" size={iconSize} color={colors.iconAccent} />
            <Text
                style={[styles.text, textStyle]}
                numberOfLines={numberOfLines}
            >
                {getLocationText()}
            </Text>
        </View>
    );
};

const createStyles = (colors) => StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    text: {
        ...typography.styles.small,
        color: colors.text.secondary,
        marginLeft: spacing.xs,
        flex: 1,
    },
});

export default React.memo(LocationRow);

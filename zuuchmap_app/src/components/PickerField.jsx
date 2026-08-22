import React, { useState, useEffect, useMemo } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { Ionicons } from '@expo/vector-icons';
import { spacing, typography, radius, interactions } from '../design/theme';
import { useAppTheme } from '../hooks/useAppTheme';
import { useTranslation } from 'react-i18next';

/**
 * PickerField — self-contained picker: trigger button + bottom-sheet modal.
 *
 * Props:
 *   value       — current selected value
 *   options     — array of { value, label } (strings are also accepted)
 *   onSelect    — called with the confirmed value
 *   placeholder — text shown when no value is selected
 *   error       — validation error string (highlights the button)
 *   title       — modal header title (falls back to placeholder)
 */
const PickerField = ({ value, options = [], onSelect, placeholder, error, title }) => {
    const [visible, setVisible] = useState(false);
    const [tempValue, setTempValue] = useState(value);
    const { colors, styles: gStyles } = useAppTheme();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const { t } = useTranslation();

    useEffect(() => {
        setTempValue(value);
    }, [value, visible]);

    const normalizedOptions = useMemo(
        () => options.map((o) =>
            typeof o === 'string' ? { value: o, label: o } : o
        ),
        [options]
    );

    const displayValue =
        normalizedOptions.find((o) => o.value === value)?.label || value || placeholder;

    const handleConfirm = () => {
        onSelect(tempValue);
        setVisible(false);
    };

    return (
        <>
            {/* Trigger button */}
            <TouchableOpacity
                style={[styles.pickerButton, error && gStyles.inputError]}
                onPress={() => setVisible(true)}
                activeOpacity={interactions.activeOpacityLight}
            >
                <Text style={[styles.pickerButtonText, !value && gStyles.placeholderText]}>
                    {displayValue}
                </Text>
                <Ionicons name="chevron-down" size={20} color={colors.primary} />
            </TouchableOpacity>

            {/* Bottom-sheet modal */}
            <Modal
                visible={visible}
                transparent={true}
                animationType="slide"
                onRequestClose={() => setVisible(false)}
            >
                <View style={[gStyles.modalOverlay, { backgroundColor: colors.opacity.overlay }]}>
                    <View style={[gStyles.modalContent, { backgroundColor: colors.surface, borderTopColor: colors.border.light }]}>
                        <View style={[gStyles.modalHeader, { borderBottomColor: colors.border.light }]}>
                            <TouchableOpacity
                                onPress={() => setVisible(false)}
                                style={gStyles.modalButton}
                                activeOpacity={interactions.activeOpacity}
                            >
                                <Text style={[gStyles.modalButtonText, { color: colors.primary }]}>
                                    {t('common.cancel')}
                                </Text>
                            </TouchableOpacity>
                            <Text style={[gStyles.modalTitle, { color: colors.text.primary }]}>
                                {title || placeholder}
                            </Text>
                            <TouchableOpacity
                                onPress={handleConfirm}
                                style={gStyles.modalButton}
                                activeOpacity={interactions.activeOpacity}
                            >
                                <Text style={[gStyles.modalButtonText, { ...typography.styles.bodyBold, color: colors.primary }]}>
                                    {t('common.done')}
                                </Text>
                            </TouchableOpacity>
                        </View>
                        <View style={styles.pickerContainer}>
                            <Picker
                                selectedValue={tempValue}
                                onValueChange={setTempValue}
                                style={[styles.picker, { color: colors.text.primary }]}
                                itemStyle={[styles.pickerItem, { color: colors.text.primary }]}
                            >
                                {normalizedOptions.map((option) => (
                                    <Picker.Item
                                        key={option.value}
                                        label={option.label}
                                        value={option.value}
                                    />
                                ))}
                            </Picker>
                        </View>
                    </View>
                </View>
            </Modal>
        </>
    );
};

const createStyles = (colors) => StyleSheet.create({
    pickerButton: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border.light,
        borderRadius: radius.input,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.md,
        minHeight: 52,
    },
    pickerButtonText: {
        ...typography.styles.body,
        color: colors.text.primary,
    },
    pickerContainer: {
        height: 200,
    },
    picker: {
        height: 200,
        width: '100%',
    },
    pickerItem: {
        // iOS-only: this is the height of ONE wheel row, not the wheel.
        ...typography.styles.body,
        color: colors.text.primary,
    },
});

export default PickerField;

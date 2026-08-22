import React, { useState, useMemo } from 'react';
import { View, Text, Modal, TouchableOpacity, TextInput, ScrollView, StyleSheet, Platform, KeyboardAvoidingView } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { spacing, typography, radius, interactions, safeAreaHelpers } from '../design/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '../hooks/useAppTheme';
import bookingService from '../services/api/bookingService';
import { invalidatePostData, queryClient } from '../services/queryClient';
import { showErrorModal, showInfoModal, getErrorMessage } from '../utils/errorManager';
import Button from './Button';
import PressableScale from './PressableScale';

// Local calendar date, not UTC: `toISOString()` in UTC+8 rolls the date back
// a day for any time before 08:00 and would submit the wrong booking window.
const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const BookingRequestModal = ({ visible, onClose, postId }) => {
    const { colors, styles: gStyles } = useAppTheme();
    const insets = useSafeAreaInsets();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const { t } = useTranslation();

    const [startDate, setStartDate] = useState(new Date());
    const [endDate, setEndDate] = useState(new Date(Date.now() + 24 * 60 * 60 * 1000));
    const [message, setMessage] = useState('');
    const [pickerFor, setPickerFor] = useState(null); // 'start' | 'end' | null

    const mut = useMutation({
        mutationFn: () => bookingService.create({
            postId,
            startDate: fmt(startDate),
            endDate: fmt(endDate),
            message,
        }),
        onSuccess: () => {
            invalidatePostData();
            queryClient.invalidateQueries({ queryKey: ['bookings'] });
            onClose();
            showInfoModal(t('booking.request'), t('booking.submitted'));
        },
        // Close the sheet BEFORE showing the error — two RN modals can't be
        // visible at once, so a dialog raised over the open sheet is swallowed
        // (and the send button would spin forever). Mirrors onSuccess.
        onError: (e) => {
            onClose();
            showErrorModal(t('common.error'), getErrorMessage(e) || t('booking.requestError'));
        },
    });

    const onPickerChange = (_event, selected) => {
        const target = pickerFor;
        if (Platform.OS !== 'ios') setPickerFor(null);
        if (!selected) return;
        if (target === 'start') {
            setStartDate(selected);
            if (selected > endDate) setEndDate(selected);
        } else {
            setEndDate(selected);
        }
    };

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.overlay}>
                <View style={[styles.sheet, { paddingBottom: safeAreaHelpers.getBottomSafeArea(insets) + spacing.lg }]}>
                    <View style={styles.header}>
                        <Text style={styles.title}>{t('booking.request')}</Text>
                        <TouchableOpacity
                            onPress={onClose}
                            activeOpacity={interactions.activeOpacityLight}
                            hitSlop={interactions.hitSlop}
                            accessibilityRole="button"
                            accessibilityLabel={t('common.close')}
                        >
                            <Ionicons name="close" size={24} color={colors.text.secondary} />
                        </TouchableOpacity>
                    </View>

                    <ScrollView
                        keyboardShouldPersistTaps="handled"
                        showsVerticalScrollIndicator={false}
                        contentContainerStyle={styles.scrollBody}
                    >

                    <View style={styles.dateRow}>
                        <PressableScale style={styles.dateBox} onPress={() => setPickerFor('start')} accessibilityRole="button">
                            <Text style={styles.dateLabel}>{t('booking.startDate')}</Text>
                            <Text style={styles.dateValue}>{fmt(startDate)}</Text>
                        </PressableScale>
                        <PressableScale style={styles.dateBox} onPress={() => setPickerFor('end')} accessibilityRole="button">
                            <Text style={styles.dateLabel}>{t('booking.endDate')}</Text>
                            <Text style={styles.dateValue}>{fmt(endDate)}</Text>
                        </PressableScale>
                    </View>

                    {pickerFor && (
                        <DateTimePicker
                            value={pickerFor === 'start' ? startDate : endDate}
                            mode="date"
                            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                            minimumDate={pickerFor === 'end' ? startDate : new Date()}
                            onChange={onPickerChange}
                        />
                    )}
                    {pickerFor && Platform.OS === 'ios' && (
                        <Button title={t('common.done', { defaultValue: 'OK' })} onPress={() => setPickerFor(null)} size="small" />
                    )}

                    <TextInput
                        style={[gStyles.input, gStyles.inputTextArea, styles.messageInput]}
                        value={message}
                        onChangeText={setMessage}
                        placeholder={t('booking.messagePlaceholder')}
                        placeholderTextColor={colors.text.placeholder}
                        multiline
                        numberOfLines={3}
                        textAlignVertical="top"
                    />

                    <Button
                        title={t('booking.submit')}
                        onPress={() => mut.mutate()}
                        disabled={mut.isPending}
                        loading={mut.isPending}
                        fullWidth
                    />
                    </ScrollView>
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
};

const createStyles = (colors) => StyleSheet.create({
    overlay: { flex: 1, backgroundColor: colors.opacity.overlay, justifyContent: 'flex-end' },
    sheet: {
        ...colors.elevation.lg,
        maxHeight: '85%',
        backgroundColor: colors.surface,
        borderTopLeftRadius: radius.modal,
        borderTopRightRadius: radius.modal,
        padding: spacing.lg,
        gap: spacing.md,
    },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    scrollBody: { gap: spacing.md },
    title: { ...typography.styles.title, color: colors.text.primary },
    dateRow: { flexDirection: 'row', gap: spacing.md },
    dateBox: {
        flex: 1,
        backgroundColor: colors.background,
        borderRadius: radius.card,
        borderWidth: 1,
        borderColor: colors.border.light,
        padding: spacing.md,
    },
    dateLabel: { ...typography.styles.small, color: colors.text.tertiary, marginBottom: spacing.xs },
    dateValue: { ...typography.styles.bodyBold, color: colors.text.primary },
    messageInput: { backgroundColor: colors.background, color: colors.text.primary, borderColor: colors.border.light },
});

export default BookingRequestModal;

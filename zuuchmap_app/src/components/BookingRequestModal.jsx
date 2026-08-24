import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { View, Text, Modal, TouchableOpacity, TextInput, ScrollView, StyleSheet, Platform, KeyboardAvoidingView } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { spacing, typography, radius, interactions, safeAreaHelpers } from '../design/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '../hooks/useAppTheme';
import bookingService from '../services/api/bookingService';
import { invalidatePostData, queryClient } from '../services/queryClient';
import { showInfoModal, getErrorMessage } from '../utils/errorManager';
import { track } from '../services/analytics';
import Button from './Button';
import PressableScale from './PressableScale';

// Local calendar date, not UTC: `toISOString()` in UTC+8 rolls the date back
// a day for any time before 08:00 and would submit the wrong booking window.
const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const BookingRequestModal = ({ visible, onClose, postId, availableFrom, availableUntil }) => {
    const { colors, styles: gStyles } = useAppTheme();
    const insets = useSafeAreaInsets();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const { t } = useTranslation();

    const [startDate, setStartDate] = useState(new Date());
    const [endDate, setEndDate] = useState(new Date(Date.now() + 24 * 60 * 60 * 1000));
    const [message, setMessage] = useState('');
    const [pickerFor, setPickerFor] = useState(null); // 'start' | 'end' | null
    // Failures render inside the sheet. Closing it to raise a dialog threw away
    // the dates and the message the customer had just typed — and the common
    // failures (past date, overlap, duplicate request) are all ones they fix here.
    const [submitError, setSubmitError] = useState(null);

    // Dates already taken by an accepted booking. Requesting one of these was a
    // guaranteed decline, and nothing on screen said so.
    const { data: busyRanges = [] } = useQuery({
        queryKey: ['bookings', 'busy', postId],
        queryFn: () => bookingService.busyRanges(postId),
        enabled: visible && !!postId,
        staleTime: 60_000,
    });

    const minDate = useMemo(() => {
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const from = availableFrom ? new Date(availableFrom) : null;
        return from && from > today ? from : today;
    }, [availableFrom]);

    const maxDate = useMemo(
        () => (availableUntil ? new Date(availableUntil) : undefined),
        [availableUntil],
    );

    const overlapsBusy = useMemo(() => {
        const s = fmt(startDate), e = fmt(endDate);
        return busyRanges.some((r) => s <= r.end_date && e >= r.start_date);
    }, [busyRanges, startDate, endDate]);

    // Checked before the request leaves the device, so an obvious mistake costs
    // a glance instead of a round trip that closes the sheet.
    const validationError = useMemo(() => {
        if (endDate < startDate) return t('booking.dateRangeError');
        if (overlapsBusy) return t('booking.datesTaken');
        return null;
    }, [endDate, startDate, overlapsBusy, t]);

    const mut = useMutation({
        mutationFn: () => bookingService.create({
            postId,
            startDate: fmt(startDate),
            endDate: fmt(endDate),
            message,
        }),
        onSuccess: () => {
            track('booking.requested', { post_id: postId });
            invalidatePostData();
            queryClient.invalidateQueries({ queryKey: ['bookings'] });
            onClose();
            showInfoModal(t('booking.request'), t('booking.submitted'));
        },
        // Stays in the sheet: the customer keeps their dates and message and can
        // adjust and resend. (A dialog can't be raised over an open RN modal
        // anyway — two modals can't be visible at once.)
        onError: (e) => {
            setSubmitError(getErrorMessage(e) || t('booking.requestError'));
        },
    });

    const handleSubmit = useCallback(() => {
        setSubmitError(null);
        if (validationError) return;
        mut.mutate();
    }, [validationError, mut]);

    // A fresh open should not inherit the last attempt's failure.
    useEffect(() => {
        if (visible) setSubmitError(null);
    }, [visible]);

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
                            minimumDate={pickerFor === 'end' ? startDate : minDate}
                            maximumDate={maxDate}
                            onChange={onPickerChange}
                        />
                    )}
                    {pickerFor && Platform.OS === 'ios' && (
                        <Button title={t('common.done', { defaultValue: 'OK' })} onPress={() => setPickerFor(null)} size="small" />
                    )}

                    {busyRanges.length > 0 && (
                        <View style={styles.busyBox}>
                            <Text style={styles.busyTitle}>{t('booking.datesTakenTitle')}</Text>
                            {busyRanges.slice(0, 4).map((r) => (
                                <Text key={`${r.start_date}-${r.end_date}`} style={styles.busyRange}>
                                    {r.start_date} — {r.end_date}
                                </Text>
                            ))}
                        </View>
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

                    {(validationError || submitError) && (
                        <View style={styles.errorBox}>
                            <Ionicons name="alert-circle-outline" size={18} color={colors.danger} />
                            <Text style={styles.errorText}>{validationError || submitError}</Text>
                        </View>
                    )}

                    <Button
                        title={t('booking.submit')}
                        onPress={handleSubmit}
                        disabled={mut.isPending || !!validationError}
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
    busyBox: {
        backgroundColor: colors.opacity.background.warning,
        borderRadius: radius.card,
        padding: spacing.md,
        gap: spacing.xs,
    },
    busyTitle: { ...typography.styles.labelStrong, color: colors.text.primary },
    busyRange: { ...typography.styles.caption, color: colors.text.secondary },
    errorBox: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        backgroundColor: colors.opacity.background.danger,
        borderRadius: radius.card,
        padding: spacing.md,
    },
    errorText: { ...typography.styles.caption, color: colors.danger, flex: 1 },
});

export default BookingRequestModal;

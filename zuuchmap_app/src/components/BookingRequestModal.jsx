import React, { useState, useMemo } from 'react';
import { View, Text, Modal, TouchableOpacity, TextInput, StyleSheet, Platform, KeyboardAvoidingView } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { spacing, typography, radius } from '../design/theme';
import { useAppTheme } from '../hooks/useAppTheme';
import bookingService from '../services/api/bookingService';
import { invalidatePostData } from '../services/queryClient';
import { showErrorModal, showInfoModal, getErrorMessage } from '../utils/errorManager';
import Button from './Button';

const fmt = (d) => d.toISOString().slice(0, 10);

const BookingRequestModal = ({ visible, onClose, postId }) => {
    const { colors, styles: gStyles } = useAppTheme();
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
            onClose();
            showInfoModal(t('booking.request'), t('booking.submitted'));
        },
        onError: (e) => showErrorModal(t('common.error'), getErrorMessage(e) || t('booking.requestError')),
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
                <View style={styles.sheet}>
                    <View style={styles.header}>
                        <Text style={styles.title}>{t('booking.request')}</Text>
                        <TouchableOpacity onPress={onClose}>
                            <Ionicons name="close" size={22} color={colors.text.secondary} />
                        </TouchableOpacity>
                    </View>

                    <View style={styles.dateRow}>
                        <TouchableOpacity style={styles.dateBox} onPress={() => setPickerFor('start')}>
                            <Text style={styles.dateLabel}>{t('booking.startDate')}</Text>
                            <Text style={styles.dateValue}>{fmt(startDate)}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.dateBox} onPress={() => setPickerFor('end')}>
                            <Text style={styles.dateLabel}>{t('booking.endDate')}</Text>
                            <Text style={styles.dateValue}>{fmt(endDate)}</Text>
                        </TouchableOpacity>
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
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
};

const createStyles = (colors) => StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
    sheet: {
        backgroundColor: colors.surface,
        borderTopLeftRadius: radius.sheet ?? 20,
        borderTopRightRadius: radius.sheet ?? 20,
        padding: spacing.lg,
        gap: spacing.md,
    },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    title: { fontSize: typography.lg, fontWeight: '700', color: colors.text.inverse },
    dateRow: { flexDirection: 'row', gap: spacing.md },
    dateBox: {
        flex: 1,
        backgroundColor: colors.background,
        borderRadius: radius.card,
        borderWidth: 1,
        borderColor: colors.border.light,
        padding: spacing.md,
    },
    dateLabel: { fontSize: typography.xs, color: colors.text.tertiary, marginBottom: spacing.xs },
    dateValue: { fontSize: typography.md, fontWeight: '600', color: colors.text.inverse },
    messageInput: { backgroundColor: colors.background, color: colors.text.inverse, borderColor: colors.border.light },
});

export default BookingRequestModal;

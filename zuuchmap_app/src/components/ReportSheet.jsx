import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation } from '@tanstack/react-query';
import { spacing, typography, radius, interactions } from '../design/theme';
import { useAppTheme } from '../hooks/useAppTheme';
import BottomSheetModal from './BottomSheetModal';
import Button from './Button';
import TextInput from './TextInput';
import reportService, { REPORT_REASONS } from '../services/api/reportService';
import { showErrorModal, showInfoModal, getErrorMessage } from '../utils/errorManager';

/**
 * Flag a listing that is already live. Same shape as the web's ReportModal:
 * one reason from the server's closed list, plus optional free text — the
 * reason is what the queue is filtered by, the text is what makes "OTHER"
 * mean anything.
 */
const ReportSheet = ({ visible, onClose, postId }) => {
    const { t } = useTranslation();
    const { colors } = useAppTheme();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const [reason, setReason] = useState(REPORT_REASONS[0]);
    const [detail, setDetail] = useState('');

    const handleClose = () => {
        setReason(REPORT_REASONS[0]);
        setDetail('');
        onClose();
    };

    const { data: reasons = REPORT_REASONS } = useQuery({
        queryKey: ['reports', 'reasons'],
        queryFn: reportService.reasons,
        staleTime: Infinity,
        enabled: visible,
    });

    const mutation = useMutation({
        mutationFn: () => reportService.create(postId, reason, detail.trim() || undefined),
        onSuccess: (result) => {
            setDetail('');
            handleClose();
            showInfoModal(t('report.title'), result?.duplicate ? t('report.duplicate') : t('report.submitted'));
        },
        onError: (error) => showErrorModal(t('common.error'), getErrorMessage(error) || t('report.failed')),
    });

    return (
        <BottomSheetModal
            visible={visible}
            onClose={handleClose}
            title={t('report.title')}
            footer={
                <Button
                    title={mutation.isPending ? t('report.submitting') : t('report.submit')}
                    onPress={() => mutation.mutate()}
                    loading={mutation.isPending}
                    fullWidth
                />
            }
        >
            <Text style={styles.lead}>{t('report.lead')}</Text>
            <View style={styles.list} accessibilityRole="radiogroup">
                {reasons.map((key) => {
                    const selected = reason === key;
                    return (
                        <TouchableOpacity
                            key={key}
                            style={[styles.row, selected && styles.rowSelected]}
                            onPress={() => setReason(key)}
                            activeOpacity={interactions.activeOpacity}
                            accessibilityRole="radio"
                            accessibilityState={{ selected, checked: selected }}
                        >
                            <Ionicons
                                name={selected ? 'radio-button-on' : 'radio-button-off'}
                                size={20}
                                color={selected ? colors.iconAccent : colors.text.tertiary}
                            />
                            <Text style={styles.rowText}>{t(`report.reasons.${key}`)}</Text>
                        </TouchableOpacity>
                    );
                })}
            </View>
            <TextInput
                label={t('report.detail')}
                value={detail}
                onChangeText={(v) => setDetail(v.slice(0, 1000))}
                placeholder={t('report.detailPlaceholder')}
                multiline
                numberOfLines={3}
                containerStyle={styles.detail}
            />
        </BottomSheetModal>
    );
};

const createStyles = (colors) => StyleSheet.create({
    lead: { ...typography.styles.body, color: colors.text.secondary, marginBottom: spacing.md },
    list: { gap: spacing.xs },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        minHeight: 44,
        paddingHorizontal: spacing.sm,
        borderRadius: radius.sm,
    },
    rowSelected: { backgroundColor: colors.opacity.background.primary },
    rowText: { ...typography.styles.body, color: colors.text.primary, flex: 1 },
    detail: { marginTop: spacing.md },
});

export default ReportSheet;

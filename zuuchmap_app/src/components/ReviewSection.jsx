import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { spacing, typography, radius } from '../design/theme';
import { useAppTheme } from '../hooks/useAppTheme';
import bookingService from '../services/api/bookingService';
import { showErrorModal, getErrorMessage } from '../utils/errorManager';
import { formatDateYYYYMMDD } from '../utils/displayUtils';
import Button from './Button';

const Stars = ({ value, size = 14, color, onSelect }) => (
    <View style={{ flexDirection: 'row', gap: 2 }}>
        {[1, 2, 3, 4, 5].map((i) => (
            <TouchableOpacity key={i} disabled={!onSelect} onPress={() => onSelect?.(i)}>
                <Ionicons name={i <= value ? 'star' : 'star-outline'} size={size} color={color} />
            </TouchableOpacity>
        ))}
    </View>
);

// Provider rating summary + review list + submit form (customers only)
const ReviewSection = ({ providerId, canReview }) => {
    const { colors, styles: gStyles } = useAppTheme();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const { t } = useTranslation();
    const qc = useQueryClient();

    const [showForm, setShowForm] = useState(false);
    const [rating, setRating] = useState(0);
    const [comment, setComment] = useState('');

    const { data } = useQuery({
        queryKey: ['reviews', providerId],
        queryFn: () => bookingService.providerReviews(providerId),
        enabled: Boolean(providerId),
        staleTime: 60 * 1000,
    });

    useEffect(() => {
        if (data?.own) {
            setRating(data.own.rating);
            setComment(data.own.comment ?? '');
        }
    }, [data?.own]);

    const mut = useMutation({
        mutationFn: () => bookingService.submitReview({ providerId, rating, comment }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['reviews', providerId] });
            setShowForm(false);
        },
        onError: (e) => {
            const status = e?.response?.status;
            showErrorModal(
                t('common.error'),
                status === 403 ? t('review.notEligible') : (getErrorMessage(e) || t('common.error')),
            );
        },
    });

    if (!providerId || !data) return null;

    return (
        <View style={styles.card}>
            <View style={styles.headerRow}>
                <Text style={styles.title}>{t('review.title')}</Text>
                <View style={styles.avgRow}>
                    <Stars value={Math.round(data.average)} color={colors.warning} />
                    <Text style={styles.avgText}>
                        {data.count ? data.average.toFixed(1) : '—'} · {t('review.count', { count: data.count })}
                    </Text>
                </View>
            </View>

            {canReview && !showForm && (
                <Button
                    title={data.own ? t('review.editRating', { defaultValue: t('review.yourRating') }) : t('review.submit')}
                    onPress={() => setShowForm(true)}
                    variant="secondary"
                    size="small"
                />
            )}

            {canReview && showForm && (
                <View style={styles.form}>
                    <Stars value={rating} size={26} color={colors.warning} onSelect={setRating} />
                    <TextInput
                        style={[gStyles.input, styles.commentInput]}
                        value={comment}
                        onChangeText={setComment}
                        placeholder={t('review.comment')}
                        placeholderTextColor={colors.text.placeholder}
                        multiline
                    />
                    <Button
                        title={t('review.submit')}
                        onPress={() => mut.mutate()}
                        disabled={!rating || mut.isPending}
                        loading={mut.isPending}
                        size="small"
                    />
                </View>
            )}

            {data.reviews.length === 0 ? (
                <Text style={styles.empty}>{t('review.empty')}</Text>
            ) : (
                data.reviews.slice(0, 5).map((r) => (
                    <View key={r.id} style={styles.reviewRow}>
                        <View style={styles.reviewHead}>
                            <Text style={styles.reviewAuthor}>{r.author?.given_name || '—'}</Text>
                            <Stars value={r.rating} size={11} color={colors.warning} />
                            <Text style={styles.reviewDate}>{formatDateYYYYMMDD(r.date_updated)}</Text>
                        </View>
                        {r.comment ? <Text style={styles.reviewComment}>{r.comment}</Text> : null}
                    </View>
                ))
            )}
        </View>
    );
};

const createStyles = (colors) => StyleSheet.create({
    card: {
        backgroundColor: colors.surface,
        borderRadius: radius.card,
        padding: spacing.lg,
        marginBottom: spacing.lg,
        gap: spacing.md,
    },
    headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm },
    title: { fontSize: typography.md, fontWeight: '700', color: colors.text.inverse },
    avgRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    avgText: { fontSize: typography.sm, color: colors.text.secondary },
    form: { gap: spacing.md },
    commentInput: { backgroundColor: colors.background, color: colors.text.inverse, borderColor: colors.border.light, minHeight: 60, textAlignVertical: 'top' },
    empty: { fontSize: typography.sm, color: colors.text.tertiary },
    reviewRow: { backgroundColor: colors.background, borderRadius: radius.card, padding: spacing.md, gap: spacing.xs },
    reviewHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
    reviewAuthor: { fontSize: typography.sm, fontWeight: '600', color: colors.text.inverse },
    reviewDate: { fontSize: typography.xs, color: colors.text.tertiary },
    reviewComment: { fontSize: typography.sm, color: colors.text.secondary },
});

export default ReviewSection;

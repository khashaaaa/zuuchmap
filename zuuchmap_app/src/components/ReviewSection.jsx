import React, { useState, useEffect, useMemo, useRef } from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { spacing, typography, radius, interactions, animations } from '../design/theme';
import { useAppTheme } from '../hooks/useAppTheme';
import { useReducedMotion } from '../hooks/useReducedMotion';
import bookingService from '../services/api/bookingService';
import { showErrorModal, showSuccessModal, getErrorMessage } from '../utils/errorManager';
import { formatDate } from '../utils/displayUtils';
import Button from './Button';

// In the rating input, each star lands with the selection breath as it fills,
// left to right at the list stagger — the one place a five-step tap sequence
// can feel designed. Read-only stars stay static Views.
const InputStar = ({ filled, index, size, color }) => {
    const reduced = useReducedMotion();
    const scale = useRef(new Animated.Value(1)).current;
    const wasFilled = useRef(filled);
    useEffect(() => {
        if (filled && !wasFilled.current && !reduced) {
            Animated.sequence([
                Animated.delay(index * animations.stagger),
                Animated.spring(scale, { toValue: animations.selection.scale, useNativeDriver: true, tension: animations.press.tension, friction: animations.press.friction }),
                Animated.spring(scale, { toValue: 1, useNativeDriver: true, tension: animations.press.tension, friction: animations.press.friction }),
            ]).start();
        }
        wasFilled.current = filled;
    }, [filled, index, reduced, scale]);
    return (
        <Animated.View style={{ transform: [{ scale }] }}>
            <Ionicons name={filled ? 'star' : 'star-outline'} size={size} color={color} />
        </Animated.View>
    );
};

// Read-only by default; only the rating input (onSelect set) is interactive, so
// the summary/row stars stay plain Views instead of stacks of dead touch areas.
// 14px is the legibility floor — a 3-star and 4-star provider must differ at a scroll.
const Stars = ({ value, size = 14, color, onSelect, t }) => (
    <View style={{ flexDirection: 'row', gap: spacing.xxs }}>
        {[1, 2, 3, 4, 5].map((i) => {
            return onSelect ? (
                <TouchableOpacity
                    key={i}
                    onPress={() => onSelect(i)}
                    activeOpacity={interactions.activeOpacityLight}
                    hitSlop={interactions.hitSlop}
                    accessibilityRole="button"
                    accessibilityState={{ selected: i <= value }}
                    accessibilityLabel={t ? t('common.rateStars', { count: i }) : String(i)}
                >
                    <InputStar filled={i <= value} index={i - 1} size={size} color={color} />
                </TouchableOpacity>
            ) : (
                <View key={i}>
                    <Ionicons name={i <= value ? 'star' : 'star-outline'} size={size} color={color} />
                </View>
            );
        })}
    </View>
);

/** Reviews shown before the list offers to expand. Mirrors the web section. */
const REVIEW_PREVIEW = 5;

// Provider rating summary + review list + submit form (customers only)
const ReviewSection = ({ providerId, canReview, autoOpen = false }) => {
    const { colors, styles: gStyles } = useAppTheme();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const { t } = useTranslation();
    const qc = useQueryClient();

    const [showForm, setShowForm] = useState(false);
    const [showAll, setShowAll] = useState(false);
    const [rating, setRating] = useState(0);
    const [comment, setComment] = useState('');
    // Deep link from a review-prompt push lands with the form already open.
    useEffect(() => { if (autoOpen && canReview) setShowForm(true); }, [autoOpen, canReview]);

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
            showSuccessModal(t('review.title'), t('review.submitted'));
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
                    <Stars value={rating} size={26} color={colors.warning} onSelect={setRating} t={t} />
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
                <>
                    {(showAll ? data.reviews : data.reviews.slice(0, REVIEW_PREVIEW)).map((r) => (
                        <View key={r.id} style={styles.reviewRow}>
                            <View style={styles.reviewHead}>
                                <Text style={styles.reviewAuthor} numberOfLines={1}>{r.author?.given_name || '—'}</Text>
                                <Stars value={r.rating} size={14} color={colors.warning} />
                                <Text style={styles.reviewDate}>{formatDate(r.date_updated)}</Text>
                            </View>
                            {r.comment ? <Text style={styles.reviewComment}>{r.comment}</Text> : null}
                        </View>
                    ))}
                    {data.reviews.length > REVIEW_PREVIEW && !showAll && (
                        <TouchableOpacity
                            onPress={() => setShowAll(true)}
                            activeOpacity={interactions.activeOpacityLight}
                            hitSlop={interactions.hitSlop}
                        >
                            <Text style={styles.showAll}>{t('review.showAll', { count: data.reviews.length })}</Text>
                        </TouchableOpacity>
                    )}
                </>
            )}
        </View>
    );
};

const createStyles = (colors) => StyleSheet.create({
    card: {
        ...colors.elevation.sm,
        backgroundColor: colors.surface,
        borderRadius: radius.card,
        padding: spacing.lg,
        marginBottom: spacing.lg,
        gap: spacing.md,
    },
    headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm },
    title: { ...typography.styles.title, color: colors.text.primary },
    avgRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    avgText: { ...typography.styles.caption, color: colors.text.secondary },
    form: { gap: spacing.md },
    commentInput: { backgroundColor: colors.background, color: colors.text.primary, borderColor: colors.border.light, minHeight: 60, textAlignVertical: 'top' },
    empty: { ...typography.styles.caption, color: colors.text.tertiary },
    reviewRow: { backgroundColor: colors.background, borderRadius: radius.card, padding: spacing.md, gap: spacing.xs },
    reviewHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
    reviewAuthor: { ...typography.styles.label, color: colors.text.primary, flexShrink: 1 },
    reviewDate: { ...typography.styles.small, color: colors.text.tertiary },
    // The review body is the content of the card; read it at body weight, not as
    // the faintest line on it.
    reviewComment: { ...typography.styles.body, color: colors.text.primary },
    showAll: { ...typography.styles.labelStrong, color: colors.text.link },
});

export default ReviewSection;

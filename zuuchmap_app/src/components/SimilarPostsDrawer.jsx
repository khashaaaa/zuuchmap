import React, { useMemo, useCallback } from 'react';
import { View, Text, Image, FlatList, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { spacing, typography, radius, withAlpha, toneForTheme, isTablet } from '../design/theme';
import { useAppTheme } from '../hooks/useAppTheme';
import { useCategorySchemas } from '../hooks/useCategorySchemas';
import postService from '../services/api/postService';
import { getPostTypeConfig, normalizePostType, getPostTitle, getPostPrice, getSchemaLabel } from '../utils/postUtils';
import PressableScale from './PressableScale';
import FadeSlideIn from './FadeSlideIn';
import AvailabilityStrip from './AvailabilityStrip';

export const H_CARD_WIDTH = isTablet ? 260 : 208;
export const H_CARD_GAP = spacing.md;

/**
 * The one horizontal post card: photo on top, category pill on the photo,
 * title / price / place below. Used by the similar-posts rail and the map
 * carousel so the two read as the same object at different sizes.
 */
export const HorizontalPostCard = React.memo(({ post, onPress, width = H_CARD_WIDTH, showAvailability = false, style }) => {
    const { colors, isDark } = useAppTheme();
    const { t } = useTranslation();
    const schemas = useCategorySchemas();
    const styles = useMemo(() => createStyles(colors), [colors]);

    const type = normalizePostType(post.post_type || post.category);
    const schema = schemas.find((s) => s.key === type);
    const cfg = getPostTypeConfig(type, colors, schemas);
    const title = getPostTitle(post, type);
    const price = getPostPrice(post);
    const image = post.images?.[0] || post.imageUrl;
    const place = [
        post.district && t(`district.${post.district}`, { defaultValue: post.district }),
        post.province && t(`province.${post.province}`, { defaultValue: post.province }),
    ].filter(Boolean).join(', ');
    const label = schema ? getSchemaLabel(schema) : t('category.' + type, { defaultValue: type });
    const rental = showAvailability && Boolean(schema?.has_rental_status);

    return (
        <PressableScale
            style={[styles.card, { width }, style]}
            onPress={() => onPress?.(post)}
            accessibilityRole="button"
            accessibilityLabel={[title, price, place].filter(Boolean).join(', ')}
        >
            <View style={styles.imageWrap}>
                {image ? (
                    <Image source={{ uri: image }} style={styles.image} resizeMode="cover" />
                ) : (
                    <View style={[styles.image, styles.placeholder, { backgroundColor: withAlpha(cfg.color, 0.13) }]}>
                        <Ionicons name={cfg.iconName} size={28} color={toneForTheme(cfg.color, isDark)} />
                    </View>
                )}
                <View style={[styles.pill, { backgroundColor: cfg.color }]}>
                    <Ionicons name={cfg.iconName} size={11} color={colors.text.onColor} />
                    <Text style={styles.pillText} numberOfLines={1}>{label}</Text>
                </View>
            </View>
            <View style={styles.body}>
                <Text style={styles.title} numberOfLines={2}>{title}</Text>
                {price ? <Text style={styles.price} numberOfLines={1}>{price}</Text> : null}
                {place ? (
                    <View style={styles.placeRow}>
                        <Ionicons name="location-outline" size={12} color={colors.text.tertiary} />
                        <Text style={styles.place} numberOfLines={1}>{place}</Text>
                    </View>
                ) : null}
                {rental && <AvailabilityStrip busyDates={post.busy_dates} size="sm" style={styles.strip} />}
            </View>
        </PressableScale>
    );
});

/**
 * "More like this" at the foot of a post — the drawer of neighbours a reader
 * would otherwise go back and hunt for. Renders nothing until there is
 * something to show, so an empty rail never leaves a headed hole.
 */
const SimilarPostsDrawer = ({ postId, onPressPost, style }) => {
    const { colors } = useAppTheme();
    const { t } = useTranslation();
    const styles = useMemo(() => createStyles(colors), [colors]);

    const { data: posts = [] } = useQuery({
        queryKey: ['posts', 'similar', postId],
        queryFn: () => postService.getSimilar(postId),
        enabled: Boolean(postId),
        staleTime: 5 * 60 * 1000,
    });

    const renderItem = useCallback(({ item, index }) => (
        <FadeSlideIn index={index}>
            <HorizontalPostCard post={item} onPress={onPressPost} />
        </FadeSlideIn>
    ), [onPressPost]);

    if (!posts.length) return null;

    return (
        <View style={[styles.section, style]}>
            <Text style={styles.sectionLabel}>{t('posts.similarTitle')}</Text>
            <FlatList
                horizontal
                data={posts}
                keyExtractor={(p) => String(p.id)}
                renderItem={renderItem}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.rail}
                snapToInterval={H_CARD_WIDTH + H_CARD_GAP}
                decelerationRate="fast"
                ItemSeparatorComponent={() => <View style={{ width: H_CARD_GAP }} />}
            />
        </View>
    );
};

const createStyles = (colors) => StyleSheet.create({
    section: { marginBottom: spacing.md, gap: spacing.sm },
    sectionLabel: {
        ...typography.styles.overline,
        textTransform: 'uppercase',
        color: colors.text.tertiary,
        paddingHorizontal: spacing.lg,
    },
    rail: { paddingHorizontal: spacing.lg, paddingVertical: spacing.xs },
    card: {
        ...colors.elevation.sm,
        backgroundColor: colors.surface,
        borderRadius: radius.card,
        borderWidth: 1,
        borderColor: colors.border.light,
        overflow: 'hidden',
    },
    imageWrap: { height: 110, backgroundColor: colors.border.light },
    image: { width: '100%', height: '100%' },
    placeholder: { alignItems: 'center', justifyContent: 'center' },
    pill: {
        position: 'absolute',
        top: spacing.sm,
        left: spacing.sm,
        maxWidth: '85%',
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.xxs + 1,
        borderRadius: radius.full,
    },
    pillText: { ...typography.styles.badge, color: colors.text.onColor, flexShrink: 1 },
    body: { padding: spacing.md, gap: spacing.xs },
    title: { ...typography.styles.bodyBold, color: colors.text.primary, minHeight: 40 },
    price: { ...typography.styles.price, color: colors.text.link },
    placeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    place: { ...typography.styles.small, color: colors.text.tertiary, flexShrink: 1 },
    strip: { marginTop: spacing.xs },
});

export default SimilarPostsDrawer;

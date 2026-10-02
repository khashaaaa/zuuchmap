import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import ThumbImage from './ThumbImage';
import { Ionicons } from '@expo/vector-icons';
import PressableScale from './PressableScale';
import CategoryBadge from './CategoryBadge';
import StatusBadge from './StatusBadge';
import { spacing, typography, radius, tintOn, isTablet } from '../design/theme';
import { useAppTheme } from '../hooks/useAppTheme';

// An inset square rather than a full-height strip: stretched to the card, a
// rental card's photo became a sliver twice as tall as it was wide.
const THUMB = isTablet ? 120 : 96;

/**
 * The one list card for a post: inset square thumbnail, title row with a trailing
 * action, a badge row, price, whatever the screen adds below, and a footer.
 * Customer browse, saved posts, the provider's own posts and the admin queue
 * all render this; only `actions`/`badges`/`children`/`footer` differ.
 *
 * `memoKey` — anything whose change should re-render the card beyond `item`
 * identity (the liked flag, a loading state, a stats row). Nodes passed as
 * props are recreated every render, so they cannot be compared directly.
 */
const PostCard = ({
    item,
    onPress,
    imageUri,
    title,
    price,
    actions,
    badges,
    children,
    footer,
    trailing,
    emphasized = false,
    statusOverlay = false,
    style,
    memoKey: _memoKey,
}) => {
    const { colors } = useAppTheme();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const [imageError, setImageError] = useState(false);
    const handleImageError = useCallback(() => setImageError(true), []);
    // A card that once failed kept showing the placeholder for the rest of its
    // life, even after a refetch handed it a working URL — the flag has to
    // follow the source it describes.
    useEffect(() => { setImageError(false); }, [imageUri]);
    const handlePress = useCallback(() => onPress?.(item), [item, onPress]);
    const statusFlag =
        item.approval_status && item.approval_status !== 'APPROVED' ? item.approval_status : null;
    // Paid placement, server-decided. A star on the photo (the web's corner
    // marker) — as a badge-row pill it sat on every featured card's busiest line.
    const featured = !!item.featured_until && new Date(item.featured_until) > new Date();

    return (
        <PressableScale
            style={[styles.postCard, emphasized && styles.emphasizedCard, style]}
            onPress={handlePress}
            accessibilityRole="button"
        >
            <View style={styles.imageContainer}>
                {imageUri && !imageError ? (
                    <ThumbImage
                        uri={imageUri}
                        style={styles.postImage}
                        resizeMode="cover"
                        onFail={handleImageError}
                        fadeDuration={200}
                    />
                ) : (
                    <View style={styles.noImageContainer}>
                        <Ionicons name="image-outline" size={28} color={colors.iconAccent} />
                    </View>
                )}
                {/* The thumbnail holds status (top-right) and the featured star
                    (top-left); everything else lives in the content column.
                    Moderation outranks the lifecycle state — a listing that was
                    rejected or is still in review says so, and only then does
                    the card fall back to ACTIVE/RENTED/EXPIRED. Browse only ever
                    carries APPROVED posts, so this changes nothing there; it is
                    the saved list, where a customer keeps a listing the seller
                    may since have had refused, that had no way to say so. */}
                {/* A plain ACTIVE says nothing — every browse card is live —
                    and stamped on every photo it drowned out the Rented and
                    Expired badges that do mean something. No badge = live. */}
                {statusOverlay && (statusFlag || (item.status !== 'ACTIVE' && item.status)) ? (
                    <StatusBadge status={statusFlag || item.status} variant="overlay" position="absolute" showIndicator={false} />
                ) : null}
                {featured ? (
                    <View style={styles.featuredMark}>
                        <Ionicons name="star" size={11} color={colors.onPrimary} />
                    </View>
                ) : null}
            </View>

            <View style={styles.postContent}>
                <View style={styles.postHeader}>
                    <Text style={styles.postTitle} numberOfLines={2}>{title}</Text>
                    {actions}
                </View>

                {badges === undefined ? (
                    <CategoryBadge postType={item.post_type || item.category || 'construction'} showIcon={true} />
                ) : badges}

                {price ? <Text style={styles.postPrice}>{price}</Text> : null}

                {children}

                {footer ? <View style={styles.postFooter}>{footer}</View> : null}
            </View>

            {trailing}
        </PressableScale>
    );
};

const createStyles = (colors) => StyleSheet.create({
    postCard: {
        ...colors.elevation.sm,
        backgroundColor: colors.surface,
        borderRadius: radius.card,
        marginBottom: spacing.md,
        overflow: 'hidden',
        flexDirection: 'row',
        alignItems: 'flex-start',
        padding: spacing.sm,
        gap: spacing.md,
        borderWidth: 1,
        borderColor: colors.border.light,
    },
    emphasizedCard: {
        ...colors.elevation.selected,
        // Opaque, because the card is elevated (see `tintOn`).
        backgroundColor: tintOn(colors.primary, 0.08, colors.surface),
    },
    imageContainer: {
        width: THUMB,
        height: THUMB,
        borderRadius: radius.inset,
        overflow: 'hidden',
        backgroundColor: colors.border.light,
    },
    // Absolutely positioned so the image can never dictate the box's size.
    postImage: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
    noImageContainer: {
        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
        justifyContent: 'center',
        alignItems: 'center',
    },
    featuredMark: {
        position: 'absolute',
        top: spacing.xs,
        left: spacing.xs,
        width: 20,
        height: 20,
        borderRadius: radius.pill,
        backgroundColor: colors.primary,
        alignItems: 'center',
        justifyContent: 'center',
    },
    postContent: {
        flex: 1,
        minHeight: THUMB,
        gap: spacing.xs,
    },
    postHeader: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: spacing.xs,
    },
    postTitle: {
        ...typography.styles.title,
        flex: 1,
        color: colors.text.primary,
    },
    postPrice: {
        ...typography.styles.price,
        color: colors.text.link,
    },
    postFooter: {
        flexDirection: 'row',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: spacing.xs,
        // Sits at the card's bottom edge when the content is shorter than the
        // thumbnail, so a two-line and a one-line title align their footers.
        marginTop: 'auto',
        paddingTop: spacing.xxs,
    },
});

export default React.memo(PostCard, (a, b) =>
    a.item === b.item
    && a.onPress === b.onPress
    && a.imageUri === b.imageUri
    && a.title === b.title
    && a.price === b.price
    && a.emphasized === b.emphasized
    && a.statusOverlay === b.statusOverlay
    && a.style === b.style
    && a.memoKey === b.memoKey
);

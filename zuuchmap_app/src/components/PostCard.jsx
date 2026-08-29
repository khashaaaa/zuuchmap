import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import PressableScale from './PressableScale';
import CategoryBadge from './CategoryBadge';
import StatusBadge from './StatusBadge';
import { spacing, typography, radius } from '../design/theme';
import { useAppTheme } from '../hooks/useAppTheme';

/**
 * The one list card for a post: 96pt thumbnail, title row with a trailing
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
    const handlePress = useCallback(() => onPress?.(item), [item, onPress]);

    return (
        <PressableScale
            style={[styles.postCard, emphasized && styles.emphasizedCard, style]}
            onPress={handlePress}
            accessibilityRole="button"
        >
            <View style={styles.imageContainer}>
                {imageUri && !imageError ? (
                    <Image
                        source={{ uri: imageUri }}
                        style={styles.postImage}
                        resizeMode="cover"
                        onError={handleImageError}
                        fadeDuration={200}
                    />
                ) : (
                    <View style={styles.noImageContainer}>
                        <Ionicons name="image-outline" size={28} color={colors.iconAccent} />
                    </View>
                )}
                {/* The thumbnail holds exactly one overlay: status belongs on
                    the photo, everything else lives in the content column. */}
                {statusOverlay && item.status ? (
                    <StatusBadge status={item.status} variant="overlay" position="absolute" showIndicator={false} />
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
        minHeight: 120,
        borderWidth: 1,
        borderColor: colors.border.light,
    },
    emphasizedCard: {
        ...colors.elevation.selected,
        backgroundColor: colors.opacity.background.primaryLight,
    },
    imageContainer: {
        width: 96,
        alignSelf: 'stretch',
        overflow: 'hidden',
        backgroundColor: colors.border.light,
    },
    // Absolutely positioned so the image can never dictate the card's height:
    // a percentage height inside a stretch-sized box falls back to the image's
    // intrinsic size (800px seed photos → screen-tall cards).
    postImage: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
    noImageContainer: {
        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
        justifyContent: 'center',
        alignItems: 'center',
    },
    postContent: {
        flex: 1,
        padding: spacing.md,
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

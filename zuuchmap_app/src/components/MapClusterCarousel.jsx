import React, { useMemo, useCallback, useRef, useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { spacing, typography, radius, interactions, isTablet } from '../design/theme';
import { useAppTheme } from '../hooks/useAppTheme';
import FadeSlideIn from './FadeSlideIn';
import { HorizontalPostCard } from './SimilarPostsDrawer';

const GAP = spacing.md;

/**
 * The bottom-pinned rail that opens when a map pin or cluster is tapped.
 * Cards snap one at a time; the counter tells the reader how deep the stack
 * goes. Swiping to a card reports it back (`onActiveChange`) so the map can
 * nudge its camera to the pin under the card.
 */
const MapClusterCarousel = ({ posts, onPressPost, onClose, onActiveChange, bottom = 0 }) => {
    const { colors } = useAppTheme();
    const { t } = useTranslation();
    const { width: screenWidth } = useWindowDimensions();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const listRef = useRef(null);
    const [active, setActive] = useState(0);

    const cardWidth = Math.min(isTablet ? 340 : screenWidth - spacing.lg * 2 - 36, 420);
    const interval = cardWidth + GAP;
    const sidePad = (screenWidth - cardWidth) / 2;

    useEffect(() => {
        setActive(0);
        listRef.current?.scrollToOffset?.({ offset: 0, animated: false });
    }, [posts]);

    const onMomentumEnd = useCallback((e) => {
        const i = Math.round(e.nativeEvent.contentOffset.x / interval);
        const clamped = Math.max(0, Math.min(posts.length - 1, i));
        if (clamped !== active) {
            setActive(clamped);
            onActiveChange?.(posts[clamped], clamped);
        }
    }, [interval, posts, active, onActiveChange]);

    const renderItem = useCallback(({ item, index }) => (
        <FadeSlideIn index={Math.min(index, 3)}>
            <HorizontalPostCard post={item} onPress={onPressPost} width={cardWidth} showAvailability />
        </FadeSlideIn>
    ), [onPressPost, cardWidth]);

    if (!posts?.length) return null;

    return (
        <View style={[styles.wrap, { bottom }]} pointerEvents="box-none">
            <View style={styles.headRow}>
                <Text style={styles.counter}>
                    {posts.length > 1
                        ? t('map.carouselCounter', { index: active + 1, count: posts.length })
                        : t('map.postsAtLocation', { count: 1 })}
                </Text>
                <TouchableOpacity
                    onPress={onClose}
                    hitSlop={interactions.hitSlop}
                    accessibilityRole="button"
                    accessibilityLabel={t('common.close')}
                    style={styles.closeBtn}
                >
                    <Ionicons name="close" size={16} color={colors.text.secondary} />
                </TouchableOpacity>
            </View>
            <FlatList
                ref={listRef}
                horizontal
                data={posts}
                keyExtractor={(p) => `${p.post_type}-${p.id}`}
                renderItem={renderItem}
                showsHorizontalScrollIndicator={false}
                snapToInterval={interval}
                snapToAlignment="start"
                decelerationRate="fast"
                onMomentumScrollEnd={onMomentumEnd}
                contentContainerStyle={{ paddingHorizontal: sidePad }}
                ItemSeparatorComponent={() => <View style={{ width: GAP }} />}
                getItemLayout={(_, i) => ({ length: interval, offset: interval * i, index: i })}
            />
        </View>
    );
};

const createStyles = (colors) => StyleSheet.create({
    wrap: { position: 'absolute', left: 0, right: 0, gap: spacing.sm },
    headRow: {
        alignSelf: 'center',
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        paddingLeft: spacing.md,
        paddingRight: spacing.xs,
        paddingVertical: spacing.xs,
        borderRadius: radius.full,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border.light,
    },
    counter: { ...typography.styles.label, color: colors.text.secondary, fontVariant: ['tabular-nums'] },
    closeBtn: {
        width: 24, height: 24, borderRadius: radius.full,
        alignItems: 'center', justifyContent: 'center',
        backgroundColor: colors.surfaceLight,
    },
});

export default MapClusterCarousel;

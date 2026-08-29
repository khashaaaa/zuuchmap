import React, { useState, useCallback, useMemo } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import {
    View,
    Text,
    FlatList,
    TouchableOpacity,
    RefreshControl,
    ScrollView,
    StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { spacing, typography, radius, interactions, isTablet, toneForTheme } from '../../design/theme';
import { useAppTheme } from '../../hooks/useAppTheme';
import { useTranslation } from 'react-i18next';
import PostCard from '../../components/PostCard';
import { ScreenLayout, EmptyState, SkeletonItem, SelectionPop } from '../../components';
import ScreenError from '../../components/ScreenError';
import postService from '../../services/api/postService';
import { getPostImageUrl } from '../../config/api.config';
import { getPostTitle, getSchemaLabel } from '../../utils/postUtils';
import { formatDate } from '../../utils/displayUtils';
import categoryService from '../../services/api/categoryService';


const AdminPostList = ({ navigation, route }) => {
    const insets = useSafeAreaInsets();
    const { colors, isDark } = useAppTheme();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const { t } = useTranslation();
    const initialFilter = route?.params?.filterType || 'all';
    const [activeFilter, setActiveFilter] = useState(initialFilter);

    const { data: categories = [] } = useQuery({
        queryKey: ['categories'],
        queryFn: () => categoryService.getCategories(true),
        staleTime: 5 * 60 * 1000,
    });
    const postTypes = useMemo(() => ['all', ...categories.map(c => c.key)], [categories]);

    const { data: posts = [], isLoading: loading, isRefetching: refreshing, isError, refetch } = useQuery({
        queryKey: ['admin', 'pending', activeFilter],
        queryFn: async () => {
            const typeParam = activeFilter === 'all' ? null : activeFilter;
            const res = await postService.getPendingPosts(typeParam);
            // `{ items, total }` since the queue started reporting its real depth;
            // the other branches keep an older server shape working.
            const body = res.data;
            const list = Array.isArray(body) ? body : (body?.items ?? body?.data ?? []);
            return list.map(p => ({ ...p, postType: p.postType || p.category || '' }));
        },
        staleTime: 30 * 1000,
    });

    useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

    const handleRefresh = refetch;

    const handlePostPress = useCallback((item) => {
        navigation.navigate('PostDetailScreen', { postId: item.id, postType: item.postType, role: 'admin' });
    }, [navigation]);

    const renderItem = useCallback(({ item, index }) => {
        // Schema colour through toneForTheme — amber stays reserved for accents.
        const schema = categories.find(c => c.key === item.postType);
        const typeColor = schema?.color ? toneForTheme(schema.color, isDark) : colors.text.secondary;
        const typeLabel = schema ? getSchemaLabel(schema) : (item.postType ? t(`category.${item.postType}`, { defaultValue: item.postType }) : '');

        return (
            <View style={isTablet && { flex: 1 }}>
                <PostCard
                    item={item}
                    onPress={handlePostPress}
                    imageUri={getPostImageUrl(item.images?.[0])}
                    title={getPostTitle(item, item.postType)}
                    style={styles.card}
                    memoKey={typeLabel}
                    badges={<Text style={[styles.cardType, { color: typeColor }]}>{typeLabel}</Text>}
                    trailing={<Ionicons name="chevron-forward" size={20} color={colors.text.tertiary} style={styles.chevron} />}
                >
                    {item.user && (
                        <Text style={styles.cardUser} numberOfLines={1}>
                            {item.user.given_name || item.user.phone_number}
                        </Text>
                    )}
                    <Text style={styles.cardDate}>
                        {formatDate(item.date_created)}
                    </Text>
                </PostCard>
            </View>
        );
    }, [handlePostPress, colors, styles, categories, isDark, t]);

    const showSkeleton = loading;

    return (
        <ScreenLayout title={t('admin.pendingPosts')} onBack={() => navigation.goBack()}>

            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.filterBar}
                contentContainerStyle={styles.filterContent}
            >
                {postTypes.map(type => (
                    <SelectionPop key={type} selected={activeFilter === type}>
                        <TouchableOpacity
                            style={[
                                styles.filterChip,
                                { borderColor: colors.border.light },
                                activeFilter === type && { borderColor: colors.primary, backgroundColor: colors.opacity.background.primary },
                            ]}
                            onPress={() => setActiveFilter(type)}
                            activeOpacity={interactions.activeOpacity}
                            hitSlop={{ top: 6, bottom: 6 }}
                        >
                            <Text style={[
                                styles.filterText,
                                { color: colors.text.secondary },
                                activeFilter === type && { color: colors.text.link },
                            ]}>
                                {type === 'all' ? t('filter.all') : t(`category.${type}`)}
                            </Text>
                        </TouchableOpacity>
                    </SelectionPop>
                ))}
            </ScrollView>

            {showSkeleton && posts.length === 0 ? (
                <FlatList
                    data={Array(4).fill({})}
                    renderItem={() => <SkeletonItem />}
                    keyExtractor={(_, i) => `sk-${i}`}
                    contentContainerStyle={styles.list}
                />
            ) : isError ? (
                <ScreenError onRetry={refetch} />
            ) : posts.length === 0 ? (
                <EmptyState
                    icon="checkmark-circle-outline"
                    iconSize={64}
                    variant="neutral"
                    title={t('admin.noPending')}
                    subtitle={t('admin.noPendingDesc')}
                />
            ) : (
                <FlatList
                    data={posts}
                    renderItem={renderItem}
                    keyExtractor={item => `${item.postType}-${item.id}`}
                    numColumns={isTablet ? 2 : 1}
                    key={isTablet ? 'tablet' : 'phone'}
                    columnWrapperStyle={isTablet ? { gap: spacing.md } : undefined}
                    contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + spacing.xxxxl }]}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={handleRefresh}
                            tintColor={colors.primary}
                            colors={[colors.primary]}
                        />
                    }
                    showsVerticalScrollIndicator={false}
                />
            )}
        </ScreenLayout>
    );
};

const createStyles = (colors) => StyleSheet.create({
    filterBar: { maxHeight: 52, borderBottomWidth: 1, borderBottomColor: colors.border.light },
    filterContent: { paddingHorizontal: spacing.md, alignItems: 'center', paddingVertical: spacing.sm, gap: spacing.sm },
    filterChip: { height: 36, paddingHorizontal: spacing.md, borderRadius: radius.pill, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
    // Weight stays fixed across states: swapping it re-measures the chip and
    // shifts every sibling in the row on tap.
    filterText: { ...typography.styles.label, includeFontPadding: false, textAlignVertical: 'center' },
    list: { padding: spacing.lg },
    // The chevron sits on the card's vertical centre, not at the top.
    card: { alignItems: 'center' },
    cardType: { ...typography.styles.badge },
    cardUser: { ...typography.styles.small, color: colors.text.secondary },
    cardDate: { ...typography.styles.small, color: colors.text.tertiary },
    chevron: { paddingRight: spacing.sm },
});

export default AdminPostList;

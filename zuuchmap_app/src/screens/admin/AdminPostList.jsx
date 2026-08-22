import React, { useState, useCallback, useMemo } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import {
    View,
    Text,
    FlatList,
    TouchableOpacity,
    Image,
    RefreshControl,
    ScrollView,
    StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { spacing, typography, radius, interactions, isTablet } from '../../design/theme';
import { useAppTheme } from '../../hooks/useAppTheme';
import { useMinDisplayTime } from '../../hooks/useMinDisplayTime';
import { useTranslation } from 'react-i18next';
import CustomSafeAreaView from '../../components/CustomSafeAreaView';
import ScreenHeader from '../../components/ScreenHeader';
import { EmptyState, SkeletonItem, FadeSlideIn, PressableScale, SelectionPop } from '../../components';
import ScreenError from '../../components/ScreenError';
import postService from '../../services/api/postService';
import { getPostImageUrl } from '../../config/api.config';
import { getPostTitle } from '../../utils/postUtils';
import { formatDateYYYYMMDD } from '../../utils/displayUtils';
import categoryService from '../../services/api/categoryService';


const AdminPostList = ({ navigation, route }) => {
    const insets = useSafeAreaInsets();
    const { colors, isDark } = useAppTheme();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const { t } = useTranslation();
    const initialFilter = route?.params?.filterType || 'all';
    const [activeFilter, setActiveFilter] = useState(initialFilter);
    const [imageErrors, setImageErrors] = useState({});

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
            const list = Array.isArray(res.data) ? res.data : (res.data?.data ?? []);
            return list.map(p => ({ ...p, postType: p.postType || p.category || '' }));
        },
        staleTime: 30 * 1000,
    });

    useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

    const handleRefresh = refetch;

    const renderItem = useCallback(({ item, index }) => {
        const imgKey = `${item.postType}-${item.id}`;
        const hasErr = imageErrors[imgKey];
        const thumb = getPostImageUrl(item.images?.[0]);
        const title = getPostTitle(item, item.postType);

        return (
            <FadeSlideIn index={index}>
                <PressableScale
                    style={styles.card}
                    onPress={() => navigation.navigate('PostDetailScreen', { postId: item.id, postType: item.postType, role: 'admin' })}
                >
                    <View style={styles.imgBox}>
                        {hasErr || !thumb ? (
                            <View style={styles.noImg}>
                                <Ionicons name="image-outline" size={28} color={colors.primary} />
                            </View>
                        ) : (
                            <Image
                                source={{ uri: thumb }}
                                style={styles.img}
                                resizeMode="cover"
                                onError={() => setImageErrors(p => ({ ...p, [imgKey]: true }))}
                            />
                        )}
                    </View>
                    <View style={styles.cardBody}>
                        <Text style={styles.cardTitle} numberOfLines={2}>{title}</Text>
                        <Text style={styles.cardType}>{item.postType ? t(`category.${item.postType}`, { defaultValue: item.postType }) : ''}</Text>
                        {item.user && (
                            <Text style={styles.cardUser} numberOfLines={1}>
                                {item.user.given_name || item.user.phone_number}
                            </Text>
                        )}
                        <Text style={styles.cardDate}>
                            {formatDateYYYYMMDD(item.date_created)}
                        </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color={colors.text.tertiary} style={styles.chevron} />
                </PressableScale>
            </FadeSlideIn>
        );
    }, [imageErrors, navigation, colors]);

    const showSkeleton = useMinDisplayTime(loading);

    return (
        <CustomSafeAreaView backgroundColor={colors.background} statusBarColor={colors.surface} statusBarStyle={isDark ? 'light-content' : 'dark-content'}>
            <ScreenHeader title={t('admin.pendingPosts')} onBack={() => navigation.goBack()} />

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
                                activeFilter === type && { color: colors.primary },
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
        </CustomSafeAreaView>
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
    card: { ...colors.elevation.sm, flexDirection: 'row', borderRadius: radius.card, marginBottom: spacing.md, overflow: 'hidden', alignItems: 'center', backgroundColor: colors.surface, },
    imgBox: { width: 100, height: 100, backgroundColor: colors.border.light },
    img: { width: '100%', height: '100%' },
    noImg: { width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center' },
    cardBody: { flex: 1, padding: spacing.md },
    cardTitle: { ...typography.styles.title, marginBottom: spacing.xs, color: colors.text.primary },
    cardType: { ...typography.styles.badge, marginBottom: spacing.xs, color: colors.primary },
    cardUser: { ...typography.styles.small, marginBottom: spacing.xs, color: colors.text.secondary },
    cardDate: { ...typography.styles.small, color: colors.text.tertiary },
    chevron: { paddingRight: spacing.sm },
});

export default AdminPostList;

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
    View,
    Text,
    ScrollView,
    Image,
    TouchableOpacity,
    ActivityIndicator,
    Animated,
    Dimensions,
    FlatList,
    Linking,
    Platform,
    Modal,
    KeyboardAvoidingView,
    StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { spacing, typography, safeAreaHelpers, radius, interactions, isTablet, fonts, animations } from '../../design/theme';
import { useAppTheme } from '../../hooks/useAppTheme';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { useTranslation } from 'react-i18next';
import postService from '../../services/api/postService';
import likeService from '../../services/api/likeService';
import { getUserId } from '../../services/api/authHelpers';
import { ScreenLayout } from '../../components';
import { StatusBadge } from '../../components';
import LikeButton from '../../components/LikeButton';
import { Button } from '../../components';
import { TextInput } from '../../components';
import { formatPrice, formatDateYYYYMMDD, formatDateTimeYYYYMMDD, getProvinceLabel, getDistrictLabel } from '../../utils/displayUtils';
import { normalizePostType, getPostTypeConfig, getPostTitle } from '../../utils/postUtils';
import { processPostImages } from '../../utils/imageUtils';
import { logger } from '../../utils/logger';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { invalidatePostData } from '../../services/queryClient';
import categoryService from '../../services/api/categoryService';
import BookingRequestModal from '../../components/BookingRequestModal';
import ReviewSection from '../../components/ReviewSection';
import {
    DetailItem, ContactRow, MetaRow, SectionCard, CollapsibleSectionCard, TagList,
} from '../../components/PostDetailSections';
import { usePostModeration } from '../../hooks/usePostModeration';
import { showErrorModal, showInfoModal } from '../../utils/errorManager';

const { width } = Dimensions.get('window');

// i18n key map for known attribute keys
const ATTR_I18N_KEYS = {
    manufacturer: 'attrs.manufacturer', model: 'attrs.model',
    manufactured_date: 'attrs.manufacturedDate', imported_date: 'attrs.importedDate',
    capacity: 'attrs.capacity', operating_hours: 'attrs.operatingHours',
    main_products: 'attrs.mainProducts',
    employment_type: 'attrs.employmentType', salary_range: 'attrs.salaryRange',
};
const ATTR_ICONS = {
    manufacturer: 'build-outline', model: 'cube-outline',
    manufactured_date: 'calendar-outline', imported_date: 'airplane-outline',
    capacity: 'cube-outline', operating_hours: 'time-outline',
    main_products: 'list-outline',
    employment_type: 'briefcase-outline', salary_range: 'cash-outline',
};

// Carousel pagination dot — grows and tints toward the active colour instead of
// hard-swapping. Colour rides an inner fill's opacity so the whole transition
// stays on the native driver.
const PaginationDot = ({ active, styles }) => {
    const reduced = useReducedMotion();
    const anim = useRef(new Animated.Value(active ? 1 : 0)).current;

    useEffect(() => {
        Animated.timing(anim, {
            toValue: active ? 1 : 0,
            duration: reduced ? 1 : animations.duration.fast,
            useNativeDriver: true,
        }).start();
    }, [active, reduced, anim]);

    const scale = anim.interpolate({
        inputRange: [0, 1],
        outputRange: [1, animations.selection.dotScale],
    });

    return (
        <Animated.View style={[styles.dot, !reduced && { transform: [{ scale }] }]}>
            <Animated.View style={[styles.dotFill, { opacity: anim }]} />
        </Animated.View>
    );
};

// ─── Main screen ─────────────────────────────────────────────────────────────

const PostDetailScreen = ({ route, navigation }) => {
    const insets = useSafeAreaInsets();
    const { colors, isDark, styles: gStyles } = useAppTheme();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const { t } = useTranslation();
    const { postId, postType: rawPostType, role = 'customer' } = route.params;
    const isProvider = role === 'provider';
    const isAdmin = role === 'admin';
    const postType = normalizePostType(rawPostType);

    const qc = useQueryClient();

    // Shared state
    const [currentImageIndex, setCurrentImageIndex] = useState(0);
    const [currentUserId, setCurrentUserId] = useState(null);

    const [deleting, setDeleting] = useState(false);

    useEffect(() => { getUserId().then(setCurrentUserId); }, []);

    const { data: post = null, isLoading, isError, error: postError, refetch: loadPost } = useQuery({
        queryKey: ['post', postId],
        queryFn: async () => {
            const response = await postService.getById(postId, false);
            return processPostImages(response.data);
        },
        staleTime: 30 * 1000,
    });
    const loading = isLoading || deleting;

    const {
        editMode, setEditMode,
        editedTitle, setEditedTitle,
        editedDetails, setEditedDetails,
        approving, rejecting,
        showRejectModal, setShowRejectModal,
        rejectReason, setRejectReason,
        handleApprove, handleRejectConfirm,
    } = usePostModeration({ post, enabled: isAdmin, onDone: () => navigation.goBack() });

    const { data: likeStats = { total_likes: 0, recent_likes: 0 }, isLoading: loadingLikes } = useQuery({
        queryKey: ['post', postId, 'likeStats'],
        enabled: isProvider,
        queryFn: () => likeService.getLikeStats(postType, postId),
        staleTime: 60 * 1000,
    });

    // Category behavior flags — bookable categories show the request button
    const { data: schema = null } = useQuery({
        queryKey: ['categories', 'byKey', postType],
        enabled: Boolean(postType),
        queryFn: () => categoryService.getCategoryByKey(postType).catch(() => null),
        staleTime: 10 * 60 * 1000,
    });
    const [showBookingModal, setShowBookingModal] = useState(false);
    const canBook = !isProvider && !isAdmin && Boolean(schema?.has_rental_status) && Boolean(post?.user)
        && post?.user?.id !== currentUserId;

    const viewIncrementRef = useRef(false);

    useEffect(() => {
        if (!isProvider && !isAdmin) {
            const timer = setTimeout(() => {
                if (!viewIncrementRef.current) incrementViews();
            }, 2000);
            return () => clearTimeout(timer);
        }
    }, []);

    const incrementViews = async () => {
        if (viewIncrementRef.current) return;
        try {
            viewIncrementRef.current = true;
            await postService.incrementViews(postId);
            qc.setQueryData(['post', postId], (prev) => prev ? { ...prev, views: (prev.views || 0) + 1 } : prev);
        } catch {
            viewIncrementRef.current = false;
        }
    };

    const handleEdit = () => {
        navigation.navigate('ProviderPostEdit', { postId, postType, post });
    };

    const handleDelete = () => {
        showErrorModal(
            t('posts.delete'),
            t('common.irreversible'),
            [
                { text: t('common.cancel') },
                {
                    text: t('common.delete'),
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            setDeleting(true);
                            await postService.deletePost(postId);
                            invalidatePostData();
                            navigation.goBack();
                        } catch (error) {
                            logger.error('Delete post error:', error);
                            showErrorModal(t('common.error'), t('posts.deleteError'));
                            setDeleting(false);
                        }
                    },
                },
            ],
            'warning'
        );
    };

    const handleCall = () => {
        if (post?.contact_phone) {
            Linking.openURL(`tel:+976${post.contact_phone}`);
        } else {
            showInfoModal(t('common.details'), t('posts.noPhone'));
        }
    };

    const handleOpenInMaps = () => {
        if (post?.latitude && post?.longitude) {
            Linking.openURL(`https://maps.google.com/maps?q=${post.latitude},${post.longitude}`);
        } else {
            showInfoModal(t('common.details'), t('posts.noLocation'));
        }
    };

    const handleDirections = () => {
        if (post?.latitude && post?.longitude) {
            const url = Platform.OS === 'ios'
                ? `maps://?daddr=${post.latitude},${post.longitude}&dirflg=d`
                : `https://www.google.com/maps/dir/?api=1&destination=${post.latitude},${post.longitude}&travelmode=driving`;
            Linking.openURL(url);
        } else {
            showInfoModal(t('common.details'), t('posts.noLocation'));
        }
    };

    // ─── Loading / error states ───────────────────────────────────────────────

    const screenTitle = isAdmin ? t('admin.reviewPost') : t('common.details');

    if (loading) {
        return (
            <ScreenLayout
                title={screenTitle}
                onBack={() => navigation.goBack()}
                loading
                loadingMessage={t('common.loading')}
            />
        );
    }

    if (!post) {
        // A 404 means the listing is genuinely gone; anything else means we
        // failed to ask, and saying "not found" would be a lie.
        const notFound = !isError || postError?.response?.status === 404;
        return (
            <ScreenLayout
                title={screenTitle}
                onBack={() => navigation.goBack()}
                error
                errorTitle={notFound ? t('posts.notFound') : t('common.error')}
                errorMessage={notFound ? t('common.noData') : t('errors.loadFailed')}
                onRetry={loadPost}
            />
        );
    }

    const postTypeConfig = getPostTypeConfig(postType, colors, schema ? [schema] : []);
    const postTitle = getPostTitle(post, postType);
    const bottomPadding = safeAreaHelpers.getBottomSafeArea(insets) + 80;
    const originalTitle = post.name || post.title || '';
    const originalDetails = post.description || post.details || '';
    const hasEdits = editedTitle.trim() !== originalTitle || editedDetails.trim() !== originalDetails;

    const editToggle = isAdmin ? (
        <TouchableOpacity
            style={[styles.editToggle, editMode && { backgroundColor: colors.opacity.background.primary }]}
            onPress={() => setEditMode(prev => !prev)}
            activeOpacity={interactions.activeOpacity}
        >
            <Ionicons
                name={editMode ? 'checkmark-done-outline' : 'create-outline'}
                size={20}
                color={editMode ? colors.primary : colors.text.secondary}
            />
            <Text style={[styles.editToggleText, { color: editMode ? colors.primary : colors.text.secondary }]}>
                {editMode ? t('admin.editDone') : t('admin.editPost')}
            </Text>
        </TouchableOpacity>
    ) : undefined;

    // ─── Render ───────────────────────────────────────────────────────────────

    return (
        <ScreenLayout
            title={screenTitle}
            onBack={() => navigation.goBack()}
            rightComponent={editToggle}
        >
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.scroll}
            >
            <ScrollView
                style={styles.scroll}
                contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomPadding }]}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
            >
                {/* ── Image carousel ─────────────────────────────────────── */}
                <View style={[styles.imageContainer, { backgroundColor: colors.background }]}>
                    {post.processedImages?.length > 0 ? (
                        <>
                            <FlatList
                                data={post.processedImages}
                                horizontal
                                pagingEnabled
                                showsHorizontalScrollIndicator={false}
                                keyExtractor={(_, i) => i.toString()}
                                onMomentumScrollEnd={e => {
                                    setCurrentImageIndex(
                                        Math.floor(e.nativeEvent.contentOffset.x / e.nativeEvent.layoutMeasurement.width)
                                    );
                                }}
                                renderItem={({ item }) => (
                                    <Image source={{ uri: item }} style={styles.postImage} resizeMode="cover" />
                                )}
                            />
                            {post.processedImages.length > 1 && (
                                <View style={styles.pagination}>
                                    {post.processedImages.map((_, i) => (
                                        <PaginationDot
                                            key={i}
                                            active={i === currentImageIndex}
                                            styles={styles}
                                        />
                                    ))}
                                </View>
                            )}
                        </>
                    ) : (
                        <View style={[styles.noImage, { backgroundColor: colors.background }]}>
                            <Ionicons name="image-outline" size={64} color={colors.primary} />
                            <Text style={[styles.noImageText, { color: colors.text.tertiary }]}>{t('posts.noImage')}</Text>
                        </View>
                    )}
                </View>

                {/* ── Centered content wrapper (tablet) ─────────────────── */}
                <View style={styles.contentWrapper}>

                {/* ── Title card ─────────────────────────────────────────── */}
                <SectionCard style={styles.titleCard} colors={colors} styles={styles}>
                    {isAdmin && editMode ? (
                        <View style={[styles.editBlock, { backgroundColor: colors.surface, borderColor: colors.border.amber }]}>
                            <Text style={[styles.editFieldLabel, { color: colors.text.tertiary }]}>{t('admin.editTitle')}</Text>
                            <TextInput
                                value={editedTitle}
                                onChangeText={setEditedTitle}
                                placeholder={t('admin.editTitlePlaceholder')}
                                maxLength={200}
                                style={typography.styles.bodyBold}
                            />
                            <Text style={[styles.editFieldLabel, { color: colors.text.tertiary, marginTop: spacing.md }]}>{t('common.description')}</Text>
                            <TextInput
                                value={editedDetails}
                                onChangeText={setEditedDetails}
                                placeholder={t('admin.editDetailsPlaceholder')}
                                multiline
                                numberOfLines={5}
                                maxLength={2000}
                                containerStyle={{ marginBottom: 0 }}
                            />
                            {hasEdits && (
                                <View style={[styles.editHint, { backgroundColor: colors.opacity.background.primary }]}>
                                    <Ionicons name="information-circle-outline" size={14} color={colors.primary} />
                                    <Text style={[styles.editHintText, { color: colors.primary }]}>{t('admin.editHint')}</Text>
                                </View>
                            )}
                        </View>
                    ) : (
                        <>
                            <View style={styles.titleRow}>
                                <View style={{ flex: 1 }}>
                                    <Text style={[styles.title, { color: colors.text.primary }]}>{isAdmin ? (editedTitle || postTitle) : postTitle}</Text>
                                    <View style={styles.postTypeRow}>
                                        <Ionicons name={postTypeConfig.iconName} size={20} color={postTypeConfig.color} />
                                        <Text style={[styles.postTypeText, { color: colors.text.secondary }]}>
                                            {t('category.' + postType)}
                                            {post.subcategory ? ` → ${t(`subcategory.${post.subcategory}`, { defaultValue: post.subcategory })}` : ''}
                                        </Text>
                                    </View>
                                </View>
                                <View style={styles.titleActions}>
                                    {post.status && (
                                        <StatusBadge
                                            status={post.status}
                                            variant="inline"
                                            position="relative"
                                            showIndicator={false}
                                            showIcon={true}
                                        />
                                    )}
                                    {!isProvider && !isAdmin && (
                                        <LikeButton
                                            post_type={postType}
                                            post_id={postId}
                                            show_count={true}
                                            size="large"
                                        />
                                    )}
                                </View>
                            </View>

                            {(post.price_amount || post.attributes?.salary_range) && (
                                <Text style={[styles.price, { color: colors.primary }]}>
                                    {post.attributes?.salary_range
                                        ? post.attributes.salary_range
                                        : formatPrice(post.price_amount, post.price_unit)}
                                </Text>
                            )}
                        </>
                    )}
                </SectionCard>

                {/* ── Poster info (admin only) ────────────────────────────── */}
                {isAdmin && post.user && (
                    <SectionCard colors={colors} styles={styles}>
                        <Text style={[styles.adminSectionTitle, { color: colors.text.tertiary }]}>{t('admin.poster')}</Text>
                        {(post.user.parent_name || post.user.given_name) && (
                            <View style={styles.adminInfoRow}>
                                <Text style={[styles.adminInfoLabel, { color: colors.text.secondary }]}>{t('common.name')}</Text>
                                <Text style={[styles.adminInfoValue, { color: colors.text.primary }]}>{`${post.user.parent_name || ''} ${post.user.given_name || ''}`.trim()}</Text>
                            </View>
                        )}
                        {post.user.phone_number && (
                            <View style={styles.adminInfoRow}>
                                <Text style={[styles.adminInfoLabel, { color: colors.text.secondary }]}>{t('common.phone')}</Text>
                                <Text style={[styles.adminInfoValue, { color: colors.text.primary }]}>{post.user.phone_number}</Text>
                            </View>
                        )}
                        {post.user.email && (
                            <View style={styles.adminInfoRow}>
                                <Text style={[styles.adminInfoLabel, { color: colors.text.secondary }]}>{t('common.email')}</Text>
                                <Text style={[styles.adminInfoValue, { color: colors.text.primary }]}>{post.user.email}</Text>
                            </View>
                        )}
                    </SectionCard>
                )}

                {/* ── Stats card (provider only) ─────────────────────────── */}
                {isProvider && (
                    <View style={[styles.statsCard, { backgroundColor: colors.surface }]}>
                        <View style={styles.statItem}>
                            <View style={[styles.statIconBox, { backgroundColor: colors.opacity.background.primary }]}>
                                <Ionicons name="eye-outline" size={20} color={colors.primary} />
                            </View>
                            <Text style={[styles.statValue, { color: colors.text.primary }]}>{post.views || 0}</Text>
                            <Text style={[styles.statLabel, { color: colors.text.secondary }]}>{t('posts.viewCount')}</Text>
                        </View>

                        <View style={styles.statItem}>
                            <View style={[styles.statIconBox, { backgroundColor: colors.opacity.background.primary }]}>
                                <Ionicons name="heart-outline" size={20} color={colors.primary} />
                            </View>
                            {loadingLikes
                                ? <ActivityIndicator size="small" color={colors.primary} />
                                : <Text style={[styles.statValue, { color: colors.text.primary }]}>{likeStats.total_likes}</Text>}
                            <Text style={[styles.statLabel, { color: colors.text.secondary }]}>{t('nav.saved')}</Text>
                        </View>

                        <View style={styles.statItem}>
                            <View style={[styles.statIconBox, { backgroundColor: colors.opacity.background.primary }]}>
                                <Ionicons name="trending-up-outline" size={20} color={colors.primary} />
                            </View>
                            {loadingLikes
                                ? <ActivityIndicator size="small" color={colors.primary} />
                                : <Text style={[styles.statValue, { color: colors.text.primary }]}>{likeStats.recent_likes}</Text>}
                            <Text style={[styles.statLabel, { color: colors.text.secondary }]}>{t('posts.last7Days')}</Text>
                        </View>

                        {post.rental_count !== undefined && (
                            <View style={styles.statItem}>
                                <View style={[styles.statIconBox, { backgroundColor: colors.opacity.background.primary }]}>
                                    <Ionicons name="repeat-outline" size={20} color={colors.primary} />
                                </View>
                                <Text style={[styles.statValue, { color: colors.text.primary }]}>{post.rental_count || 0}</Text>
                                <Text style={[styles.statLabel, { color: colors.text.secondary }]}>{t('posts.myPosts')}</Text>
                            </View>
                        )}

                        {post.booking_count !== undefined && (
                            <View style={styles.statItem}>
                                <View style={[styles.statIconBox, { backgroundColor: colors.opacity.background.primary }]}>
                                    <Ionicons name="calendar-outline" size={20} color={colors.primary} />
                                </View>
                                <Text style={[styles.statValue, { color: colors.text.primary }]}>{post.booking_count || 0}</Text>
                                <Text style={[styles.statLabel, { color: colors.text.secondary }]}>{t('common.details')}</Text>
                            </View>
                        )}

                        {post.inquiries_count !== undefined && (
                            <View style={styles.statItem}>
                                <View style={[styles.statIconBox, { backgroundColor: colors.opacity.background.primary }]}>
                                    <Ionicons name="mail-outline" size={20} color={colors.primary} />
                                </View>
                                <Text style={[styles.statValue, { color: colors.text.primary }]}>{post.inquiries_count || 0}</Text>
                                <Text style={[styles.statLabel, { color: colors.text.secondary }]}>{t('profile.email')}</Text>
                            </View>
                        )}
                    </View>
                )}

                {/* ── Location & map ─────────────────────────────────────── */}
                <SectionCard colors={colors} styles={styles}>
                    <Text style={[styles.locationText, { color: colors.text.primary }]}>
                        {post.location || post.address ||
                            (post.province
                                ? `${getProvinceLabel(post.province)}${post.district ? `, ${getDistrictLabel(post.district)}` : ''}`
                                : t('common.noData'))}
                    </Text>

                    {post.latitude && post.longitude && (
                        <View style={[styles.mapContainer, { backgroundColor: colors.background }]}>
                            <MapView
                                style={styles.map}
                                provider={PROVIDER_GOOGLE}
                                initialRegion={{
                                    latitude: parseFloat(post.latitude),
                                    longitude: parseFloat(post.longitude),
                                    latitudeDelta: 0.01,
                                    longitudeDelta: 0.01,
                                }}
                                scrollEnabled={false}
                                zoomEnabled={false}
                                pitchEnabled={false}
                                rotateEnabled={false}
                            >
                                <Marker
                                    coordinate={{
                                        latitude: parseFloat(post.latitude),
                                        longitude: parseFloat(post.longitude),
                                    }}
                                    title={post.name || post.title || post.position || t('map.title')}
                                    description={post.location || post.address || ''}
                                    pinColor={colors.primary}
                                />
                            </MapView>
                            <TouchableOpacity style={[styles.mapBtn, { backgroundColor: colors.surface }]} onPress={handleOpenInMaps} activeOpacity={interactions.activeOpacity}>
                                <Ionicons name="navigate-outline" size={20} color={colors.primary} />
                                <Text style={[styles.mapBtnText, { color: colors.primary }]}>{t('posts.openInMaps')}</Text>
                            </TouchableOpacity>
                        </View>
                    )}
                </SectionCard>

                {/* ── Category-specific attributes (dynamic) ─────────────── */}
                {post.attributes && Object.keys(post.attributes).length > 0 && (
                    <CollapsibleSectionCard title={t('form.categoryDetails')} colors={colors} styles={styles}>
                        <View style={styles.detailsGrid}>
                            {Object.entries(post.attributes).map(([key, value]) => {
                                if (!value && value !== 0) return null;
                                const label = ATTR_I18N_KEYS[key] ? t(ATTR_I18N_KEYS[key]) : key;
                                const icon = ATTR_ICONS[key] || 'information-circle-outline';
                                if (Array.isArray(value)) {
                                    return (
                                        <DetailItem key={key} icon={icon} label={label} colors={colors} styles={styles}>
                                            <TagList tags={value} colors={colors} styles={styles} />
                                        </DetailItem>
                                    );
                                }
                                return <DetailItem key={key} icon={icon} label={label} colors={colors} styles={styles}>{String(value)}</DetailItem>;
                            })}
                        </View>
                    </CollapsibleSectionCard>
                )}

                {/* ── Availability ───────────────────────────────────────── */}
                {(post.available_from || post.available_until) && (
                    <SectionCard colors={colors} styles={styles}>
                        {post.available_from && (
                            <View style={styles.availRow}>
                                <View style={[styles.availIcon, { backgroundColor: colors.opacity.background.primary }]}>
                                    <Ionicons name="play-circle-outline" size={18} color={colors.primary} />
                                </View>
                                <View>
                                    <Text style={[styles.detailLabel, { color: colors.text.secondary }]}>{t('posts.availableFrom')}</Text>
                                    <Text style={[styles.detailValue, { color: colors.text.primary }]}>{formatDateYYYYMMDD(post.available_from)}</Text>
                                </View>
                            </View>
                        )}
                        {post.available_until && (
                            <View style={styles.availRow}>
                                <View style={[styles.availIcon, { backgroundColor: colors.opacity.background.primary }]}>
                                    <Ionicons name="stop-circle-outline" size={18} color={colors.primary} />
                                </View>
                                <View>
                                    <Text style={[styles.detailLabel, { color: colors.text.secondary }]}>{t('posts.availableUntil')}</Text>
                                    <Text style={[styles.detailValue, { color: colors.text.primary }]}>{formatDateYYYYMMDD(post.available_until)}</Text>
                                </View>
                            </View>
                        )}
                    </SectionCard>
                )}

                {/* ── Description / details ─────────────────────────────── */}
                {(post.description || post.details) && (
                    <SectionCard colors={colors} styles={styles}>
                        <Text style={[styles.descriptionText, { color: colors.text.primary }]}>{post.description || post.details}</Text>
                    </SectionCard>
                )}

                {/* ── Contact info ───────────────────────────────────────── */}
                {(post.contact_phone || post.contact_email || post.website) && (
                    <SectionCard colors={colors} styles={styles}>
                        {post.contact_phone && (
                            <ContactRow
                                icon="call-outline"
                                label={t('profile.phone')}
                                value={post.contact_phone}
                                onPress={() => Linking.openURL(`tel:+976${post.contact_phone}`)}
                                colors={colors}
                                styles={styles}
                            />
                        )}
                        {post.contact_email && (
                            <ContactRow
                                icon="mail-outline"
                                label={t('profile.email')}
                                value={post.contact_email}
                                onPress={() => Linking.openURL(`mailto:${post.contact_email}`)}
                                colors={colors}
                                styles={styles}
                            />
                        )}
                        {post.website && (
                            <ContactRow
                                icon="globe-outline"
                                label={t('common.website')}
                                value={post.website}
                                onPress={() => Linking.openURL(
                                    post.website.startsWith('http') ? post.website : `https://${post.website}`
                                )}
                                colors={colors}
                                styles={styles}
                            />
                        )}
                    </SectionCard>
                )}

                {/* ── Meta info ─────────────────────────────────────────── */}
                <CollapsibleSectionCard title={t('posts.moreInfo')} colors={colors} styles={styles} defaultOpen={false}>
                    <MetaRow icon="calendar-outline" label={t('posts.publishedOn')} value={formatDateTimeYYYYMMDD(post.created_at || post.date_created)} colors={colors} styles={styles} />
                    {post.updated_at && post.updated_at !== post.created_at && (
                        <MetaRow icon="refresh-outline" label={t('posts.updatedAt')} value={formatDateTimeYYYYMMDD(post.updated_at)} colors={colors} styles={styles} />
                    )}
                    <MetaRow icon="finger-print-outline" label={t('posts.postId')} value={`#${post.id}`} colors={colors} styles={styles} />

                    {!isProvider && post.views !== undefined && (
                        <MetaRow icon="eye-outline" label={t('posts.viewCount')} value={String(post.views)} colors={colors} styles={styles} />
                    )}
                </CollapsibleSectionCard>

                {/* ── Provider reviews ───────────────────────────────────── */}
                {post.user && (
                    <ReviewSection
                        providerId={post.user.id}
                        canReview={!isProvider && !isAdmin && post.user.id !== currentUserId}
                    />
                )}

                </View>{/* end contentWrapper */}
            </ScrollView>
            </KeyboardAvoidingView>

            {/* ── Footer action buttons ──────────────────────────────────── */}
            <View style={[
                styles.footer,
                gStyles.bottomContainerWithInset(safeAreaHelpers.getBottomSafeArea(insets)),
                { backgroundColor: colors.surface },
            ]}>
                {isAdmin ? (
                    <>
                        <TouchableOpacity
                            style={[styles.rejectBtn, (approving || rejecting) && styles.btnDisabled, { borderColor: colors.opacity.border.danger, backgroundColor: colors.opacity.background.danger }]}
                            onPress={() => setShowRejectModal(true)}
                            disabled={approving || rejecting}
                            activeOpacity={interactions.activeOpacity}
                        >
                            {rejecting ? (
                                <ActivityIndicator color={colors.danger} size="small" />
                            ) : (
                                <>
                                    <Ionicons name="close-circle-outline" size={20} color={colors.danger} />
                                    <Text style={[styles.rejectBtnText, { color: colors.danger }]}>{t('posts.reject')}</Text>
                                </>
                            )}
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.approveBtn, (approving || rejecting) && styles.btnDisabled, { backgroundColor: colors.success }]}
                            onPress={handleApprove}
                            disabled={approving || rejecting}
                            activeOpacity={interactions.activeOpacity}
                        >
                            {approving ? (
                                <ActivityIndicator color={colors.surface} size="small" />
                            ) : (
                                <>
                                    <Ionicons name={hasEdits ? 'save-outline' : 'checkmark-circle-outline'} size={20} color={colors.surface} />
                                    <Text style={[styles.approveBtnText, { color: colors.surface }]}>
                                        {hasEdits ? t('admin.saveAndApprove') : t('posts.approve')}
                                    </Text>
                                </>
                            )}
                        </TouchableOpacity>
                    </>
                ) : isProvider ? (
                    <>
                        <Button
                            icon="create-outline"
                            title={t('common.edit')}
                            onPress={handleEdit}
                            variant="primary"
                            size="medium"
                            style={styles.footerBtn}
                        />
                        <Button
                            icon="trash-outline"
                            title={t('common.delete')}
                            onPress={handleDelete}
                            variant="danger"
                            size="medium"
                            style={styles.footerBtn}
                        />
                    </>
                ) : (
                    <>
                        {canBook && (
                            <Button
                                icon="calendar-outline"
                                title={t('booking.request')}
                                onPress={() => setShowBookingModal(true)}
                                variant="primary"
                                size="medium"
                                style={styles.footerBtn}
                            />
                        )}
                        {post.contact_phone && (
                            <Button
                                icon="call-outline"
                                title={t('posts.call')}
                                onPress={handleCall}
                                variant={canBook ? 'secondary' : 'primary'}
                                size="medium"
                                style={styles.footerBtn}
                            />
                        )}
                        {post.latitude && post.longitude && (
                            <Button
                                icon="navigate-outline"
                                title={t('posts.navigate')}
                                onPress={handleDirections}
                                variant="success"
                                size="medium"
                                style={styles.footerBtn}
                            />
                        )}
                    </>
                )}
            </View>

            {/* ── Booking request modal (customer) ───────────────────────── */}
            {canBook && (
                <BookingRequestModal
                    visible={showBookingModal}
                    onClose={() => setShowBookingModal(false)}
                    postId={post.id}
                />
            )}

            {/* ── Reject modal (admin only) ──────────────────────────────── */}
            <Modal visible={showRejectModal} transparent animationType="slide">
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    style={styles.modalOverlay}
                >
                    <TouchableOpacity
                        style={styles.modalBackdrop}
                        onPress={() => setShowRejectModal(false)}
                        activeOpacity={1}
                    />
                    <View style={[styles.modalSheet, { paddingBottom: Math.max(insets.bottom, spacing.xl), backgroundColor: colors.surface, borderTopColor: colors.border.light }]}>
                        <Text style={[styles.modalTitle, { color: colors.text.primary }]}>{t('posts.rejectReason')}</Text>
                        <Text style={[styles.modalSubtitle, { color: colors.text.secondary }]}>{t('admin.rejectNotice')}</Text>
                        <View style={styles.reasonChips}>
                            {Object.entries(t('admin.reasonTypes', { returnObjects: true })).map(([key, label]) => (
                                <TouchableOpacity
                                    key={key}
                                    onPress={() => setRejectReason(label)}
                                    style={[
                                        styles.reasonChip,
                                        { borderColor: colors.border.light, backgroundColor: colors.surfaceLight },
                                        rejectReason === label && { borderColor: colors.danger, backgroundColor: colors.opacity.background.danger },
                                    ]}
                                    activeOpacity={interactions.activeOpacity}
                                >
                                    <Text style={[styles.reasonChipText, { color: rejectReason === label ? colors.danger : colors.text.secondary }]}>{label}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                        <TextInput
                            value={rejectReason}
                            onChangeText={setRejectReason}
                            multiline
                            numberOfLines={3}
                            containerStyle={styles.reasonInput}
                        />
                        <View style={styles.modalActions}>
                            <TouchableOpacity
                                style={[styles.modalCancel, { borderColor: colors.border.light }]}
                                onPress={() => setShowRejectModal(false)}
                                activeOpacity={interactions.activeOpacity}
                            >
                                <Text style={[styles.modalCancelText, { color: colors.text.secondary }]}>{t('common.cancel')}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.modalConfirm, { backgroundColor: colors.danger }, rejecting && styles.btnDisabled]}
                                onPress={handleRejectConfirm}
                                disabled={rejecting}
                                activeOpacity={interactions.activeOpacity}
                            >
                                {rejecting
                                    ? <ActivityIndicator size="small" color={colors.text.onColor} />
                                    : <Text style={styles.modalConfirmText}>{t('posts.reject')}</Text>
                                }
                            </TouchableOpacity>
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </Modal>
        </ScreenLayout>
    );
};

const createStyles = (colors) => StyleSheet.create({
    scroll: { flex: 1 },
    scrollContent: {},

    // Tablet centering wrapper
    contentWrapper: {
        maxWidth: isTablet ? 800 : '100%',
        alignSelf: 'center',
        width: '100%',
    },

    // Image
    imageContainer: { width: '100%', height: isTablet ? 360 : 260, backgroundColor: colors.background },
    postImage: { width, height: isTablet ? 360 : 260 },
    pagination: {
        position: 'absolute',
        bottom: spacing.lg,
        alignSelf: 'center',
        flexDirection: 'row',
    },
    dot: {
        width: 8, height: 8, borderRadius: radius.full,
        backgroundColor: colors.opacity.whiteOverlay,
        margin: spacing.xxs,
        overflow: 'hidden',
    },
    dotFill: {
        ...StyleSheet.absoluteFillObject,
        borderRadius: radius.full,
        backgroundColor: colors.text.onMedia,
    },
    noImage: {
        width: '100%', height: isTablet ? 360 : 260,
        justifyContent: 'center', alignItems: 'center',
        backgroundColor: colors.background,
    },
    noImageText: {
        color: colors.text.tertiary,
        marginTop: spacing.sm,
        ...typography.styles.caption,
    },

    // Section card
    sectionCard: {
        ...colors.elevation.sm,
        backgroundColor: colors.surface,
        borderRadius: radius.card,
        marginHorizontal: spacing.lg,
        marginBottom: spacing.md,
        padding: spacing.lg,
    },
    collapsibleHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    collapsibleTitle: {
        ...typography.styles.labelStrong,
    },
    collapsibleBody: {
        marginTop: spacing.md,
    },

    // Title card
    titleCard: { marginTop: spacing.lg },
    titleRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: spacing.sm,
    },
    titleActions: {
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: spacing.sm,
        marginLeft: spacing.sm,
    },
    title: {
        ...typography.styles.h2,
        color: colors.text.primary,
        marginBottom: spacing.xs,
    },
    postTypeRow: { flexDirection: 'row', alignItems: 'center' },
    postTypeText: {
        ...typography.styles.label,
        color: colors.text.secondary,
        marginLeft: spacing.xs,
    },
    price: {
        ...typography.styles.h1,
        color: colors.primary,
        marginTop: spacing.md,
    },

    // Stats card
    statsCard: {
        ...colors.elevation.sm,
        flexDirection: 'row',
        flexWrap: 'wrap',
        backgroundColor: colors.surface,
        borderRadius: radius.card,
        padding: spacing.lg,
        marginHorizontal: spacing.lg,
        marginVertical: spacing.md,
        gap: spacing.lg,
    },
    statItem: {
        flex: 1,
        minWidth: '33%',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 70,
    },
    statIconBox: {
        width: 40, height: 40, borderRadius: radius.full,
        backgroundColor: colors.opacity.background.primary,
        justifyContent: 'center', alignItems: 'center',
        marginBottom: spacing.xs,
    },
    statValue: {
        ...typography.styles.h3,
        color: colors.text.primary,
        marginBottom: spacing.xs,
    },
    statLabel: {
        ...typography.styles.small,
        color: colors.text.secondary,
        textAlign: 'center',
    },

    // Location & map
    locationText: {
        ...typography.styles.bodyMedium,
        color: colors.text.primary,
        marginBottom: spacing.md,
    },
    mapContainer: {
        ...colors.elevation.sm,
        borderRadius: radius.lg,
        overflow: 'hidden',
        backgroundColor: colors.background,
    },
    map: { height: 200, width: '100%' },
    mapBtn: {
        ...colors.elevation.sm,
        position: 'absolute',
        top: spacing.md,
        right: spacing.md,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.surface,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        borderRadius: radius.xxl,
    },
    mapBtnText: {
        marginLeft: spacing.xs,
        ...typography.styles.badge,
        color: colors.primary,
    },

    // Details grid
    detailsGrid: { gap: spacing.md },
    detailItem: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: spacing.sm, minHeight: 52 },
    detailIcon: {
        width: 36, height: 36, borderRadius: radius.full,
        backgroundColor: colors.opacity.background.primary,
        justifyContent: 'center', alignItems: 'center',
        marginRight: spacing.md,
    },
    detailContent: { flex: 1 },
    detailLabel: {
        ...typography.styles.micro,
        color: colors.text.secondary,
        marginBottom: spacing.xs,
    },
    detailValue: {
        ...typography.styles.bodyMedium,
        color: colors.text.primary,
    },

    // Tags
    tagsContainer: { flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing.sm },
    tag: {
        backgroundColor: colors.opacity.background.primary,
        borderRadius: radius.xl,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.xs,
        margin: spacing.xs,
    },
    tagText: { ...typography.styles.label, color: colors.primary },

    // Availability
    availRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: spacing.md,
        paddingVertical: spacing.sm,
    },
    availIcon: {
        width: 36, height: 36, borderRadius: radius.full,
        backgroundColor: colors.opacity.background.primary,
        justifyContent: 'center', alignItems: 'center',
        marginRight: spacing.md,
    },

    // Description
    descriptionText: {
        ...typography.styles.body,
        color: colors.text.primary,
    },

    // Contact
    contactRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: spacing.md,
        paddingVertical: spacing.sm,
    },
    contactIcon: {
        width: 40, height: 40, borderRadius: radius.full,
        backgroundColor: colors.opacity.background.primary,
        justifyContent: 'center', alignItems: 'center',
        marginRight: spacing.md,
    },
    contactContent: { flex: 1 },
    contactLabel: {
        ...typography.styles.micro,
        color: colors.text.secondary,
        marginBottom: spacing.xs,
    },
    contactText: {
        ...typography.styles.bodyMedium,
        color: colors.text.primary,
    },

    // Meta
    metaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: spacing.md,
        paddingVertical: spacing.sm,
    },
    metaIcon: {
        width: 36, height: 36, borderRadius: radius.full,
        backgroundColor: colors.opacity.background.primary,
        justifyContent: 'center', alignItems: 'center',
        marginRight: spacing.md,
    },
    metaContent: { flex: 1 },
    metaLabel: {
        ...typography.styles.micro,
        color: colors.text.secondary,
        marginBottom: spacing.xs,
    },
    metaText: {
        ...typography.styles.bodyMedium,
        color: colors.text.primary,
    },

    // Footer
    footer: {
        ...colors.elevation.sm,
        flexDirection: isTablet ? 'row' : 'column',
        backgroundColor: colors.surface,
        padding: spacing.md,
        gap: spacing.md,
    },
    footerBtn: { flex: isTablet ? 1 : undefined },

    // Admin
    editToggle: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.xs,
        borderRadius: radius.md,
    },
    editToggleText: { ...typography.styles.label },
    editBlock: {
        borderRadius: radius.card,
        borderWidth: 1.5,
        padding: spacing.md,
        marginBottom: spacing.sm,
    },
    editFieldLabel: {
        ...typography.styles.overline,
        textTransform: 'uppercase',
        marginBottom: spacing.xs,
    },
    editHint: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
        marginTop: spacing.sm,
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.xs,
        borderRadius: radius.sm,
    },
    editHintText: { ...typography.styles.small },
    adminSectionTitle: {
        ...typography.styles.overline,
        textTransform: 'uppercase',
        marginBottom: spacing.sm,
    },
    adminInfoRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: spacing.sm,
        borderBottomWidth: 1,
        borderBottomColor: colors.border.light,
    },
    adminInfoLabel: { ...typography.styles.caption, flex: 1 },
    adminInfoValue: { ...typography.styles.label, flex: 2, textAlign: 'right' },
    rejectBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.xs,
        borderWidth: 1,
        borderRadius: radius.button,
        paddingVertical: spacing.md,
    },
    rejectBtnText: { ...typography.styles.bodyBold },
    approveBtn: {
        ...colors.elevation.md,
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.xs,
        borderRadius: radius.button,
        paddingVertical: spacing.md,
    },
    approveBtnText: { ...typography.styles.bodyBold },
    btnDisabled: { opacity: 0.5 },
    modalOverlay: { flex: 1, justifyContent: 'flex-end' },
    modalBackdrop: { flex: 1 },
    modalSheet: {
        borderTopLeftRadius: radius.modal,
        borderTopRightRadius: radius.modal,
        padding: spacing.lg,
        borderTopWidth: 1,
    },
    modalTitle: { ...typography.styles.title, marginBottom: spacing.xs },
    modalSubtitle: { ...typography.styles.caption, marginBottom: spacing.md },
    reasonChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.sm },
    reasonChip: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: spacing.sm, minHeight: 40, justifyContent: 'center' },
    reasonChipText: { ...typography.styles.micro },
    reasonInput: { marginBottom: spacing.md },
    modalActions: { flexDirection: 'row', gap: spacing.md },
    modalCancel: {
        flex: 1,
        paddingVertical: spacing.md,
        borderRadius: radius.button,
        borderWidth: 1,
        alignItems: 'center',
    },
    modalCancelText: { ...typography.styles.label },
    modalConfirm: {
        flex: 1,
        paddingVertical: spacing.md,
        borderRadius: radius.button,
        alignItems: 'center',
    },
    modalConfirmText: { ...typography.styles.labelStrong, color: colors.text.onColor, },
});

export default PostDetailScreen;

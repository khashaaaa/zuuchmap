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
import { LinearGradient } from 'expo-linear-gradient';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { spacing, typography, safeAreaHelpers, radius, interactions, isTablet, animations, toneForTheme, withAlpha } from '../../design/theme';
import { useAppTheme } from '../../hooks/useAppTheme';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { useTranslation } from 'react-i18next';
import postService from '../../services/api/postService';
import likeService from '../../services/api/likeService';
import { getUserId } from '../../services/api/authHelpers';
import { ScreenLayout } from '../../components';
import { StatusBadge, StatTile, FadeSlideIn, PressableScale, SkeletonItem, AvailabilityStrip, ProviderCredentials, SimilarPostsDrawer } from '../../components';
import LikeButton from '../../components/LikeButton';
import { Button } from '../../components';
import { TextInput } from '../../components';
import { getPriceUnitLabel, formatDate, formatDateTime, getProvinceLabel, getDistrictLabel } from '../../utils/displayUtils';
import { normalizePostType, getPostTypeConfig, getPostTitle, getSchemaLabel, getSubcategoryLabel } from '../../utils/postUtils';
import { processPostImages } from '../../utils/imageUtils';
import { logger } from '../../utils/logger';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { invalidatePostData } from '../../services/queryClient';
import { track } from '../../services/analytics';
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

// Icon-only secondary action for the pinned footer — a labelled square that
// leaves the single amber primary as the only full button in the bar.
const IconAction = ({ icon, onPress, label, danger = false, colors, styles }) => (
    <PressableScale
        style={[
            styles.iconAction,
            danger
                ? { borderColor: colors.opacity.border.danger, backgroundColor: colors.opacity.background.danger }
                : { borderColor: colors.border.medium, backgroundColor: colors.surface },
        ]}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
    >
        <Ionicons name={icon} size={22} color={danger ? colors.danger : colors.text.primary} />
    </PressableScale>
);

// ─── Main screen ─────────────────────────────────────────────────────────────

/**
 * Hero slide with its own loading and failure states. A dead R2 URL used to
 * leave the tallest element on the screen blank with nothing to explain it.
 */
const HeroImage = ({ uri, failed, onFailed, config, isDark, colors, styles, noImageLabel }) => {
    const [loading, setLoading] = useState(true);

    if (failed) {
        return (
            <View style={[styles.postImage, styles.heroFallback, { backgroundColor: withAlpha(config.color, isDark ? 0.16 : 0.1) }]}>
                <Ionicons name={config.iconName} size={56} color={toneForTheme(config.color, isDark)} />
                <Text style={[styles.noImageText, { color: colors.text.tertiary }]}>{noImageLabel}</Text>
            </View>
        );
    }

    return (
        <View>
            <Image
                source={{ uri }}
                style={styles.postImage}
                resizeMode="cover"
                onLoadEnd={() => setLoading(false)}
                onError={() => { setLoading(false); onFailed(); }}
            />
            {loading && (
                <View style={[styles.postImage, styles.heroFallback, styles.heroLoading, { backgroundColor: colors.surface }]}>
                    <ActivityIndicator size="small" color={colors.iconAccent} />
                </View>
            )}
        </View>
    );
};

const PostDetailScreen = ({ route, navigation }) => {
    const insets = useSafeAreaInsets();
    const { colors, isDark, styles: gStyles } = useAppTheme();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const { t, i18n } = useTranslation();
    const { postId, postType: rawPostType, role = 'customer', openReview = false } = route.params;
    const isProvider = role === 'provider';
    const isAdmin = role === 'admin';

    const qc = useQueryClient();

    // Shared state
    const [currentImageIndex, setCurrentImageIndex] = useState(0);
    const [heroImageErrors, setHeroImageErrors] = useState({});
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

    // Deep links (push taps, notification rows) may arrive without postType —
    // fall back to the fetched post's category so like stats and the category
    // schema still resolve.
    const postType = normalizePostType(rawPostType) || (post ? normalizePostType(post.category) : null);

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
        enabled: isProvider && Boolean(postType),
        queryFn: () => likeService.getLikeStats(postType, postId),
        staleTime: 60 * 1000,
    });

    // Category behavior flags — bookable categories show the request button.
    // The failure is surfaced rather than swallowed: `.catch(() => null)` made a
    // schema that would not load indistinguishable from a category that is not
    // bookable, so the request button silently disappeared from a post that
    // takes bookings. The web client refuses to do that; so does this one now.
    const {
        data: schema = null,
        isError: schemaError,
        refetch: refetchSchema,
    } = useQuery({
        queryKey: ['categories', 'byKey', postType],
        enabled: Boolean(postType),
        queryFn: () => categoryService.getCategoryByKey(postType),
        staleTime: 10 * 60 * 1000,
    });
    const [showBookingModal, setShowBookingModal] = useState(false);
    const canBook = !isProvider && !isAdmin && Boolean(schema?.has_rental_status) && Boolean(post?.user)
        && post?.user?.id !== currentUserId;
    // Availability is separate from category and approval — mirrors the engine's
    // gate in booking.service.ts. RENTED is the provider's own "not right now",
    // and a lapsed post has nobody answering. `canBook` still drives the
    // phone-withheld wording: an unavailable rental is still a rental.
    const isBookable = post?.status === 'ACTIVE'
        && (!post?.expires_at || new Date(post.expires_at) > new Date());
    const bookingOpen = canBook && isBookable;

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
            track('contact.revealed', { post_id: post.id, category: post.category });
            Linking.openURL(`tel:+976${post.contact_phone}`);
        } else {
            // On a bookable post the number is withheld until a booking is
            // accepted — saying "no phone available" there was simply untrue.
            showInfoModal(
                t('common.details'),
                canBook ? t('posts.phoneAfterBooking') : t('posts.noPhone'),
            );
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
            <ScreenLayout title={screenTitle} onBack={() => navigation.goBack()}>
                <SkeletonItem variant="detail" />
            </ScreenLayout>
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
            hitSlop={interactions.hitSlop}
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
                                renderItem={({ item, index }) => (
                                    <HeroImage
                                        uri={item}
                                        failed={!!heroImageErrors[index]}
                                        onFailed={() => setHeroImageErrors(prev => ({ ...prev, [index]: true }))}
                                        config={postTypeConfig}
                                        isDark={isDark}
                                        colors={colors}
                                        styles={styles}
                                        noImageLabel={t('posts.noImage')}
                                    />
                                )}
                            />
                            <LinearGradient
                                colors={['transparent', colors.opacity.overlay]}
                                style={styles.heroGradient}
                                pointerEvents="none"
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
                        <View style={[styles.noImage, { backgroundColor: withAlpha(postTypeConfig.color, isDark ? 0.16 : 0.1) }]}>
                            <Ionicons name={postTypeConfig.iconName} size={64} color={toneForTheme(postTypeConfig.color, isDark)} />
                            <Text style={[styles.noImageText, { color: colors.text.tertiary }]}>{t('posts.noImage')}</Text>
                        </View>
                    )}
                    <View style={[styles.heroCategoryPill, { backgroundColor: postTypeConfig.color }]}>
                        <Ionicons name={postTypeConfig.iconName} size={12} color={colors.text.onColor} />
                        <Text style={[styles.heroCategoryText, { color: colors.text.onColor }]} numberOfLines={1}>
                            {schema ? getSchemaLabel(schema) : t('category.' + postType, { defaultValue: postType })}
                        </Text>
                    </View>
                    {post.status && (
                        <View style={styles.heroStatusWrap}>
                            <StatusBadge
                                status={post.status}
                                variant="inline"
                                position="relative"
                                showIndicator={false}
                                showIcon={true}
                            />
                        </View>
                    )}
                </View>

                {/* ── Centered content wrapper (tablet) ─────────────────── */}
                <View style={styles.contentWrapper}>

                {/* ── Title card ─────────────────────────────────────────── */}
                <FadeSlideIn index={0}>
                <SectionCard style={styles.titleCard} colors={colors} styles={styles}>
                    {isAdmin && editMode ? (
                        <View style={[styles.editBlock, { backgroundColor: colors.surface, borderColor: colors.border.amber }]}>
                            <Text style={[styles.editFieldLabel, { color: colors.text.tertiary }]}>{t('admin.editTitle')}</Text>
                            <TextInput
                                value={editedTitle}
                                onChangeText={setEditedTitle}
                                placeholder={t('admin.editTitlePlaceholder')}
                                maxLength={200}
                                style={{ ...typography.styles.bodyBold, lineHeight: undefined }}
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
                                    <Ionicons name="information-circle-outline" size={14} color={colors.iconAccent} />
                                    <Text style={[styles.editHintText, { color: colors.text.link }]}>{t('admin.editHint')}</Text>
                                </View>
                            )}
                        </View>
                    ) : (
                        <>
                            <View style={styles.titleRow}>
                                <View style={{ flex: 1 }}>
                                    <Text style={[styles.title, { color: colors.text.primary }]}>{isAdmin ? (editedTitle || postTitle) : postTitle}</Text>
                                    {post.subcategory ? (
                                        <View style={styles.postTypeRow}>
                                            <Ionicons name={postTypeConfig.iconName} size={20} color={toneForTheme(postTypeConfig.color, isDark)} />
                                            <Text style={[styles.postTypeText, { color: colors.text.secondary }]} numberOfLines={1}>
                                                {getSubcategoryLabel(post.subcategory, schema) || t(`subcategory.${post.subcategory}`, { defaultValue: post.subcategory })}
                                            </Text>
                                        </View>
                                    ) : null}
                                </View>
                                <View style={styles.titleActions}>
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
                                <View style={styles.priceBlock}>
                                    <Text style={[styles.priceEyebrow, { color: colors.text.tertiary }]}>
                                        {post.attributes?.salary_range
                                            ? t('attrs.salaryRange')
                                            : (getPriceUnitLabel(post.price_unit) || t('common.price'))}
                                    </Text>
                                    <Text
                                        style={[styles.priceAmount, { color: colors.text.link }]}
                                        numberOfLines={1}
                                        adjustsFontSizeToFit
                                    >
                                        {post.attributes?.salary_range
                                            ? post.attributes.salary_range
                                            : `${Number(post.price_amount).toLocaleString('mn-MN', { maximumFractionDigits: 0 })}₮`}
                                    </Text>
                                </View>
                            )}
                        </>
                    )}
                </SectionCard>
                </FadeSlideIn>

                {/* ── Poster info (admin only) ────────────────────────────── */}
                {isAdmin && post.user && (
                    <FadeSlideIn index={1}>
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
                    </FadeSlideIn>
                )}

                {/* ── Stats card (provider only) ─────────────────────────── */}
                {isProvider && (
                    <FadeSlideIn index={1}>
                    <View style={[styles.statsCard, { backgroundColor: colors.surface }]}>
                        <StatTile
                            label={t('posts.viewCount')}
                            value={post.views || 0}
                            icon="eye-outline"
                            emphasis
                            style={styles.statItem}
                        />
                        <StatTile
                            label={t('nav.saved')}
                            value={likeStats.total_likes}
                            icon="heart-outline"
                            ready={!loadingLikes}
                            loading={loadingLikes}
                            style={styles.statItem}
                        />
                        <StatTile
                            label={t('posts.last7Days')}
                            value={likeStats.recent_likes}
                            icon="trending-up-outline"
                            ready={!loadingLikes}
                            loading={loadingLikes}
                            style={styles.statItem}
                        />
                    </View>
                    </FadeSlideIn>
                )}

                {/* ── Location & map ─────────────────────────────────────── */}
                <FadeSlideIn index={2}>
                <SectionCard label={t('posts.sectionLocation')} colors={colors} styles={styles}>
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
                                <Ionicons name="navigate-outline" size={20} color={colors.iconAccent} />
                                <Text style={[styles.mapBtnText, { color: colors.text.link }]}>{t('posts.openInMaps')}</Text>
                            </TouchableOpacity>
                        </View>
                    )}
                </SectionCard>
                </FadeSlideIn>

                {/* ── Category-specific attributes (dynamic) ─────────────── */}
                {post.attributes && Object.keys(post.attributes).length > 0 && (
                    <FadeSlideIn index={3}>
                    <CollapsibleSectionCard title={t('form.categoryDetails')} colors={colors} styles={styles}>
                        <View style={styles.detailsGrid}>
                            {Object.entries(post.attributes).map(([key, value]) => {
                                // Skip genuine absences only. `false` and `0` are
                                // answers — "no operator included" must render.
                                if (value === undefined || value === null || value === '') return null;
                                if (Array.isArray(value) && value.length === 0) return null;
                                // Schema field labels win (admin-editable, covers new
                                // verticals); the hardcoded map is the legacy fallback.
                                const fieldDef = schema?.fields?.find((f) => f.key === key);
                                const label = fieldDef?.labels?.[i18n.language]
                                    ?? (ATTR_I18N_KEYS[key] ? t(ATTR_I18N_KEYS[key]) : (fieldDef?.label || key));
                                const icon = ATTR_ICONS[key] || 'information-circle-outline';
                                // Select values are enum tokens (GOOD, FULL_TIME…) —
                                // translate them the same way the form's picker does.
                                const display = typeof value === 'boolean' || fieldDef?.type === 'boolean'
                                    ? (value === true ? t('common.yes') : t('common.no'))
                                    : fieldDef?.type === 'select' && typeof value === 'string'
                                        ? t('attrs.' + value.toLowerCase().replace(/_([a-z])/g, (_, c) => c.toUpperCase()), { defaultValue: value })
                                        : fieldDef?.unit
                                            ? `${value} ${fieldDef.unit}`
                                            : value;
                                if (Array.isArray(value)) {
                                    return (
                                        <DetailItem key={key} icon={icon} label={label} colors={colors} styles={styles}>
                                            <TagList tags={value} colors={colors} styles={styles} />
                                        </DetailItem>
                                    );
                                }
                                return <DetailItem key={key} icon={icon} label={label} colors={colors} styles={styles}>{String(display)}</DetailItem>;
                            })}
                        </View>
                    </CollapsibleSectionCard>
                    </FadeSlideIn>
                )}

                {/* ── Next 14 days (bookable categories) ─────────────────── */}
                {Boolean(schema?.has_rental_status) && Array.isArray(post.busy_dates) && (
                    <FadeSlideIn index={4}>
                    <SectionCard label={t('posts.availabilityNext')} colors={colors} styles={styles}>
                        <AvailabilityStrip busyDates={post.busy_dates} size="md" />
                    </SectionCard>
                    </FadeSlideIn>
                )}

                {/* ── Availability ───────────────────────────────────────── */}
                {(post.available_from || post.available_until) && (
                    <FadeSlideIn index={4}>
                    <SectionCard label={t('posts.sectionAvailability')} colors={colors} styles={styles}>
                        {post.available_from && (
                            <View style={styles.availRow}>
                                <View style={[styles.availIcon, { backgroundColor: colors.surfaceLight }]}>
                                    <Ionicons name="play-circle-outline" size={18} color={colors.text.secondary} />
                                </View>
                                <View>
                                    <Text style={[styles.detailLabel, { color: colors.text.secondary }]}>{t('posts.availableFrom')}</Text>
                                    <Text style={[styles.detailValue, { color: colors.text.primary }]}>{formatDate(post.available_from)}</Text>
                                </View>
                            </View>
                        )}
                        {post.available_until && (
                            <View style={styles.availRow}>
                                <View style={[styles.availIcon, { backgroundColor: colors.surfaceLight }]}>
                                    <Ionicons name="stop-circle-outline" size={18} color={colors.text.secondary} />
                                </View>
                                <View>
                                    <Text style={[styles.detailLabel, { color: colors.text.secondary }]}>{t('posts.availableUntil')}</Text>
                                    <Text style={[styles.detailValue, { color: colors.text.primary }]}>{formatDate(post.available_until)}</Text>
                                </View>
                            </View>
                        )}
                    </SectionCard>
                    </FadeSlideIn>
                )}

                {/* ── Description / details ─────────────────────────────── */}
                {(post.description || post.details) && (
                    <FadeSlideIn index={5}>
                    <SectionCard label={t('posts.sectionDescription')} colors={colors} styles={styles}>
                        <Text style={[styles.descriptionText, { color: colors.text.primary }]}>{post.description || post.details}</Text>
                    </SectionCard>
                    </FadeSlideIn>
                )}

                {/* ── Provider track record ──────────────────────────────── */}
                {post.user && (
                    <FadeSlideIn index={6}>
                    <ProviderCredentials providerId={post.user.id} />
                    </FadeSlideIn>
                )}

                {/* ── Contact info ───────────────────────────────────────── */}
                {(post.contact_phone || post.contact_email || post.website) && (
                    <FadeSlideIn index={6}>
                    <SectionCard label={t('posts.sectionContact')} colors={colors} styles={styles}>
                        {post.contact_phone && (
                            <ContactRow
                                icon="call-outline"
                                label={t('profile.phone')}
                                value={post.contact_phone}
                                onPress={() => {
                                    track('contact.revealed', { post_id: post.id, category: post.category });
                                    Linking.openURL(`tel:+976${post.contact_phone}`);
                                }}
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
                    </FadeSlideIn>
                )}

                {/* ── Meta info ─────────────────────────────────────────── */}
                <FadeSlideIn index={7}>
                <CollapsibleSectionCard title={t('posts.moreInfo')} colors={colors} styles={styles} defaultOpen={false}>
                    <MetaRow icon="calendar-outline" label={t('posts.publishedOn')} value={formatDateTime(post.created_at || post.date_created)} colors={colors} styles={styles} />
                    {post.updated_at && post.updated_at !== post.created_at && (
                        <MetaRow icon="refresh-outline" label={t('posts.updatedAt')} value={formatDateTime(post.updated_at)} colors={colors} styles={styles} />
                    )}
                    <MetaRow icon="finger-print-outline" label={t('posts.postId')} value={`#${post.id}`} colors={colors} styles={styles} />

                    {!isProvider && post.views !== undefined && (
                        <MetaRow icon="eye-outline" label={t('posts.viewCount')} value={String(post.views)} colors={colors} styles={styles} />
                    )}
                </CollapsibleSectionCard>
                </FadeSlideIn>

                {/* ── Provider reviews ───────────────────────────────────── */}
                {post.user && (
                    <FadeSlideIn index={8}>
                    <ReviewSection
                        providerId={post.user.id}
                        canReview={!isProvider && !isAdmin && post.user.id !== currentUserId}
                        autoOpen={openReview}
                    />
                    </FadeSlideIn>
                )}

                {/* ── Similar posts ──────────────────────────────────────── */}
                {!isAdmin && (
                    <FadeSlideIn index={9}>
                    <SimilarPostsDrawer
                        postId={postId}
                        onPressPost={(p) => navigation.push('PostDetailScreen', {
                            postId: p.id,
                            postType: p.category,
                            post: p,
                            role,
                            shouldIncrementViews: true,
                        })}
                    />
                    </FadeSlideIn>
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
                        {/* Each state offers only the move that changes something.
                            Approving an already-approved post did nothing except
                            push a fresh "your post was approved" to the provider. */}
                        {post.approval_status !== 'REJECTED' && (
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
                                    <Text style={[styles.rejectBtnText, { color: colors.danger }]}>
                                        {post.approval_status === 'PENDING' ? t('posts.reject') : t('admin.takeDown')}
                                    </Text>
                                </>
                            )}
                        </TouchableOpacity>
                        )}
                        {post.approval_status !== 'APPROVED' && (
                        <TouchableOpacity
                            style={[styles.approveBtn, (approving || rejecting) && styles.btnDisabled, { backgroundColor: colors.success }]}
                            onPress={handleApprove}
                            disabled={approving || rejecting}
                            activeOpacity={interactions.activeOpacity}
                        >
                            {approving ? (
                                <ActivityIndicator color={colors.text.onColor} size="small" />
                            ) : (
                                <>
                                    <Ionicons name={hasEdits ? 'save-outline' : 'checkmark-circle-outline'} size={20} color={colors.text.onColor} />
                                    <Text style={[styles.approveBtnText, { color: colors.text.onColor }]}>
                                        {hasEdits ? t('admin.saveAndApprove')
                                            : post.approval_status === 'PENDING' ? t('posts.approve')
                                                : t('admin.reinstate')}
                                    </Text>
                                </>
                            )}
                        </TouchableOpacity>
                        )}
                    </>
                ) : isProvider ? (
                    <>
                        <IconAction
                            icon="trash-outline"
                            onPress={handleDelete}
                            label={t('common.delete')}
                            danger
                            colors={colors}
                            styles={styles}
                        />
                        <Button
                            icon="create-outline"
                            title={t('common.edit')}
                            onPress={handleEdit}
                            variant="primary"
                            size="medium"
                            style={styles.footerBtn}
                        />
                    </>
                ) : (
                    <>
                        {post.latitude && post.longitude && (
                            <IconAction
                                icon="navigate-outline"
                                onPress={handleDirections}
                                label={t('posts.navigate')}
                                colors={colors}
                                styles={styles}
                            />
                        )}
                        {canBook && post.contact_phone && (
                            <IconAction
                                icon="call-outline"
                                onPress={handleCall}
                                label={t('posts.call')}
                                colors={colors}
                                styles={styles}
                            />
                        )}
                        {schemaError && !schema ? (
                            <Button
                                icon="refresh-outline"
                                title={t('common.retry')}
                                onPress={() => refetchSchema()}
                                variant="secondary"
                                size="medium"
                                style={styles.footerBtn}
                            />
                        ) : canBook && !isBookable ? (
                            <Button
                                icon="calendar-outline"
                                title={t('errors.codes.BOOKING_POST_UNAVAILABLE')}
                                onPress={() => {}}
                                disabled
                                variant="primary"
                                size="medium"
                                style={styles.footerBtn}
                            />
                        ) : (bookingOpen || post.contact_phone) && (
                            <Button
                                icon={bookingOpen ? 'calendar-outline' : 'call-outline'}
                                title={bookingOpen ? t('booking.request') : t('posts.call')}
                                onPress={bookingOpen ? () => setShowBookingModal(true) : handleCall}
                                variant="primary"
                                size="medium"
                                style={styles.footerBtn}
                            />
                        )}
                    </>
                )}
            </View>

            {/* ── Booking request modal (customer) ───────────────────────── */}
            {bookingOpen && (
                <BookingRequestModal
                    visible={showBookingModal}
                    onClose={() => setShowBookingModal(false)}
                    postId={post.id}
                    availableFrom={post.available_from}
                    availableUntil={post.available_until}
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
    heroFallback: {
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.sm,
    },
    heroLoading: { position: 'absolute', top: 0, left: 0 },
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
    heroGradient: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 80,
    },
    heroCategoryPill: {
        position: 'absolute',
        top: spacing.sm,
        left: spacing.lg,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.xs,
        borderRadius: radius.xxl,
        maxWidth: '70%',
    },
    heroCategoryText: {
        ...typography.styles.badge,
    },
    heroStatusWrap: {
        position: 'absolute',
        top: spacing.sm,
        right: spacing.lg,
    },

    // Section card
    sectionLabel: {
        ...typography.styles.overline,
        textTransform: 'uppercase',
        marginBottom: spacing.sm,
    },
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
        // Subcategory labels are admin-editable: shrink inside the title column
        // rather than overrunning it into the action buttons.
        flexShrink: 1,
    },
    priceBlock: {
        marginTop: spacing.md,
    },
    priceEyebrow: {
        ...typography.styles.overline,
        textTransform: 'uppercase',
        marginBottom: spacing.xxs,
    },
    priceAmount: {
        ...typography.styles.display,
        color: colors.text.link,
        fontVariant: ['tabular-nums'],
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
        // 28% basis leaves room for the row's gaps: three stats share one row
        // (33% + gaps overflowed and wrapped the third onto its own giant row);
        // four stats still wrap into an even 2×2.
        flexGrow: 1,
        flexBasis: '28%',
        minHeight: 70,
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
        color: colors.text.link,
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
    tagText: { ...typography.styles.label, color: colors.text.link },

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
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.surface,
        padding: spacing.md,
        gap: spacing.md,
    },
    footerBtn: { flex: 1 },
    iconAction: {
        width: 52,
        height: 52,
        borderRadius: radius.button,
        borderWidth: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },

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

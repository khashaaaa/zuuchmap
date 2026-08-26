import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
    View,
    Text,
    TextInput,
    ScrollView,
    Platform,
    KeyboardAvoidingView,
    Keyboard,
    StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { spacing, typography, safeAreaHelpers, radius, isTablet, withAlpha } from '../../design/theme';
import { useAppTheme } from '../../hooks/useAppTheme';
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n';
import postService from '../../services/api/postService';
import CustomSafeAreaView from '../../components/CustomSafeAreaView';

import { ScreenHeader, ScreenLoading, WizardSteps, PostHealthRing, DraftResumeBanner } from '../../components';
import ImageUploadSection from '../../components/ImageUploadSection';
import LocationSection from '../../components/LocationSection';
import ContactSection from '../../components/ContactSection';
import StatusSection from '../../components/StatusSection';
import DynamicForm, { fieldLabel, FieldHighlight } from '../../components/DynamicForm';
import Button from '../../components/Button';
import FormField from '../../components/FormField';
import { PressableScale } from '../../components';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useFocusField } from '../../hooks/useFocusField';
import categoryService from '../../services/api/categoryService';
import { invalidatePostData } from '../../services/queryClient';
import { getInitialFormData, getEditFormData, formatFormDataForApi, suggestTitle } from '../../utils/formUtils';
import { saveDraft, readDraft, clearDraft } from '../../utils/draftStorage';
import { computePostHealth } from '../../utils/postHealth';
import { navigateToProviderPostList } from '../../utils/navigationUtils';
import { logger } from '../../utils/logger';
import { showErrorModal, showWarningModal } from '../../utils/errorManager';
import { track } from '../../services/analytics';
import SuccessSheet from '../../components/SuccessSheet';
import { getSchemaLabel, getSubcategoryLabel } from '../../utils/postUtils';

// Drafts live in `utils/draftStorage` — written as the provider types (see the
// autosave effect), offered back through <DraftResumeBanner>, cleared on submit.

// Which base field an admin's `rejection_field` points at, for the reason card.
const BASE_FIELD_LABELS = {
    title: 'form.postTitle',
    details: 'form.postDetails',
    price: 'form.priceAmount',
    images: 'posts.rejectedFieldImages',
    location: 'posts.rejectedFieldLocation',
};
const rejectedFieldLabel = (key, schema, t, lng) => {
    if (!key) return null;
    if (BASE_FIELD_LABELS[key]) return t(BASE_FIELD_LABELS[key]);
    const def = schema?.fields?.find((f) => f.key === key);
    return def ? fieldLabel(def, t, lng) : key;
};

const HEALTH_HINT_KEYS = {
    photos: 'provider.healthPhotos',
    attributes: 'provider.healthAttributes',
    details: 'provider.healthDetails',
    price: 'provider.healthPrice',
};

// The engine answers a rejected create with a machine-readable code in
// `message`. Without this the provider is shown the code itself —
// "POST_QUOTA_EXCEEDED" — and has nothing to act on. Mirrors
// `postErrorMessage` in the web ProviderPostForm; keep the two in step.
const postErrorDetail = (data, t, schema, lng) => {
    if (data?.message === 'MISSING_REQUIRED_ATTRIBUTES' && Array.isArray(data.fields)) {
        const names = data.fields
            .map((key) => {
                const def = schema?.fields?.find((f) => f.key === key);
                return def ? fieldLabel(def, t, lng) : key;
            })
            .join(', ');
        return t('posts.missingRequired', { fields: names });
    }
    if (data?.message === 'INVALID_PRICE_UNIT') return t('posts.invalidPriceUnit');
    // The quota reply carries the limit it was measured against — a bare "too
    // many posts" leaves the provider guessing at the number.
    if (data?.message === 'POST_QUOTA_EXCEEDED') return t('posts.quotaExceeded', { limit: data.limit });
    const raw = data?.message;
    if (Array.isArray(raw)) return raw.join('\n');
    // A SCREAMING_SNAKE payload is a code this screen has no wording for yet;
    // showing it verbatim is worse than the generic line, and `logger.error`
    // above already has the real value. Anything else is a class-validator
    // sentence meant to be read.
    if (typeof raw === 'string' && /^[A-Z][A-Z0-9_]*$/.test(raw)) return null;
    return raw ?? null;
};
const ProviderPostForm = ({ route, navigation }) => {
    const { colors, isDark, styles: gStyles } = useAppTheme();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const { t } = useTranslation();
    const insets = useSafeAreaInsets();
    const [imagesLoading, setImagesLoading] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    // 0-100 while the photos upload; null when there is nothing to report.
    const [uploadPct, setUploadPct] = useState(null);
    // The upload is not cancellable, so leaving the screen mid-post keeps the
    // request (and its progress events) alive after this component is gone.
    const mountedRef = useRef(true);
    useEffect(() => () => { mountedRef.current = false; }, []);
    const scrollViewRef = useRef(null);
    const inputRefs = useRef({});

    const { postId, postType, post: initialPost, location, category, subcategory } = route.params;
    const isEdit = !!postId;

    const resolvedPostType = isEdit ? postType : category;

    // Category schema drives form behavior (status/price/dates) and dynamic fields
    const [formData, setFormData] = useState(null);
    const [formErrors, setFormErrors] = useState({});
    const [dirty, setDirty] = useState(false);
    // Whether the post was live before this edit — the "back in review" notice
    // only means something for a listing that was actually in browse.
    const wasApproved = useRef(false);
    // Which availability date the picker edits: 'from' | 'until' | null
    const [pickerFor, setPickerFor] = useState(null);
    const [successState, setSuccessState] = useState({ visible: false, isEdit: false, backToReview: false });
    // A draft found on disk, offered but not yet applied: { data, savedAt }.
    const [pendingDraft, setPendingDraft] = useState(null);
    // Once the provider has typed a title themselves the suggestion stops.
    const titleTouched = useRef(false);

    const handleSuccessDone = () => {
        setSuccessState((prev) => ({ ...prev, visible: false }));
        if (successState.isEdit) {
            if (navigation.canGoBack()) {
                navigation.goBack();
            } else {
                navigation.navigate('ProviderDashboard', { screen: 'Posts', params: { refresh: true } });
            }
        } else {
            navigateToProviderPostList(navigation);
        }
    };

    const { data: schema = null, isFetched: schemaFetched } = useQuery({
        queryKey: ['categories', 'byKey', resolvedPostType],
        queryFn: () => categoryService.getCategoryByKey(resolvedPostType).catch(() => null),
        staleTime: 10 * 60 * 1000,
    });

    // Funnel: a provider opened the create form (matches the web client).
    useEffect(() => {
        if (!isEdit) track('post.create.started');
    }, []);

    useEffect(() => {
        if (!schemaFetched || formData) return;
        if (isEdit) {
            setFormData(getEditFormData(schema, initialPost));
            wasApproved.current = initialPost?.approval_status === 'APPROVED';
            return;
        }
        let cancelled = false;
        (async () => {
            const draft = await readDraft(resolvedPostType);
            if (cancelled) return;
            // The form opens blank; the draft is offered, not imposed.
            setFormData(getInitialFormData(schema, subcategory, location));
            if (draft) setPendingDraft(draft);
        })();
        return () => { cancelled = true; };
    }, [schemaFetched]);

    // Persist as the provider types. Debounced through a timer so a long form
    // does not write on every keystroke.
    useEffect(() => {
        if (isEdit || !formData || !dirty) return;
        const id = setTimeout(() => saveDraft(resolvedPostType, formData), 800);
        return () => clearTimeout(id);
    }, [formData, dirty, isEdit, resolvedPostType]);

    const resumeDraft = useCallback(() => {
        if (!pendingDraft) return;
        const base = getInitialFormData(schema, subcategory, location);
        const { data } = pendingDraft;
        // The location just picked in the wizard wins over the drafted one —
        // the provider chose it after the draft was written.
        setFormData({
            ...base,
            ...data,
            ...(location ? {
                latitude: base.latitude, longitude: base.longitude, location: base.location,
                province: base.province, district: base.district,
            } : {}),
        });
        if (data.title) titleTouched.current = true;
        setPendingDraft(null);
        setDirty(true);
    }, [pendingDraft, schema, subcategory, location]);

    const discardDraft = useCallback(() => {
        clearDraft(resolvedPostType);
        setPendingDraft(null);
    }, [resolvedPostType]);

    const updateFormData = (field, value) => {
        if (field === 'title') titleTouched.current = true;
        setFormData(prev => ({ ...prev, [field]: value }));
        setDirty(true);
    };

    // Photo-first: the title is derived from what the provider has already
    // told us (subcategory + first identifying attribute) until they write
    // one themselves. Not marked dirty — nothing of theirs was typed.
    useEffect(() => {
        if (isEdit || !formData || titleTouched.current) return;
        const suggested = suggestTitle(formData, schema);
        if (suggested && suggested !== formData.title) {
            setFormData((prev) => ({ ...prev, title: suggested }));
        }
    }, [isEdit, schema, formData?.subcategory, formData?.attributes]);

    const health = useMemo(() => computePostHealth(formData, schema), [formData, schema]);
    const healthHint = health.missing ? t(HEALTH_HINT_KEYS[health.missing]) : t('provider.healthComplete');

    const rejection = isEdit && initialPost?.rejection_reason
        ? { reason: initialPost.rejection_reason, field: initialPost.rejection_field || null }
        : null;
    const rejectedField = rejectedFieldLabel(rejection?.field, schema, t, i18n.language);
    const highlightKey = rejection?.field ?? null;

    const handleBack = useCallback(() => {
        if (!dirty) {
            navigation.goBack();
            return;
        }
        // Drafts are only written while creating (see the autosave effect), so on
        // an edit there is nothing to keep — offering "keep draft" there gave two
        // buttons that both discarded, under copy promising the opposite.
        if (isEdit) {
            showWarningModal(t('common.unsavedChangesTitle'), t('common.editDiscardMessage'), [
                { text: t('common.cancel'), style: 'cancel' },
                { text: t('common.discard'), style: 'destructive', onPress: () => navigation.goBack() },
            ]);
            return;
        }
        // Leaving keeps the draft; only "discard" throws the work away.
        showWarningModal(t('common.unsavedChangesTitle'), t('common.draftKeptMessage'), [
            { text: t('common.cancel'), style: 'cancel' },
            {
                text: t('common.discard'),
                style: 'destructive',
                onPress: () => { clearDraft(resolvedPostType); navigation.goBack(); },
            },
            { text: t('common.keepDraft'), onPress: () => navigation.goBack() },
        ]);
    }, [dirty, navigation, isEdit, t, resolvedPostType]);

    // District only exists inside Ulaanbaatar. Leaving it blank is deliberate:
    // silently defaulting to Bayanzurkh filed every unattended UB post under a
    // district the provider never picked.
    useEffect(() => {
        if (!formData) return;
        if (formData.province !== 'ULAANBAATAR' && formData.district) {
            updateFormData('district', '');
        }
    }, [formData?.province]);

    const validateForm = (data) => {
        const errors = {};
        if (!data.title || !data.title.trim()) {
            errors.title = i18n.t('form.titleRequired');
        }
        if (!data.images || data.images.length === 0) {
            errors.images = i18n.t('form.imageRequired');
        }
        if (!data.contact_phone) {
            errors.contact_phone = i18n.t('form.contactPhoneRequired');
        } else if (!/^\d{8}$/.test(data.contact_phone)) {
            errors.contact_phone = i18n.t('form.phoneDigits');
        }
        (schema?.fields ?? []).forEach((field) => {
            if (!field.required) return;
            const value = data.attributes?.[field.key];
            const isEmpty = value == null || (typeof value === 'string' ? value.trim() === '' : false);
            if (isEmpty) {
                errors[`attributes.${field.key}`] = i18n.t('form.fieldRequired', {
                    field: field.labels?.[i18n.language] ?? field.label,
                });
            }
        });
        setFormErrors(errors);
        return errors;
    };

    const focusField = useFocusField(scrollViewRef, inputRefs);

    const handleSubmit = useCallback(async () => {
        Keyboard.dismiss();

        const errors = validateForm(formData);
        if (Object.keys(errors).length > 0) {
            // No dialog: FormField already shows each message in place, and we
            // scroll to the first one. A modal only added a tap before the fix.
            const firstErrorField = Object.keys(errors).find(field => errors[field]);
            if (firstErrorField) {
                // Dynamic-field errors are keyed 'attributes.<key>', but inputRefs are keyed by the raw field key
                const refKey = firstErrorField.startsWith('attributes.')
                    ? firstErrorField.slice('attributes.'.length)
                    : firstErrorField;
                setTimeout(() => focusField(refKey), 300);
            }
            return;
        }

        setIsLoading(true);
        const onProgress = (pct) => {
            if (!mountedRef.current) return;
            setUploadPct(pct >= 100 ? null : pct);
        };

        try {
            if (isEdit) {
                const formattedData = formatFormDataForApi(formData);
                const updated = await postService.update(postId, formattedData, onProgress);
                invalidatePostData();
                setDirty(false);
                // A content edit sends an approved post back to moderation, so it
                // leaves browse the moment it saves. Read that off the response
                // rather than guessing which fields counted as content — "changes
                // saved" on a listing that just vanished reads as a bug.
                const backToReview = updated?.data?.approval_status === 'PENDING' && wasApproved.current;
                // Sheet first, navigate on dismiss — publishing deserves a staged
                // moment, not a system dialog dropped over the next screen.
                setSuccessState({ visible: true, isEdit: true, backToReview });
            } else {
                const formattedData = formatFormDataForApi(formData);
                const created = await postService.create(resolvedPostType, formattedData, onProgress);
                track('post.create.submitted', { post_id: created?.data?.id, category: resolvedPostType });
                invalidatePostData();
                setDirty(false);
                clearDraft(resolvedPostType);
                // Posts land in PENDING — without this, a provider can think the post vanished
                setSuccessState({ visible: true, isEdit: false });
            }
        } catch (error) {
            logger.error(isEdit ? 'Зар шинэчлэх алдаа:' : 'Зар үүсгэх алдаа:', error);

            if (error.response?.status === 400) {
                const base = t(isEdit ? 'posts.updateError' : 'posts.createError');
                const detail = postErrorDetail(error.response.data, t, schema, i18n.language);
                showErrorModal(t('common.validationError'), detail ? base + '\n\n' + detail : base);
            } else {
                showErrorModal(t('common.error'), t(isEdit ? 'posts.updateError' : 'posts.createError'));
            }
        } finally {
            setIsLoading(false);
            setUploadPct(null);
        }
    }, [formData, validateForm, focusField, navigation, isEdit, postId, resolvedPostType, schema, t]);

    if (!formData) {
        return (
            <CustomSafeAreaView backgroundColor={colors.background} statusBarColor={colors.surface} statusBarStyle={isDark ? 'light-content' : 'dark-content'}>
                <ScreenHeader
                    title={t(isEdit ? 'provider.postEdit' : 'provider.postCreate')}
                    onBack={handleBack}
                />
                <ScreenLoading />
            </CustomSafeAreaView>
        );
    }

    return (
        <CustomSafeAreaView backgroundColor={colors.background} statusBarColor={colors.surface} statusBarStyle={isDark ? 'light-content' : 'dark-content'}>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={gStyles.keyboardAvoidingView}
            >
                <ScreenHeader
                    title={t(isEdit ? 'provider.postEdit' : 'provider.postCreate')}
                    onBack={handleBack}
                />
                {!isEdit && (
                    <WizardSteps current={4} labels={[t('provider.stepCategory'), t('provider.stepSubcategory'), t('provider.stepLocation'), t('provider.stepDetails')]} />
                )}

                <ScrollView
                    style={styles.scrollView}
                    ref={scrollViewRef}
                    contentContainerStyle={[
                        styles.scrollContent,
                        gStyles.scrollViewContentWithBottomInset(safeAreaHelpers.getBottomSafeArea(insets)),
                    ]}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                >
                    <View style={isTablet ? styles.tabletContainer : undefined}>
                    {/* Said before the edit, not only after it: a provider changing
                        a price on a live listing is entitled to know it leaves
                        browse until an admin looks at it again. */}
                    {rejection && (
                        <View style={styles.rejectCard} accessibilityRole="alert">
                            <View style={styles.rejectHead}>
                                <Ionicons name="close-circle" size={20} color={colors.danger} />
                                <Text style={styles.rejectTitle} maxFontSizeMultiplier={1.3}>{t('posts.rejectedFieldTitle')}</Text>
                            </View>
                            <Text style={styles.rejectReason} maxFontSizeMultiplier={1.3}>{rejection.reason}</Text>
                            {!!rejectedField && (
                                <View style={styles.rejectFieldChip}>
                                    <Ionicons name="arrow-down-outline" size={13} color={colors.danger} />
                                    <Text style={styles.rejectFieldText} maxFontSizeMultiplier={1.3}>
                                        {t('posts.rejectedFieldLabel', { field: rejectedField })}
                                    </Text>
                                </View>
                            )}
                        </View>
                    )}
                    {isEdit && wasApproved.current && (
                        <View style={styles.reviewNotice}>
                            <Ionicons name="alert-circle-outline" size={18} color={colors.warning} />
                            <Text style={styles.reviewNoticeText}>{t('posts.editNeedsApproval')}</Text>
                        </View>
                    )}
                    <View style={[styles.headerInfo, isEdit ? styles.headerInfoEdit : styles.headerInfoCreate]}>
                        <View style={styles.infoRow}>
                            <View style={[styles.infoIcon, isEdit ? styles.infoIconEdit : styles.infoIconCreate]}>
                                <Ionicons name="pricetag-outline" size={20} color={isEdit ? colors.warning : colors.primary} />
                            </View>
                            <Text style={styles.infoText}>
                                {schema ? getSchemaLabel(schema) : t('category.' + resolvedPostType, { defaultValue: resolvedPostType })}
                                {formData.subcategory
                                    ? ` → ${getSubcategoryLabel(formData.subcategory, schema)}`
                                    : ''}
                            </Text>
                        </View>

                        <View style={styles.infoRow}>
                            <View style={[styles.infoIcon, isEdit ? styles.infoIconEdit : styles.infoIconCreate]}>
                                <Ionicons name="location-outline" size={20} color={isEdit ? colors.warning : colors.primary} />
                            </View>
                            <Text style={styles.infoText}>
                                {isEdit ? (formData.location || t('provider.locationNotSet')) : location.locationName}
                            </Text>
                        </View>
                    </View>

                    {pendingDraft && (
                        <DraftResumeBanner
                            savedAt={pendingDraft.savedAt}
                            onResume={resumeDraft}
                            onDiscard={discardDraft}
                        />
                    )}

                    {/* Listing quality: the ring is the score, the line is the
                        one thing that would raise it most. Recomputed live. */}
                    <View style={styles.healthRow}>
                        <PostHealthRing score={health.score} size={48} stroke={4} />
                        <View style={styles.healthText}>
                            <Text style={styles.healthTitle} maxFontSizeMultiplier={1.3}>{t('provider.healthTitle')}</Text>
                            <Text style={styles.healthHint} maxFontSizeMultiplier={1.3} numberOfLines={2}>{healthHint}</Text>
                        </View>
                    </View>

                    {/* Photo first on create: the picture is what a customer
                        judges the listing by, so it comes before the typing. */}
                    {!isEdit && (
                        <FieldHighlight active={highlightKey === 'images'} scrollViewRef={scrollViewRef}>
                            <ImageUploadSection
                                images={formData.images}
                                onImagesChange={(images) => updateFormData('images', images)}
                                imagesLoading={imagesLoading}
                                setImagesLoading={setImagesLoading}
                                error={formErrors.images}
                                isEdit={false}
                                photoFirst
                            />
                        </FieldHighlight>
                    )}

                    {/* Base listing info — title feeds search + every list card;
                        these are Post columns, not schema attributes. */}
                    <View style={gStyles.sectionHeader}>
                        <Text style={[gStyles.sectionSubtitle, { color: colors.text.secondary }]}>{t('form.basicInfo')}</Text>
                    </View>
                    <FieldHighlight active={highlightKey === 'title'} scrollViewRef={scrollViewRef}>
                    <FormField
                        label={t('form.postTitle')}
                        required
                        error={formErrors.title}
                        component={
                            <TextInput
                                style={[
                                    gStyles.input,
                                    { backgroundColor: colors.surface, color: colors.text.primary, borderColor: colors.border.light },
                                    formErrors.title && gStyles.inputError,
                                ]}
                                value={formData.title}
                                onChangeText={(v) => updateFormData('title', v)}
                                placeholder={t('form.postTitlePlaceholder')}
                                placeholderTextColor={colors.text.placeholder}
                                maxLength={200}
                                maxFontSizeMultiplier={1.3}
                                ref={(ref) => { inputRefs.current.title = ref; }}
                            />
                        }
                    />
                    </FieldHighlight>
                    <FieldHighlight active={highlightKey === 'details'} scrollViewRef={scrollViewRef}>
                    <FormField
                        label={t('form.postDetails')}
                        component={
                            <TextInput
                                style={[
                                    gStyles.input,
                                    gStyles.inputTextArea,
                                    { backgroundColor: colors.surface, color: colors.text.primary, borderColor: colors.border.light },
                                ]}
                                value={formData.details}
                                onChangeText={(v) => updateFormData('details', v)}
                                placeholder={t('form.postDetailsPlaceholder')}
                                placeholderTextColor={colors.text.placeholder}
                                maxLength={2000}
                                multiline
                                numberOfLines={4}
                                textAlignVertical="top"
                                maxFontSizeMultiplier={1.3}
                            />
                        }
                    />
                    </FieldHighlight>

                    {isEdit && (
                        <FieldHighlight active={highlightKey === 'images'} scrollViewRef={scrollViewRef}>
                            <ImageUploadSection
                                images={formData.images}
                                onImagesChange={(images) => updateFormData('images', images)}
                                imagesLoading={imagesLoading}
                                setImagesLoading={setImagesLoading}
                                error={formErrors.images}
                                isEdit
                            />
                        </FieldHighlight>
                    )}

                    <FieldHighlight active={highlightKey === 'location'} scrollViewRef={scrollViewRef}>
                        <LocationSection
                            province={formData.province}
                            district={formData.district}
                            onProvinceChange={(value) => updateFormData('province', value)}
                            onDistrictChange={(value) => updateFormData('district', value)}
                            errors={{ province: formErrors.province, district: formErrors.district }}
                        />
                    </FieldHighlight>

                    {/* Attributes + price (schema-flag driven, same as web). */}
                    <DynamicForm
                        fields={schema?.fields ?? []}
                        schema={schema}
                        formData={formData}
                        updateFormData={updateFormData}
                        formErrors={formErrors}
                        inputRefs={inputRefs}
                        highlightKey={highlightKey}
                        scrollViewRef={scrollViewRef}
                    />

                    {schema?.has_availability_dates && (
                        <View>
                            <View style={gStyles.sectionHeader}>
                                <Text style={[gStyles.sectionSubtitle, { color: colors.text.secondary }]}>{t('form.availabilitySection')}</Text>
                            </View>
                            <View style={styles.dateRow}>
                                <PressableScale style={[styles.dateBox, { backgroundColor: colors.surface, borderColor: colors.border.light }]} onPress={() => setPickerFor('from')} accessibilityRole="button">
                                    <Text style={[styles.dateLabel, { color: colors.text.secondary }]}>{t('posts.availableFrom')}</Text>
                                    <Text style={[styles.dateValue, { color: colors.text.primary }]}>{new Date(formData.available_from).toLocaleDateString()}</Text>
                                </PressableScale>
                                <PressableScale style={[styles.dateBox, { backgroundColor: colors.surface, borderColor: colors.border.light }]} onPress={() => setPickerFor('until')} accessibilityRole="button">
                                    <Text style={[styles.dateLabel, { color: colors.text.secondary }]}>{t('posts.availableUntil')}</Text>
                                    <Text style={[styles.dateValue, { color: colors.text.primary }]}>{new Date(formData.available_until).toLocaleDateString()}</Text>
                                </PressableScale>
                            </View>
                            {pickerFor && (
                                <DateTimePicker
                                    value={new Date(pickerFor === 'from' ? formData.available_from : formData.available_until)}
                                    mode="date"
                                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                                    minimumDate={pickerFor === 'until' ? new Date(formData.available_from) : new Date()}
                                    onChange={(event, selected) => {
                                        if (Platform.OS !== 'ios') setPickerFor(null);
                                        if (event.type === 'dismissed' || !selected) return;
                                        updateFormData(pickerFor === 'from' ? 'available_from' : 'available_until', selected);
                                    }}
                                />
                            )}
                            {pickerFor && Platform.OS === 'ios' && (
                                <Button title={t('common.done', { defaultValue: 'OK' })} onPress={() => setPickerFor(null)} size="small" />
                            )}
                        </View>
                    )}

                    <ContactSection
                        contactPhone={formData.contact_phone}
                        onContactPhoneChange={(value) => updateFormData('contact_phone', value)}
                        error={formErrors.contact_phone}
                        inputRefs={inputRefs}
                    />

                    {isEdit && schema?.has_rental_status && (
                        <StatusSection
                            status={formData.status}
                            onStatusChange={(value) => updateFormData('status', value)}
                            error={formErrors.status}
                        />
                    )}
                    </View>
                </ScrollView>

                <View style={[gStyles.bottomContainerWithInset(safeAreaHelpers.getBottomSafeArea(insets)), { backgroundColor: colors.surface }]}>
                    <Button
                        title={t(isEdit ? 'provider.postEdit' : 'provider.postCreate')}
                        onPress={handleSubmit}
                        disabled={isLoading || imagesLoading}
                        loading={isLoading || imagesLoading}
                        loadingText={uploadPct !== null
                            ? t('posts.uploadingPct', { pct: uploadPct })
                            : t(isEdit ? 'provider.updating' : 'provider.creating')}
                        fullWidth
                    />
                </View>
            </KeyboardAvoidingView>

            <SuccessSheet
                visible={successState.visible}
                onClose={handleSuccessDone}
                onCta={handleSuccessDone}
                title={t(successState.isEdit ? 'posts.updateSuccess' : 'posts.createSuccess')}
                message={t(
                    successState.backToReview ? 'posts.updatedPending'
                        : successState.isEdit ? 'posts.updateSuccessDesc'
                            : 'posts.createSuccessDesc',
                )}
                ctaText={t('posts.successCta')}
            />
        </CustomSafeAreaView>
    );
};

const createStyles = (colors) => StyleSheet.create({
    scrollView: { flex: 1 },
    dateRow: {
        flexDirection: 'row',
        gap: spacing.md,
        marginBottom: spacing.md,
    },
    dateBox: {
        flex: 1,
        borderWidth: 1,
        borderRadius: radius.input,
        padding: spacing.md,
        gap: spacing.xxs,
    },
    dateLabel: {
        ...typography.styles.label,
    },
    dateValue: {
        ...typography.styles.bodyBold,
    },
    reviewNotice: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: spacing.sm,
        padding: spacing.md,
        marginBottom: spacing.md,
        borderRadius: radius.card,
        borderWidth: 1,
        borderColor: withAlpha(colors.warning, 0.25),
        backgroundColor: withAlpha(colors.warning, 0.1),
    },
    reviewNoticeText: {
        ...typography.styles.caption,
        color: colors.warning,
        flex: 1,
    },
    scrollContent: { padding: spacing.lg },
    tabletContainer: { maxWidth: 680, alignSelf: 'center', width: '100%' },
    headerInfo: {
        borderRadius: radius.card,
        padding: spacing.lg,
        marginBottom: spacing.xl,
    },
    healthRow: {
        ...colors.elevation.sm,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        padding: spacing.md,
        marginBottom: spacing.lg,
        borderRadius: radius.card,
        backgroundColor: colors.surface,
    },
    healthText: { flex: 1, gap: spacing.xxs },
    healthTitle: { ...typography.styles.labelStrong, color: colors.text.primary },
    healthHint: { ...typography.styles.caption, color: colors.text.secondary },
    rejectCard: {
        gap: spacing.sm,
        padding: spacing.md,
        marginBottom: spacing.md,
        borderRadius: radius.card,
        borderWidth: 1,
        borderColor: withAlpha(colors.danger, 0.3),
        backgroundColor: withAlpha(colors.danger, 0.08),
    },
    rejectHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    rejectTitle: { ...typography.styles.bodyBold, color: colors.danger, flex: 1 },
    rejectReason: { ...typography.styles.body, color: colors.text.primary },
    rejectFieldChip: {
        alignSelf: 'flex-start',
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xxs,
        paddingVertical: spacing.xxs,
        paddingHorizontal: spacing.sm,
        borderRadius: radius.full,
        backgroundColor: withAlpha(colors.danger, 0.12),
    },
    rejectFieldText: { ...typography.styles.label, color: colors.danger },
    headerInfoCreate: {
        backgroundColor: colors.surfaceElevated,
        borderWidth: 1,
        borderColor: colors.opacity.border.primaryMedium,
    },
    headerInfoEdit: {
        backgroundColor: colors.surfaceElevated,
        borderWidth: 1,
        borderColor: colors.opacity.border.warning,
    },
    infoRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: spacing.sm,
    },
    infoIcon: {
        width: 32,
        height: 32,
        borderRadius: radius.full,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: spacing.md,
    },
    infoIconCreate: { backgroundColor: colors.opacity.background.primary },
    infoIconEdit: { backgroundColor: colors.opacity.background.warning },
    infoText: {
        ...typography.styles.bodyMedium,
        color: colors.text.primary,
        flex: 1,
    },
});

export default ProviderPostForm;

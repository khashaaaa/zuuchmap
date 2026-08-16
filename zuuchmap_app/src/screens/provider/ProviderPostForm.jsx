import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
    View,
    Text,
    ScrollView,
    Platform,
    KeyboardAvoidingView,
    Keyboard,
    StyleSheet,
    ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { spacing, typography, safeAreaHelpers, radius, isTablet } from '../../design/theme';
import { useAppTheme } from '../../hooks/useAppTheme';
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n';
import postService from '../../services/api/postService';
import CustomSafeAreaView from '../../components/CustomSafeAreaView';

import { ScreenHeader } from '../../components';
import ImageUploadSection from '../../components/ImageUploadSection';
import LocationSection from '../../components/LocationSection';
import ContactSection from '../../components/ContactSection';
import StatusSection from '../../components/StatusSection';
import DynamicForm from '../../components/DynamicForm';
import Button from '../../components/Button';
import { useFocusField } from '../../hooks/useFocusField';
import categoryService from '../../services/api/categoryService';
import { invalidatePostData } from '../../services/queryClient';
import { getInitialFormData, getEditFormData, formatFormDataForApi } from '../../utils/formUtils';
import { navigateToProviderPostList } from '../../utils/navigationUtils';
import { logger } from '../../utils/logger';
import { showErrorModal, showWarningModal } from '../../utils/errorManager';
import { getSchemaLabel, getSubcategoryLabel } from '../../utils/postUtils';

const ProviderPostForm = ({ route, navigation }) => {
    const { colors, isDark, styles: gStyles } = useAppTheme();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const { t } = useTranslation();
    const insets = useSafeAreaInsets();
    const [imagesLoading, setImagesLoading] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const scrollViewRef = useRef(null);
    const inputRefs = useRef({});

    const { postId, postType, post: initialPost, location, category, subcategory } = route.params;
    const isEdit = !!postId;

    const resolvedPostType = isEdit ? postType : category;

    // Category schema drives form behavior (status/price/dates) and dynamic fields
    const [formData, setFormData] = useState(null);
    const [formErrors, setFormErrors] = useState({});
    const [dirty, setDirty] = useState(false);

    const { data: schema = null, isFetched: schemaFetched } = useQuery({
        queryKey: ['categories', 'byKey', resolvedPostType],
        queryFn: () => categoryService.getCategoryByKey(resolvedPostType).catch(() => null),
        staleTime: 10 * 60 * 1000,
    });

    useEffect(() => {
        if (schemaFetched && !formData) {
            setFormData(isEdit
                ? getEditFormData(schema, initialPost)
                : getInitialFormData(schema, subcategory, location));
        }
    }, [schemaFetched]);

    const updateFormData = (field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }));
        setDirty(true);
    };

    const handleBack = useCallback(() => {
        if (!dirty) {
            navigation.goBack();
            return;
        }
        showWarningModal(t('common.unsavedChangesTitle'), t('common.unsavedChangesMessage'), [
            { text: t('common.cancel'), style: 'cancel' },
            { text: t('common.discard'), style: 'destructive', onPress: () => navigation.goBack() },
        ]);
    }, [dirty, navigation, t]);

    // Keep Ulaanbaatar/Bayanzurkh as default district when province changes
    useEffect(() => {
        if (!formData) return;
        if (formData.province !== 'ULAANBAATAR') {
            updateFormData('district', '');
        } else if (!formData.district) {
            updateFormData('district', 'BAYANZURKH');
        }
    }, [formData?.province]);

    const validateForm = (data) => {
        const errors = {};
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

    const clearError = (field) => {
        setFormErrors(prev => ({ ...prev, [field]: null }));
    };

    const focusField = useFocusField(scrollViewRef, inputRefs);

    const handleSubmit = useCallback(async () => {
        Keyboard.dismiss();

        const errors = validateForm(formData);
        if (Object.keys(errors).length > 0) {
            showErrorModal(t('common.error'), t('common.formError'));
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

        try {
            if (isEdit) {
                const formattedData = formatFormDataForApi(formData);
                await postService.update(postId, formattedData);
                invalidatePostData();
                setDirty(false);
                if (navigation.canGoBack()) {
                    navigation.goBack();
                } else {
                    navigation.navigate('ProviderDashboard', { screen: 'Posts', params: { refresh: true } });
                }
            } else {
                const formattedData = formatFormDataForApi(formData);
                await postService.create(resolvedPostType, formattedData);
                invalidatePostData();
                setDirty(false);
                navigateToProviderPostList(navigation);
            }
        } catch (error) {
            logger.error(isEdit ? 'Зар шинэчлэх алдаа:' : 'Зар үүсгэх алдаа:', error);

            if (error.response?.status === 400) {
                const base = t(isEdit ? 'posts.updateError' : 'posts.createError');
                const detail = error.response.data?.message;
                const msg = detail
                    ? base + '\n\n' + (Array.isArray(detail) ? detail.join('\n') : detail)
                    : base;
                showErrorModal(t('common.validationError'), msg);
            } else {
                showErrorModal(t('common.error'), t(isEdit ? 'provider.updating' : 'posts.createNew') + ' ' + t('common.error').toLowerCase());
            }
        } finally {
            setIsLoading(false);
        }
    }, [formData, validateForm, focusField, navigation, isEdit, postId, resolvedPostType]);

    if (!formData) {
        return (
            <CustomSafeAreaView backgroundColor={colors.background} statusBarColor={colors.surface} statusBarStyle={isDark ? 'light-content' : 'dark-content'}>
                <ScreenHeader
                    title={t(isEdit ? 'provider.postEdit' : 'provider.postCreate')}
                    onBack={handleBack}
                />
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                    <ActivityIndicator color={colors.primary} size="large" />
                    <Text style={{ marginTop: spacing.lg, fontSize: typography.md, fontWeight: '600', color: colors.text.primary }}>
                        {t('common.loading')}
                    </Text>
                </View>
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

                        {isEdit && (
                            <View style={styles.infoRow}>
                                <View style={[styles.infoIcon, styles.infoIconEdit]}>
                                    <Ionicons name="create-outline" size={20} color={colors.warning} />
                                </View>
                                <Text style={styles.infoText}>{t('provider.editingId', { id: postId })}</Text>
                            </View>
                        )}
                    </View>

                    <ImageUploadSection
                        images={formData.images}
                        onImagesChange={(images) => updateFormData('images', images)}
                        imagesLoading={imagesLoading}
                        setImagesLoading={setImagesLoading}
                        error={formErrors.images}
                        isEdit={isEdit}
                    />

                    <LocationSection
                        province={formData.province}
                        district={formData.district}
                        onProvinceChange={(value) => updateFormData('province', value)}
                        onDistrictChange={(value) => updateFormData('district', value)}
                        errors={{ province: formErrors.province, district: formErrors.district }}
                    />

                    <DynamicForm
                        fields={schema?.fields ?? []}
                        formData={formData}
                        updateFormData={updateFormData}
                        formErrors={formErrors}
                        inputRefs={inputRefs}
                    />

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
                        loadingText={t(isEdit ? 'provider.updating' : 'provider.creating')}
                        fullWidth
                    />
                </View>
            </KeyboardAvoidingView>
        </CustomSafeAreaView>
    );
};

const createStyles = (colors) => StyleSheet.create({
    scrollView: { flex: 1 },
    scrollContent: { padding: spacing.lg },
    tabletContainer: { maxWidth: 680, alignSelf: 'center', width: '100%' },
    headerInfo: {
        borderRadius: radius.card,
        padding: spacing.lg,
        marginBottom: spacing.xl,
    },
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
        borderRadius: radius.card,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: spacing.md,
    },
    infoIconCreate: { backgroundColor: colors.opacity.background.primary },
    infoIconEdit: { backgroundColor: colors.opacity.background.warning },
    infoText: {
        fontSize: typography.md,
        color: colors.text.primary,
        flex: 1,
        fontWeight: '500',
    },
});

export default ProviderPostForm;

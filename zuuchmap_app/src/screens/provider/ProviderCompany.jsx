import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    Image,
    ActivityIndicator,
    Platform,
    KeyboardAvoidingView,
    Keyboard,
    StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { pickCompanyLogo } from '../../utils/imageUtils';
import { spacing, typography, radius, safeAreaHelpers, interactions, isTablet } from '../../design/theme';
import { useAppTheme } from '../../hooks/useAppTheme';
import { useTranslation } from 'react-i18next';
import userService from '../../services/api/userService';
import { queryClient } from '../../services/queryClient';
import CustomSafeAreaView from '../../components/CustomSafeAreaView';
import ScreenHeader from '../../components/ScreenHeader';
import ScreenLoading from '../../components/ScreenLoading';
import ScreenError from '../../components/ScreenError';
import { TextInput, Button } from '../../components';
import { validateEmail, validatePhone, validateRequired } from '../../utils/formUtils';
import { logger } from '../../utils/logger';
import { showErrorModal, showWarningModal } from '../../utils/errorManager';

const EMPTY_FORM = {
    name: '',
    description: '',
    logo: null,
    website: '',
    address: '',
    phone_number: '',
    email: '',
    registration_number: '',
    tax_id: '',
};

// One description of the form; both the editable inputs and the read-only
// info rows are rendered from it.
const SECTIONS = [
    {
        titleKey: 'company.basicInfo',
        fields: [
            { key: 'name', labelKey: 'company.name', icon: 'business-outline', required: true },
            { key: 'description', labelKey: 'company.description', icon: 'document-text-outline', multiline: true, numberOfLines: 3 },
            { key: 'website', labelKey: 'common.website', icon: 'globe-outline', keyboardType: 'url', normalizeUrl: true },
        ],
    },
    {
        titleKey: 'company.contactInfo',
        fields: [
            { key: 'address', labelKey: 'common.address', icon: 'location-outline' },
            { key: 'phone_number', labelKey: 'common.phone', icon: 'call-outline', keyboardType: 'phone-pad' },
            { key: 'email', labelKey: 'common.email', icon: 'mail-outline', keyboardType: 'email-address' },
        ],
    },
    {
        titleKey: 'company.legalInfo',
        fields: [
            { key: 'registration_number', labelKey: 'company.regNumber', icon: 'card-outline' },
            { key: 'tax_id', labelKey: 'company.taxId', icon: 'receipt-outline' },
        ],
    },
];

// Flat, in-order field list used to chain keyboard focus across sections.
const FIELD_ORDER = SECTIONS.flatMap((s) => s.fields.map((f) => f.key));

const normalizeWebsiteUrl = (url) => {
    if (!url || url.trim() === '') return '';
    const trimmed = url.trim();
    return /^https?:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;
};

// Serves both routes: with a companyId it views/edits an existing company,
// without one it creates a new company.
const ProviderCompany = ({ route, navigation }) => {
    const { colors, isDark, styles: gStyles } = useAppTheme();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const { t } = useTranslation();
    const insets = useSafeAreaInsets();

    const companyId = route?.params?.companyId ?? null;
    const isCreate = !companyId;

    const [form, setForm] = useState(isCreate ? EMPTY_FORM : null);
    const [isEditing, setIsEditing] = useState(isCreate);
    const [isLoading, setIsLoading] = useState(!isCreate);
    const [isSaving, setIsSaving] = useState(false);
    const [logoLoading, setLogoLoading] = useState(false);
    const [logoChanged, setLogoChanged] = useState(false);
    const [formErrors, setFormErrors] = useState({});
    const [dirty, setDirty] = useState(false);
    const scrollViewRef = useRef(null);
    const inputRefs = useRef({});

    useEffect(() => {
        if (!isCreate) loadCompany();
    }, []);

    const loadCompany = async () => {
        setIsLoading(true);
        try {
            setForm(await userService.getCompany(companyId));
        } catch (error) {
            logger.error('Company loading error:', error);
            showErrorModal(t('common.error'), t('company.loadError'));
        } finally {
            setIsLoading(false);
        }
    };

    const updateField = (field, value) => {
        setForm(prev => ({ ...prev, [field]: value }));
        setDirty(true);
        if (formErrors[field]) {
            setFormErrors(prev => ({ ...prev, [field]: null }));
        }
    };

    const focusField = (fieldName) => {
        const input = inputRefs.current[fieldName];
        if (!input || !scrollViewRef.current) return;
        input.focus();
        input.measureLayout(
            scrollViewRef.current,
            (_, y) => scrollViewRef.current.scrollTo({ y: y - 100, animated: true }),
            () => logger.warn('Measurement failed')
        );
    };

    const scrollToField = (fieldName) => {
        if (!scrollViewRef.current || !inputRefs.current[fieldName]) return;
        setTimeout(() => {
            inputRefs.current[fieldName]?.measureLayout(
                scrollViewRef.current,
                (_, y) => scrollViewRef.current.scrollTo({ y: y - 120, animated: true }),
                () => {}
            );
        }, 100);
    };

    const pickLogo = async () => {
        setLogoLoading(true);
        try {
            const uri = await pickCompanyLogo();
            if (uri) {
                updateField('logo', uri);
                setLogoChanged(true);
            }
        } catch (error) {
            logger.error('Logo picker error:', error);
        } finally {
            setLogoLoading(false);
        }
    };

    const removeLogo = () => {
        updateField('logo', null);
        setLogoChanged(true);
    };

    const validateForm = () => {
        const errors = {};

        if (!validateRequired(form.name)) errors.name = t('company.nameRequired');
        if (form.email && !validateEmail(form.email)) errors.email = t('common.invalidEmail');
        if (form.phone_number && !validatePhone(form.phone_number)) errors.phone_number = t('common.invalidPhone');

        if (Object.keys(errors).length > 0) {
            setTimeout(() => focusField(Object.keys(errors)[0]), 100);
        }

        setFormErrors(errors);
        return Object.keys(errors).length === 0;
    };

    const handleSave = async () => {
        Keyboard.dismiss();

        if (!validateForm()) {
            showErrorModal(t('common.validationError'), t('company.formError'));
            return;
        }

        setIsSaving(true);

        try {
            const excludedFields = ['id', 'is_verified', 'date_created', 'date_updated', 'users', 'logo'];
            const submitData = {};

            Object.keys(form).forEach(key => {
                if (excludedFields.includes(key)) return;
                if (form[key] === null || form[key] === undefined) return;
                const value = form[key].toString().trim();
                if (value !== '') submitData[key] = value;
            });

            const logoIsNewFile = typeof form.logo === 'string' && form.logo.startsWith('file://');
            if (logoIsNewFile && (isCreate || logoChanged)) submitData.logo = form.logo;

            if (isCreate) {
                await userService.createCompany(submitData);
                queryClient.invalidateQueries({ queryKey: ['profile'] });
                setDirty(false);
                navigation.goBack();
                return;
            }

            await userService.updateCompany(form.id, submitData);
            queryClient.invalidateQueries({ queryKey: ['profile'] });
            setIsEditing(false);
            setLogoChanged(false);
            setDirty(false);
            await loadCompany();
        } catch (error) {
            logger.error('Company save error:', error);

            // Server validation messages are shown as-is; local/internal errors
            // (coded, often untranslated) fall back to the translated copy.
            let errorMessage = t('company.saveError');
            const message = error.response?.data?.message;
            if (message) {
                errorMessage = Array.isArray(message) ? message.join('\n') : message;
            }

            showErrorModal(t('common.error'), errorMessage);
        } finally {
            setIsSaving(false);
        }
    };

    const handleCancel = () => {
        setIsEditing(false);
        setLogoChanged(false);
        setDirty(false);
        loadCompany();
    };

    const handleBack = () => {
        if (!dirty) {
            navigation.goBack();
            return;
        }
        showWarningModal(t('common.unsavedChangesTitle'), t('common.unsavedChangesMessage'), [
            { text: t('common.cancel'), style: 'cancel' },
            { text: t('common.discard'), style: 'destructive', onPress: () => navigation.goBack() },
        ]);
    };

    const renderInfoField = (icon, label, value, isLast = false) => {
        if (!value) return null;
        return (
            <View key={label} style={[styles.infoItem, isLast && styles.infoItemLast]}>
                <View style={styles.infoIcon}>
                    <Ionicons name={icon} size={20} color={colors.iconAccent} />
                </View>
                <View style={styles.infoContent}>
                    <Text style={styles.infoLabel}>{label}</Text>
                    <Text style={styles.infoText}>{value}</Text>
                </View>
            </View>
        );
    };

    const renderField = (field, isLast) => {
        const nextKey = FIELD_ORDER[FIELD_ORDER.indexOf(field.key) + 1];
        return (
            <TextInput
                key={field.key}
                ref={(r) => { inputRefs.current[field.key] = r; }}
                label={t(field.labelKey)}
                value={form[field.key] || ''}
                onChangeText={(text) => updateField(field.key, text)}
                error={formErrors[field.key]}
                required={field.required}
                multiline={field.multiline}
                numberOfLines={field.numberOfLines}
                keyboardType={field.keyboardType}
                returnKeyType={field.multiline ? undefined : (nextKey ? 'next' : 'done')}
                onSubmitEditing={field.multiline || !nextKey ? undefined : () => focusField(nextKey)}
                blurOnSubmit={field.multiline ? undefined : !nextKey}
                onFocus={() => scrollToField(field.key)}
                onBlur={field.normalizeUrl ? () => {
                    if (form[field.key] && form[field.key].trim() !== '') {
                        updateField(field.key, normalizeWebsiteUrl(form[field.key]));
                    }
                } : undefined}
                containerStyle={isLast ? styles.lastField : undefined}
            />
        );
    };

    if (isLoading) {
        return (
            <CustomSafeAreaView backgroundColor={colors.background} statusBarColor={colors.surface} statusBarStyle={isDark ? 'light-content' : 'dark-content'}>
                <ScreenHeader title={t('company.title')} onBack={() => navigation.goBack()} />
                <ScreenLoading message={t('company.loading')} />
            </CustomSafeAreaView>
        );
    }

    if (!form) {
        return (
            <CustomSafeAreaView backgroundColor={colors.background} statusBarColor={colors.surface} statusBarStyle={isDark ? 'light-content' : 'dark-content'}>
                <ScreenHeader title={t('company.title')} onBack={() => navigation.goBack()} />
                <ScreenError
                    title={t('company.notFound')}
                    message={t('company.notFoundDesc')}
                    onRetry={loadCompany}
                />
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
                    title={isCreate ? t('company.createTitle') : t('company.title')}
                    onBack={isCreate ? handleBack : () => navigation.goBack()}
                    rightComponent={!isCreate && isEditing ? (
                        <TouchableOpacity
                            style={styles.cancelButton}
                            onPress={handleCancel}
                            activeOpacity={interactions.activeOpacity}
                        >
                            <Text style={styles.cancelButtonText}>{t('common.cancel')}</Text>
                        </TouchableOpacity>
                    ) : null}
                />

                <ScrollView
                    ref={scrollViewRef}
                    style={styles.scrollView}
                    contentContainerStyle={[
                        styles.scrollContent,
                        gStyles.scrollViewContentWithBottomInset(
                            safeAreaHelpers.getBottomSafeArea(insets)
                        )
                    ]}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                >
                    <View style={isTablet ? styles.tabletContainer : undefined}>

                    {form.is_verified && (
                        <View style={styles.verificationSection}>
                            <View style={styles.verificationBadge}>
                                <Ionicons name="checkmark-circle" size={20} color={colors.success} />
                                <Text style={styles.verificationText}>{t('company.verified')}</Text>
                            </View>
                        </View>
                    )}

                    <View style={styles.logoSection}>
                        <View style={styles.logoCard}>
                            {!isCreate && !isEditing && (
                                <TouchableOpacity
                                    style={[styles.inlineEditButton, { backgroundColor: colors.opacity.background.primary }]}
                                    onPress={() => setIsEditing(true)}
                                    activeOpacity={interactions.activeOpacityLight}
                                    hitSlop={interactions.hitSlop}
                                    accessibilityRole="button"
                                    accessibilityLabel={t('common.edit')}
                                >
                                    <Ionicons name="create-outline" size={16} color={colors.iconAccent} />
                                </TouchableOpacity>
                            )}
                            <View style={styles.logoUploadContainer}>
                                {isEditing ? (
                                    <TouchableOpacity
                                        style={styles.logoPickerButton}
                                        onPress={pickLogo}
                                        disabled={logoLoading}
                                        activeOpacity={interactions.activeOpacityLight}
                                    >
                                        {logoLoading ? (
                                            <ActivityIndicator size="large" color={colors.iconAccent} />
                                        ) : form.logo ? (
                                            <View style={styles.logoContainer}>
                                                <Image source={{ uri: form.logo }} style={styles.logoImage} resizeMode="cover" />
                                                <TouchableOpacity
                                                    style={styles.removeLogoButton}
                                                    onPress={removeLogo}
                                                    activeOpacity={interactions.activeOpacityLight}
                                                    hitSlop={interactions.hitSlop}
                                                    accessibilityRole="button"
                                                    accessibilityLabel={t('upload.removeImage')}
                                                >
                                                    <Ionicons name="close-circle" size={24} color={colors.iconAccent} />
                                                </TouchableOpacity>
                                            </View>
                                        ) : (
                                            <View style={styles.logoPlaceholder}>
                                                <Ionicons name="business-outline" size={40} color={colors.iconAccent} />
                                            </View>
                                        )}
                                    </TouchableOpacity>
                                ) : (
                                    form.logo ? (
                                        <View style={styles.logoDisplayContainer}>
                                            <Image source={{ uri: form.logo }} style={styles.logoDisplay} resizeMode="cover" />
                                        </View>
                                    ) : (
                                        <View style={styles.logoPlaceholder}>
                                            <Ionicons name="business-outline" size={40} color={colors.iconAccent} />
                                        </View>
                                    )
                                )}
                            </View>
                            <View style={styles.logoInfo}>
                                <Text style={styles.logoTitle}>{t('company.logo')}</Text>
                                <Text style={styles.logoSubtitle}>
                                    {isEditing
                                        ? t('company.logoHint')
                                        : form.logo
                                            ? t('company.logoOfficial')
                                            : t('company.logoEmpty')
                                    }
                                </Text>
                                {isEditing && (
                                    <TouchableOpacity
                                        style={styles.changeLogoButton}
                                        onPress={pickLogo}
                                        disabled={logoLoading}
                                        activeOpacity={interactions.activeOpacityLight}
                                    >
                                        <Ionicons name="camera-outline" size={16} color={colors.iconAccent} />
                                        <Text style={styles.changeLogoText}>
                                            {form.logo ? t('company.logoChange') : t('company.logoAdd')}
                                        </Text>
                                    </TouchableOpacity>
                                )}
                            </View>
                        </View>
                    </View>

                    {SECTIONS.map((section) => {
                        // Read-only mode drops empty values, so a section with
                        // nothing filled in would render as a blank card.
                        const filled = section.fields.filter((f) => form[f.key]);
                        if (!isEditing && filled.length === 0) return null;
                        return (
                            <View key={section.titleKey} style={styles.formSection}>
                                <View style={gStyles.sectionHeader}>
                                    <Text style={[gStyles.sectionSubtitle, { color: colors.text.secondary }]}>
                                        {t(section.titleKey)}
                                    </Text>
                                </View>
                                {isEditing ? (
                                    <View style={styles.formCard}>
                                        {section.fields.map((field, i) => renderField(field, i === section.fields.length - 1))}
                                    </View>
                                ) : (
                                    <View style={styles.infoCard}>
                                        {filled.map((field, i) =>
                                            renderInfoField(field.icon, t(field.labelKey), form[field.key], i === filled.length - 1)
                                        )}
                                    </View>
                                )}
                            </View>
                        );
                    })}

                    <View style={styles.bottomSpacing} />
                    </View>
                </ScrollView>

                {isEditing && (
                    <View style={[
                        gStyles.bottomContainerWithInset(safeAreaHelpers.getBottomSafeArea(insets)),
                        styles.saveButtonContainer,
                        { backgroundColor: colors.surface },
                    ]}>
                        <Button
                            title={isCreate ? t('company.createTitle') : t('common.save')}
                            onPress={handleSave}
                            disabled={isSaving || logoLoading}
                            loading={isSaving}
                            loadingText={t('common.saving')}
                            icon={isCreate ? 'add-circle-outline' : 'checkmark-circle-outline'}
                            fullWidth
                        />
                    </View>
                )}
            </KeyboardAvoidingView>
        </CustomSafeAreaView>
    );
};

const createStyles = (colors) => StyleSheet.create({
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        padding: spacing.lg,
    },
    tabletContainer: { maxWidth: 680, alignSelf: 'center', width: '100%' },
    verificationSection: {
        marginBottom: spacing.lg,
    },
    verificationBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.opacity.background.success,
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.lg,
        borderRadius: radius.card,
        alignSelf: 'flex-start',
        borderWidth: 1,
        borderColor: colors.opacity.border.success,
    },
    verificationText: {
        marginLeft: spacing.sm,
        ...typography.styles.labelStrong,
        color: colors.success,
    },
    logoSection: {
        marginBottom: spacing.xl,
    },
    logoCard: {
        ...colors.elevation.md,
        backgroundColor: colors.surface,
        borderRadius: radius.xxl,
        padding: spacing.xl,
        flexDirection: 'row',
        alignItems: 'center',
        position: 'relative',
    },
    inlineEditButton: {
        position: 'absolute',
        top: spacing.sm,
        right: spacing.sm,
        width: 36,
        height: 36,
        borderRadius: radius.full,
        justifyContent: 'center',
        alignItems: 'center',
    },
    logoUploadContainer: {
        marginRight: spacing.lg,
    },
    logoPickerButton: {
        width: 80,
        height: 80,
        borderRadius: radius.lg,
        backgroundColor: colors.background,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 2,
        borderColor: colors.border.light,
    },
    logoPlaceholder: {
        width: 80,
        height: 80,
        borderRadius: radius.lg,
        backgroundColor: colors.background,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 2,
        borderColor: colors.border.light,
        borderStyle: 'dashed',
    },
    logoContainer: {
        position: 'relative',
        alignItems: 'center',
    },
    logoImage: {
        width: 76,
        height: 76,
        borderRadius: radius.lg,
        backgroundColor: colors.border.light,
    },
    logoDisplayContainer: {
        alignItems: 'center',
    },
    logoDisplay: {
        width: 80,
        height: 80,
        borderRadius: radius.lg,
        backgroundColor: colors.border.light,
    },
    removeLogoButton: {
        ...colors.elevation.sm,
        position: 'absolute',
        top: -8,
        right: -8,
        backgroundColor: colors.surface,
        borderRadius: radius.lg,
    },
    logoInfo: {
        flex: 1,
    },
    logoTitle: {
        ...typography.styles.bodyBold,
        color: colors.text.primary,
        marginBottom: spacing.xs,
    },
    logoSubtitle: {
        ...typography.styles.caption,
        color: colors.text.secondary,
        marginBottom: spacing.md,
    },
    changeLogoButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 44,
        backgroundColor: colors.opacity.background.primary,
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.sm,
        borderRadius: radius.xxl,
        alignSelf: 'flex-start',
    },
    changeLogoText: { ...typography.styles.labelStrong, color: colors.text.link,
        marginLeft: spacing.xs, },
    formSection: {
        marginBottom: spacing.xl,
    },
    formCard: {
        ...colors.elevation.md,
        backgroundColor: colors.surface,
        borderRadius: radius.xxl,
        padding: spacing.xl,
    },
    infoCard: {
        ...colors.elevation.md,
        backgroundColor: colors.surface,
        borderRadius: radius.xxl,
        padding: spacing.lg,
    },
    infoItem: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        paddingVertical: spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: colors.border.light,
        marginBottom: spacing.sm,
    },
    infoItemLast: {
        borderBottomWidth: 0,
        marginBottom: 0,
        paddingBottom: 0,
    },
    infoIcon: {
        width: 36,
        height: 36,
        borderRadius: radius.lg,
        backgroundColor: colors.opacity.background.primary,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: spacing.md,
    },
    infoContent: {
        flex: 1,
    },
    infoLabel: {
        ...typography.styles.micro,
        color: colors.text.secondary,
        marginBottom: spacing.xs,
    },
    infoText: {
        ...typography.styles.body,
        color: colors.text.primary,
    },
    lastField: {
        marginBottom: 0,
    },
    cancelButton: {
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.md,
        backgroundColor: colors.background,
        borderRadius: radius.md,
    },
    cancelButtonText: {
        color: colors.text.primary,
        ...typography.styles.label,
    },
    bottomSpacing: {
        height: spacing.xl,
    },
    saveButtonContainer: {
        // A bar pinned to the bottom needs an upward separator; elevation casts
        // its shadow downward, off-screen. Hairline only — one idiom, not both.
        backgroundColor: colors.surface,
        borderTopWidth: 1,
        borderTopColor: colors.border.light,
        padding: spacing.lg,
    },
});

export default ProviderCompany;

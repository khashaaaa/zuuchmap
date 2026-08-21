import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    ScrollView,
    Image,
    KeyboardAvoidingView,
    Platform,
    ActionSheetIOS,
    StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { pickProfileImage, takeProfilePhoto, pickCompanyLogo } from '../../utils/imageUtils';
import { spacing, typography, radius, safeAreaHelpers, interactions, isTablet } from '../../design/theme';
import { useAppTheme } from '../../hooks/useAppTheme';
import { useTranslation } from 'react-i18next';
import userService from '../../services/api/userService';
import CustomSafeAreaView from '../../components/CustomSafeAreaView';
import ScreenHeader from '../../components/ScreenHeader';
import { ScreenLayout, TextInput } from '../../components';
import Button from '../../components/Button';
import { DEFAULT_AVATAR_URL } from '../../config/app.config';
import { validateEmail, validatePhone, validateRequired } from '../../utils/formUtils';
import { showErrorModal, showInfoModal, showWarningModal } from '../../utils/errorManager';
import { logger } from '../../utils/logger';
import { queryClient } from '../../services/queryClient';

const PROFILE_FIELDS = [
    { key: 'parent_name', labelKey: 'profile.parentName', required: true },
    { key: 'given_name', labelKey: 'profile.givenName', required: true },
    { key: 'email', labelKey: 'profile.emailAddress', keyboardType: 'email-address' },
    { key: 'address', labelKey: 'common.address', multiline: true, numberOfLines: 3 },
];

// Company fields are only rendered when the profile owns a company; the
// `api` key maps the form field onto the company payload.
const COMPANY_FIELDS = [
    { key: 'companyName', api: 'name', labelKey: 'company.name', required: true },
    { key: 'companyDescription', api: 'description', labelKey: 'company.description', multiline: true, numberOfLines: 3 },
    { key: 'companyWebsite', api: 'website', labelKey: 'company.website', keyboardType: 'url' },
    { key: 'companyAddress', api: 'address', labelKey: 'company.address', multiline: true, numberOfLines: 3 },
    { key: 'companyPhoneNumber', api: 'phone_number', labelKey: 'company.phone', keyboardType: 'phone-pad' },
    { key: 'companyEmail', api: 'email', labelKey: 'company.email', keyboardType: 'email-address' },
    { key: 'companyRegistrationNumber', api: 'registration_number', labelKey: 'company.regNumber' },
    { key: 'companyTaxId', api: 'tax_id', labelKey: 'company.taxId' },
];

const formFromProfile = (p) => ({
    parent_name: p?.parent_name || '',
    given_name: p?.given_name || '',
    email: p?.email || '',
    address: p?.address || '',
    companyName: p?.companyName || '',
    companyDescription: p?.companyDescription || '',
    companyWebsite: p?.companyWebsite || '',
    companyAddress: p?.companyAddress || '',
    companyPhoneNumber: p?.companyPhoneNumber || '',
    companyEmail: p?.companyEmail || '',
    companyRegistrationNumber: p?.companyRegistrationNumber || '',
    companyTaxId: p?.companyTaxId || '',
});

// Shared by the customer and provider edit-profile routes. The company
// section appears only for profiles that have a company attached.
const EditProfileScreen = ({ route, navigation }) => {
    const { colors, isDark, styles: gStyles } = useAppTheme();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const { t } = useTranslation();
    const insets = useSafeAreaInsets();

    const passedProfile = route?.params?.profile;
    const [profile, setProfile] = useState(passedProfile || null);
    const [formData, setFormData] = useState(formFromProfile(passedProfile));
    const [loading, setLoading] = useState(!passedProfile);
    const [saving, setSaving] = useState(false);
    const [profileImage, setProfileImage] = useState(passedProfile?.profilePicture || null);
    const [companyLogo, setCompanyLogo] = useState(passedProfile?.companyLogo || null);
    const [newProfileImageSelected, setNewProfileImageSelected] = useState(false);
    const [newCompanyLogoSelected, setNewCompanyLogoSelected] = useState(false);
    const [formErrors, setFormErrors] = useState({});
    const [dirty, setDirty] = useState(false);
    const inputRefs = useRef({});

    const companyId = profile?.companyId;

    // Single-line fields in render order, for keyboard "next" chaining.
    const chainKeys = useMemo(() => [
        ...PROFILE_FIELDS,
        ...(companyId ? COMPANY_FIELDS : []),
    ].filter((f) => !f.multiline).map((f) => f.key), [companyId]);

    useEffect(() => {
        if (!passedProfile) loadUserProfile();
    }, []);

    const loadUserProfile = async () => {
        try {
            setLoading(true);
            const loaded = await userService.getUserProfile();
            setProfile(loaded);
            setFormData(formFromProfile(loaded));
            setProfileImage(loaded.profilePicture || null);
            setCompanyLogo(loaded.companyLogo || null);
        } catch (error) {
            logger.error('Profile loading error:', error);
            showErrorModal(t('common.error'), t('profile.loadError'));
        } finally {
            setLoading(false);
        }
    };

    const updateField = (field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }));
        setDirty(true);
        if (formErrors[field]) {
            setFormErrors(prev => ({ ...prev, [field]: null }));
        }
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

    // One picker flow for both images: `apply` receives the chosen uri.
    const showImagePicker = (title, pickFromGallery, apply) => {
        const fromGallery = async () => {
            const uri = await pickFromGallery();
            if (uri) { apply(uri); setDirty(true); }
        };
        const fromCamera = async () => {
            const uri = await takeProfilePhoto();
            if (uri) { apply(uri); setDirty(true); }
        };

        if (Platform.OS === 'ios' && ActionSheetIOS) {
            ActionSheetIOS.showActionSheetWithOptions(
                {
                    options: [t('upload.gallery'), t('upload.camera'), t('common.cancel')],
                    cancelButtonIndex: 2,
                    title,
                },
                (buttonIndex) => {
                    if (buttonIndex === 0) fromGallery();
                    else if (buttonIndex === 1) fromCamera();
                }
            );
        } else {
            showInfoModal(title, t('upload.addQuestion'), [
                { text: t('common.cancel') },
                { text: t('upload.gallery'), onPress: fromGallery },
                { text: t('upload.camera'), onPress: fromCamera },
            ]);
        }
    };

    const selectProfileImage = () => showImagePicker(
        t('profile.changePicture'),
        pickProfileImage,
        (uri) => { setProfileImage(uri); setNewProfileImageSelected(true); }
    );

    const selectCompanyLogo = () => showImagePicker(
        t('company.logoChange'),
        pickCompanyLogo,
        (uri) => { setCompanyLogo(uri); setNewCompanyLogoSelected(true); }
    );

    const validateForm = () => {
        const errors = {};

        if (!validateRequired(formData.parent_name)) errors.parent_name = t('profile.parentNameRequired');
        if (!validateRequired(formData.given_name)) errors.given_name = t('profile.givenNameRequired');
        if (formData.email && !validateEmail(formData.email)) errors.email = t('common.invalidEmail');

        if (companyId) {
            if (!validateRequired(formData.companyName)) errors.companyName = t('company.nameRequired');
            if (formData.companyEmail && !validateEmail(formData.companyEmail)) errors.companyEmail = t('common.invalidEmail');
            if (formData.companyPhoneNumber && !validatePhone(formData.companyPhoneNumber)) errors.companyPhoneNumber = t('common.invalidPhone');
        }

        setFormErrors(errors);
        return Object.keys(errors).length === 0;
    };

    const handleSave = async () => {
        if (!validateForm()) {
            showErrorModal(t('common.validationError'), t('common.formError'));
            return;
        }

        setSaving(true);
        try {
            const profilePayload = {
                parent_name: formData.parent_name,
                given_name: formData.given_name,
                email: formData.email,
                address: formData.address,
            };

            await userService.updateProfile(profilePayload, newProfileImageSelected ? profileImage : null);

            if (companyId) {
                try {
                    const companyPayload = COMPANY_FIELDS.reduce((acc, f) => {
                        acc[f.api] = formData[f.key];
                        return acc;
                    }, {});
                    if (newCompanyLogoSelected) companyPayload.logo = companyLogo;

                    await userService.updateCompany(companyId, companyPayload);
                } catch (companyError) {
                    logger.error('Company update error:', companyError);
                    showWarningModal(t('common.warning'), t('profile.companyUpdateFailed'));
                }
            }

            queryClient.invalidateQueries({ queryKey: ['profile'] });
            setDirty(false);
            navigation.goBack();
        } catch (error) {
            logger.error('Profile update error:', error);
            showErrorModal(t('common.error'), t('profile.updateError'));
        } finally {
            setSaving(false);
        }
    };

    const renderField = (field, isLast) => {
        const nextKey = field.multiline ? undefined : chainKeys[chainKeys.indexOf(field.key) + 1];
        return (
            <TextInput
                key={field.key}
                ref={(r) => { inputRefs.current[field.key] = r; }}
                label={t(field.labelKey)}
                value={formData[field.key]}
                onChangeText={(text) => updateField(field.key, text)}
                error={formErrors[field.key]}
                required={field.required}
                multiline={field.multiline}
                numberOfLines={field.numberOfLines}
                keyboardType={field.keyboardType}
                returnKeyType={field.multiline ? undefined : (nextKey ? 'next' : 'done')}
                onSubmitEditing={field.multiline || !nextKey ? undefined : () => inputRefs.current[nextKey]?.focus?.()}
                blurOnSubmit={field.multiline ? undefined : !nextKey}
                containerStyle={isLast ? styles.lastField : undefined}
            />
        );
    };

    if (loading) {
        return (
            <ScreenLayout
                title={t('profile.editTitle')}
                showBack
                onBack={handleBack}
                loading
                loadingMessage={t('common.loading')}
            />
        );
    }

    return (
        <CustomSafeAreaView backgroundColor={colors.background} statusBarColor={colors.surface} statusBarStyle={isDark ? 'light-content' : 'dark-content'}>
            <ScreenHeader title={t('profile.editTitle')} onBack={handleBack} />

            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={gStyles.keyboardAvoidingView}
            >
                <ScrollView
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

                    <View style={styles.profilePictureSection}>
                        <View style={styles.profilePictureCard}>
                            <View style={styles.imageContainer}>
                                <Image
                                    source={{ uri: profileImage || DEFAULT_AVATAR_URL }}
                                    style={styles.profileImage}
                                />
                            </View>
                            <View style={styles.profilePictureInfo}>
                                <Text style={styles.profilePictureTitle}>{t('profile.picture')}</Text>
                                <Text style={styles.profilePictureSubtitle}>
                                    {t('upload.profileHint')}
                                </Text>
                                <TouchableOpacity
                                    style={styles.changePhotoButton}
                                    onPress={selectProfileImage}
                                    activeOpacity={interactions.activeOpacityLight}
                                >
                                    <Ionicons name="camera-outline" size={16} color={colors.primary} />
                                    <Text style={styles.changePhotoText}>{t('profile.changePicture')}</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>

                    <View style={styles.formSection}>
                        <View style={styles.formCard}>
                            {PROFILE_FIELDS.map((f, i) => renderField(f, i === PROFILE_FIELDS.length - 1))}
                        </View>
                    </View>

                    {companyId && (
                        <>
                            <View style={styles.profilePictureSection}>
                                <View style={styles.profilePictureCard}>
                                    <View style={styles.imageContainer}>
                                        <Image
                                            source={{ uri: companyLogo || DEFAULT_AVATAR_URL }}
                                            style={styles.companyLogo}
                                        />
                                        <TouchableOpacity
                                            style={styles.imageOverlay}
                                            onPress={selectCompanyLogo}
                                            activeOpacity={interactions.activeOpacityLight}
                                        >
                                            <Ionicons name="camera-outline" size={20} color={colors.primary} />
                                        </TouchableOpacity>
                                    </View>
                                    <View style={styles.profilePictureInfo}>
                                        <Text style={styles.profilePictureTitle}>{t('company.logo')}</Text>
                                        <Text style={styles.profilePictureSubtitle}>
                                            {t('company.logoHint')}
                                        </Text>
                                        <TouchableOpacity
                                            style={styles.changePhotoButton}
                                            onPress={selectCompanyLogo}
                                            activeOpacity={interactions.activeOpacityLight}
                                        >
                                            <Ionicons name="business-outline" size={16} color={colors.primary} />
                                            <Text style={styles.changePhotoText}>{t('company.logoChange')}</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            </View>

                            <View style={styles.formSection}>
                                <View style={styles.formCard}>
                                    {COMPANY_FIELDS.map((f, i) => renderField(f, i === COMPANY_FIELDS.length - 1))}
                                </View>
                            </View>
                        </>
                    )}
                    </View>
                </ScrollView>

                <View style={[
                    styles.buttonContainer,
                    gStyles.bottomContainerWithInset(safeAreaHelpers.getBottomSafeArea(insets)),
                    { backgroundColor: colors.surface },
                ]}>
                    <Button
                        title={t('common.save')}
                        onPress={handleSave}
                        loading={saving}
                        loadingText={t('common.saving')}
                        fullWidth
                    />
                </View>
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
    profilePictureSection: {
        marginBottom: spacing.xl,
    },
    profilePictureCard: {
        ...colors.elevation.md,
        backgroundColor: colors.surface,
        borderRadius: radius.xxl,
        padding: spacing.xl,
        flexDirection: 'row',
        alignItems: 'center',
    },
    imageContainer: {
        position: 'relative',
        marginRight: spacing.lg,
    },
    profileImage: {
        width: 80,
        height: 80,
        borderRadius: radius.pill,
        backgroundColor: colors.border.light,
        borderWidth: 3,
        borderColor: colors.surface,
    },
    companyLogo: {
        width: 80,
        height: 80,
        borderRadius: radius.lg,
        backgroundColor: colors.border.light,
        borderWidth: 3,
        borderColor: colors.surface,
    },
    imageOverlay: {
        ...colors.elevation.md,
        position: 'absolute',
        bottom: -4,
        right: -4,
        width: 24,
        height: 24,
        borderRadius: radius.card,
        backgroundColor: colors.primary,
        justifyContent: 'center',
        alignItems: 'center',
        borderColor: colors.surface,
    },
    profilePictureInfo: {
        flex: 1,
    },
    profilePictureTitle: {
        ...typography.styles.bodyBold,
        color: colors.text.primary,
        marginBottom: spacing.xs,
    },
    profilePictureSubtitle: {
        ...typography.styles.caption,
        color: colors.text.secondary,
        marginBottom: spacing.md,
    },
    changePhotoButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.opacity.background.primary,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        borderRadius: radius.xxl,
        alignSelf: 'flex-start',
    },
    changePhotoText: { ...typography.styles.labelStrong, color: colors.primary,
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
    lastField: {
        marginBottom: 0,
    },
    buttonContainer: {
        ...colors.elevation.md,
        backgroundColor: colors.surface,
        borderTopWidth: 1,
        borderTopColor: colors.border.light,
        padding: spacing.lg,
    },
});

export default EditProfileScreen;

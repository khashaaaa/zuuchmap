import React, { useState, useMemo } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    Image,
    ScrollView,
    KeyboardAvoidingView,
    Platform,
    ActionSheetIOS,
    StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { pickProfileImage, takeProfilePhoto, pickCompanyLogo } from '../../utils/imageUtils';
import { spacing, typography, shadows, radius, safeAreaHelpers, interactions, isTablet } from '../../design/theme';
import { useAppTheme } from '../../hooks/useAppTheme';
import { useTranslation } from 'react-i18next';
import userService from '../../services/api/userService';
import CustomSafeAreaView from '../../components/CustomSafeAreaView';
import ScreenHeader from '../../components/ScreenHeader';
import Button from '../../components/Button';
import { TextInput } from '../../components';
import { DEFAULT_AVATAR_URL } from '../../config/app.config';
import { validateEmail, validatePhone, validateRequired } from '../../utils/formUtils';
import { logger } from '../../utils/logger';
import { showErrorModal, showWarningModal, showInfoModal } from '../../utils/errorManager';

const ProviderEditProfile = ({ route, navigation }) => {
    const { colors, isDark, styles: gStyles } = useAppTheme();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const { t } = useTranslation();
    const insets = useSafeAreaInsets();
    const { profile } = route.params || {};
    const [isLoading, setIsLoading] = useState(false);
    const [formData, setFormData] = useState({
        parent_name: profile?.parent_name || '',
        given_name: profile?.given_name || '',
        email: profile?.email || '',
        address: profile?.address || '',
        ...(profile?.companyId ? {
            companyName: profile?.companyName || '',
            companyDescription: profile?.companyDescription || '',
            companyWebsite: profile?.companyWebsite || '',
            companyAddress: profile?.companyAddress || '',
            companyPhoneNumber: profile?.companyPhoneNumber || '',
            companyEmail: profile?.companyEmail || '',
            companyRegistrationNumber: profile?.companyRegistrationNumber || '',
            companyTaxId: profile?.companyTaxId || ''
        } : {})
    });
    const [profileImage, setProfileImage] = useState(profile?.profilePicture || null);
    const [companyLogo, setCompanyLogo] = useState(profile?.companyLogo || null);
    const [newProfileImageSelected, setNewProfileImageSelected] = useState(false);
    const [newCompanyLogoSelected, setNewCompanyLogoSelected] = useState(false);
    const [formErrors, setFormErrors] = useState({});
    const [dirty, setDirty] = useState(false);

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

    const showProfileImagePickerOptions = () => {
        if (Platform.OS === 'ios' && ActionSheetIOS) {
            ActionSheetIOS.showActionSheetWithOptions(
                {
                    options: [t('upload.gallery'), t('upload.camera'), t('common.cancel')],
                    cancelButtonIndex: 2,
                    title: t('profile.changePicture'),
                },
                (buttonIndex) => {
                    if (buttonIndex === 0) {
                        pickProfileImageFromGallery();
                    } else if (buttonIndex === 1) {
                        pickProfileImageFromCamera();
                    }
                }
            );
        } else {
            showInfoModal(
                t('profile.changePicture'),
                t('upload.addQuestion'),
                [
                    { text: t('common.cancel') },
                    { text: t('upload.gallery'), onPress: pickProfileImageFromGallery },
                    { text: t('upload.camera'), onPress: pickProfileImageFromCamera },
                ]
            );
        }
    };

    const pickProfileImageFromGallery = async () => {
        const uri = await pickProfileImage();
        if (uri) {
            setProfileImage(uri);
            setNewProfileImageSelected(true);
            setDirty(true);
        }
    };

    const pickProfileImageFromCamera = async () => {
        const uri = await takeProfilePhoto();
        if (uri) {
            setProfileImage(uri);
            setNewProfileImageSelected(true);
            setDirty(true);
        }
    };

    const showCompanyLogoPickerOptions = () => {
        if (Platform.OS === 'ios' && ActionSheetIOS) {
            ActionSheetIOS.showActionSheetWithOptions(
                {
                    options: [t('upload.gallery'), t('upload.camera'), t('common.cancel')],
                    cancelButtonIndex: 2,
                    title: t('company.logoChange'),
                },
                (buttonIndex) => {
                    if (buttonIndex === 0) {
                        pickCompanyLogoFromGallery();
                    } else if (buttonIndex === 1) {
                        pickCompanyLogoFromCamera();
                    }
                }
            );
        } else {
            showInfoModal(
                t('company.logoChange'),
                t('upload.addQuestion'),
                [
                    { text: t('common.cancel') },
                    { text: t('upload.gallery'), onPress: pickCompanyLogoFromGallery },
                    { text: t('upload.camera'), onPress: pickCompanyLogoFromCamera },
                ]
            );
        }
    };

    const pickCompanyLogoFromGallery = async () => {
        const uri = await pickCompanyLogo();
        if (uri) {
            setCompanyLogo(uri);
            setNewCompanyLogoSelected(true);
            setDirty(true);
        }
    };

    const pickCompanyLogoFromCamera = async () => {
        const uri = await takeProfilePhoto();
        if (uri) {
            setCompanyLogo(uri);
            setNewCompanyLogoSelected(true);
            setDirty(true);
        }
    };

    const validateForm = () => {
        const errors = {};

        if (!validateRequired(formData.parent_name)) {
            errors.parent_name = t('profile.parentNameRequired');
        }
        if (!validateRequired(formData.given_name)) {
            errors.given_name = t('profile.givenNameRequired');
        }
        if (formData.email && !validateEmail(formData.email)) {
            errors.email = t('common.invalidEmail');
        }
        if (profile?.companyId) {
            if (!validateRequired(formData.companyName)) {
                errors.companyName = t('company.nameRequired');
            }
            if (formData.companyEmail && !validateEmail(formData.companyEmail)) {
                errors.companyEmail = t('common.invalidEmail');
            }
            if (formData.companyPhoneNumber && !validatePhone(formData.companyPhoneNumber)) {
                errors.companyPhoneNumber = t('common.invalidPhone');
            }
        }

        setFormErrors(errors);
        return Object.keys(errors).length === 0;
    };

    const handleSave = async () => {
        if (!validateForm()) {
            showErrorModal(t('common.validationError'), t('common.formError'));
            return;
        }

        setIsLoading(true);
        try {
            const apiFormData = {
                parent_name: formData.parent_name,
                given_name: formData.given_name,
                email: formData.email,
                address: formData.address
            };

            const profileImageToUpload = newProfileImageSelected ? profileImage : null;
            await userService.updateProfile(apiFormData, profileImageToUpload);

            if (profile?.companyId) {
                try {
                    const companyData = {
                        name: formData.companyName,
                        description: formData.companyDescription,
                        website: formData.companyWebsite,
                        address: formData.companyAddress,
                        phone_number: formData.companyPhoneNumber,
                        email: formData.companyEmail,
                        registration_number: formData.companyRegistrationNumber,
                        tax_id: formData.companyTaxId
                    };

                    if (newCompanyLogoSelected) {
                        companyData.logo = companyLogo;
                    }

                    await userService.updateCompany(profile.companyId, companyData);
                } catch (companyError) {
                    logger.error('Company update error:', companyError);
                    showWarningModal(t('common.warning'), t('profile.companyUpdateFailed'));
                }
            }

            setDirty(false);
            navigation.goBack();
        } catch (error) {
            logger.error('Profile update error:', error);
            showErrorModal(t('common.error'), t('profile.updateError'));
        } finally {
            setIsLoading(false);
        }
    };

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
                                    onPress={showProfileImagePickerOptions}
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
                            <TextInput
                                label={t('profile.parentName')}
                                value={formData.parent_name}
                                onChangeText={(text) => updateField('parent_name', text)}
                                error={formErrors.parent_name}
                                required
                            />
                            <TextInput
                                label={t('profile.givenName')}
                                value={formData.given_name}
                                onChangeText={(text) => updateField('given_name', text)}
                                error={formErrors.given_name}
                                required
                            />
                            <TextInput
                                label={`${t('profile.emailAddress')}`}
                                value={formData.email}
                                onChangeText={(text) => updateField('email', text)}
                                error={formErrors.email}
                                keyboardType="email-address"
                            />
                            <TextInput
                                label={`${t('common.address')}`}
                                value={formData.address}
                                onChangeText={(text) => updateField('address', text)}
                                error={formErrors.address}
                                multiline
                                numberOfLines={3}
                                containerStyle={styles.lastField}
                            />
                        </View>
                    </View>

                    {profile?.companyId && (
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
                                            onPress={showCompanyLogoPickerOptions}
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
                                            onPress={showCompanyLogoPickerOptions}
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
                                    <TextInput
                                        label={t('company.name')}
                                        value={formData.companyName}
                                        onChangeText={(text) => updateField('companyName', text)}
                                        error={formErrors.companyName}
                                        required
                                    />
                                    <TextInput
                                        label={`${t('company.description')}`}
                                        value={formData.companyDescription}
                                        onChangeText={(text) => updateField('companyDescription', text)}
                                        error={formErrors.companyDescription}
                                        multiline
                                        numberOfLines={3}
                                    />
                                    <TextInput
                                        label={`${t('company.website')}`}
                                        value={formData.companyWebsite}
                                        onChangeText={(text) => updateField('companyWebsite', text)}
                                        error={formErrors.companyWebsite}
                                        keyboardType="url"
                                    />
                                    <TextInput
                                        label={`${t('company.address')}`}
                                        value={formData.companyAddress}
                                        onChangeText={(text) => updateField('companyAddress', text)}
                                        error={formErrors.companyAddress}
                                        multiline
                                        numberOfLines={3}
                                    />
                                    <TextInput
                                        label={`${t('company.phone')}`}
                                        value={formData.companyPhoneNumber}
                                        onChangeText={(text) => updateField('companyPhoneNumber', text)}
                                        error={formErrors.companyPhoneNumber}
                                        keyboardType="phone-pad"
                                    />
                                    <TextInput
                                        label={`${t('company.email')}`}
                                        value={formData.companyEmail}
                                        onChangeText={(text) => updateField('companyEmail', text)}
                                        error={formErrors.companyEmail}
                                        keyboardType="email-address"
                                    />
                                    <TextInput
                                        label={`${t('company.regNumber')}`}
                                        value={formData.companyRegistrationNumber}
                                        onChangeText={(text) => updateField('companyRegistrationNumber', text)}
                                        error={formErrors.companyRegistrationNumber}
                                    />
                                    <TextInput
                                        label={`${t('company.taxId')}`}
                                        value={formData.companyTaxId}
                                        onChangeText={(text) => updateField('companyTaxId', text)}
                                        error={formErrors.companyTaxId}
                                        containerStyle={styles.lastField}
                                    />
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
                        loading={isLoading}
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
        backgroundColor: colors.surface,
        borderRadius: radius.xxl,
        padding: spacing.xl,
        flexDirection: 'row',
        alignItems: 'center',
        ...shadows.medium,
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
        ...shadows.medium,
    },
    profilePictureInfo: {
        flex: 1,
    },
    profilePictureTitle: {
        fontSize: typography.md,
        fontWeight: 'bold',
        color: colors.text.inverse,
        marginBottom: spacing.xs,
    },
    profilePictureSubtitle: {
        fontSize: typography.sm,
        color: colors.text.secondary,
        marginBottom: spacing.md,
        lineHeight: 18,
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
    changePhotoText: {
        color: colors.primary,
        fontWeight: '600',
        fontSize: typography.sm,
        marginLeft: spacing.xs,
    },
    formSection: {
        marginBottom: spacing.xl,
    },
    formCard: {
        backgroundColor: colors.surface,
        borderRadius: radius.xxl,
        padding: spacing.xl,
        ...shadows.medium,
    },
    lastField: {
        marginBottom: 0,
    },
    buttonContainer: {
        backgroundColor: colors.surface,
        borderTopWidth: 1,
        borderTopColor: colors.border.light,
        padding: spacing.lg,
        ...shadows.medium,
    },
});

export default ProviderEditProfile;

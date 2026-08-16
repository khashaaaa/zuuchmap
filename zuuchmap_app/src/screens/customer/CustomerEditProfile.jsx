import React, { useState, useEffect, useMemo } from 'react';
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
import { pickProfileImage, takeProfilePhoto } from '../../utils/imageUtils';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { spacing, typography, shadows, radius, safeAreaHelpers, interactions } from '../../design/theme';
import { useAppTheme } from '../../hooks/useAppTheme';
import { useTranslation } from 'react-i18next';
import userService from '../../services/api/userService';
import CustomSafeAreaView from '../../components/CustomSafeAreaView';
import ScreenHeader from '../../components/ScreenHeader';
import { ScreenLayout, TextInput } from '../../components';
import { DEFAULT_AVATAR_URL } from '../../config/app.config';
import Button from '../../components/Button';
import { showErrorModal, showInfoModal, showWarningModal } from '../../utils/errorManager';
import { logger } from '../../utils/logger';

const CustomerEditProfile = ({ route, navigation }) => {
    const { colors, isDark, styles: gStyles } = useAppTheme();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const { t } = useTranslation();
    const insets = useSafeAreaInsets();
    const { profile } = route.params || {};
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [profileData, setProfileData] = useState({
        given_name: '',
        parent_name: '',
        email: '',
        address: ''
    });
    const [profilePicture, setProfilePicture] = useState(null);
    const [currentProfilePicture, setCurrentProfilePicture] = useState(null);
    const [newImageSelected, setNewImageSelected] = useState(false);
    const [formErrors, setFormErrors] = useState({});
    const [dirty, setDirty] = useState(false);

    useEffect(() => {
        loadUserProfile();
    }, []);

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

    const loadUserProfile = async () => {
        try {
            setLoading(true);
            const profileToLoad = profile || await userService.getUserProfile();

            setProfileData({
                given_name: profileToLoad.given_name || '',
                parent_name: profileToLoad.parent_name || '',
                email: profileToLoad.email || '',
                address: profileToLoad.address || ''
            });

            setCurrentProfilePicture(profileToLoad.profilePicture);
        } catch (error) {
            logger.error('Профайл ачаалах алдаа:', error);
            showErrorModal(t('common.error'), t('profile.loadError'));
        } finally {
            setLoading(false);
        }
    };

    const updateField = (field, value) => {
        setProfileData(prev => ({ ...prev, [field]: value }));
        setDirty(true);
        if (formErrors[field]) {
            setFormErrors(prev => ({ ...prev, [field]: null }));
        }
    };

    const selectImage = () => {
        if (Platform.OS === 'ios' && ActionSheetIOS) {
            ActionSheetIOS.showActionSheetWithOptions(
                {
                    options: [t('upload.gallery'), t('upload.camera'), t('common.cancel')],
                    cancelButtonIndex: 2,
                    title: t('profile.changePicture'),
                },
                (buttonIndex) => {
                    if (buttonIndex === 0) {
                        openImageLibrary();
                    } else if (buttonIndex === 1) {
                        openCamera();
                    }
                }
            );
        } else {
            showInfoModal(
                t('profile.changePicture'),
                t('upload.addQuestion'),
                [
                    { text: t('common.cancel') },
                    { text: t('upload.gallery'), onPress: openImageLibrary },
                    { text: t('upload.camera'), onPress: openCamera },
                ]
            );
        }
    };

    const openCamera = async () => {
        const uri = await takeProfilePhoto();
        if (uri) {
            setProfilePicture(uri);
            setNewImageSelected(true);
            setDirty(true);
        }
    };

    const openImageLibrary = async () => {
        const uri = await pickProfileImage();
        if (uri) {
            setProfilePicture(uri);
            setNewImageSelected(true);
            setDirty(true);
        }
    };

    const validateForm = () => {
        const errors = {};

        if (!profileData.parent_name.trim()) {
            errors.parent_name = t('profile.parentNameRequired');
        }
        if (!profileData.given_name.trim()) {
            errors.given_name = t('profile.givenNameRequired');
        }

        if (profileData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profileData.email)) {
            errors.email = t('common.invalidEmail');
        }

        setFormErrors(errors);
        return Object.keys(errors).length === 0;
    };

    const handleSave = async () => {
        if (!validateForm()) {
            showErrorModal(t('common.validationError'), t('common.formError'));
            return;
        }

        try {
            setSaving(true);

            const imageToUpload = newImageSelected ? profilePicture : null;
            await userService.updateProfile(profileData, imageToUpload);

            setDirty(false);
            navigation.goBack();
        } catch (error) {
            logger.error('Профайл шинэчлэх алдаа:', error);
            showErrorModal(t('common.error'), t('profile.updateError'));
        } finally {
            setSaving(false);
        }
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
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={gStyles.keyboardAvoidingView}
            >
                <ScreenHeader title={t('profile.editTitle')} onBack={handleBack} />

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
                    <View style={styles.profilePictureSection}>
                        <View style={styles.profilePictureCard}>
                            <View style={styles.imageContainer}>
                                <Image
                                    source={{
                                        uri: profilePicture || currentProfilePicture || DEFAULT_AVATAR_URL
                                    }}
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
                                    onPress={selectImage}
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
                                value={profileData.parent_name}
                                onChangeText={(text) => updateField('parent_name', text)}
                                error={formErrors.parent_name}
                                required
                            />
                            <TextInput
                                label={t('profile.givenName')}
                                value={profileData.given_name}
                                onChangeText={(text) => updateField('given_name', text)}
                                error={formErrors.given_name}
                                required
                            />
                            <TextInput
                                label={t('profile.emailAddress')}
                                value={profileData.email}
                                onChangeText={(text) => updateField('email', text)}
                                error={formErrors.email}
                                keyboardType="email-address"
                            />
                            <TextInput
                                label={t('common.address')}
                                value={profileData.address}
                                onChangeText={(text) => updateField('address', text)}
                                error={formErrors.address}
                                multiline
                                numberOfLines={3}
                                containerStyle={styles.lastField}
                            />
                        </View>
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

export default CustomerEditProfile;

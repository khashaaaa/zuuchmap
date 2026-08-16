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
import { spacing, typography, shadows, radius, safeAreaHelpers, interactions, isTablet } from '../../design/theme';
import { useAppTheme } from '../../hooks/useAppTheme';
import { useTranslation } from 'react-i18next';
import userService from '../../services/api/userService';
import CustomSafeAreaView from '../../components/CustomSafeAreaView';
import ScreenHeader from '../../components/ScreenHeader';
import { TextInput, Button } from '../../components';
import { validateEmail, validatePhone, validateRequired } from '../../utils/formUtils';
import { logger } from '../../utils/logger';
import { showErrorModal, showWarningModal } from '../../utils/errorManager';

const ProviderCompanyCreate = ({ navigation }) => {
    const { colors, isDark, styles: gStyles } = useAppTheme();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const { t } = useTranslation();
    const insets = useSafeAreaInsets();
    const [logoLoading, setLogoLoading] = useState(false);
    const scrollViewRef = useRef(null);
    const inputRefs = useRef({});

    const [formData, setFormData] = useState({
        name: '',
        description: '',
        logo: null,
        website: '',
        address: '',
        phone_number: '',
        email: '',
        registration_number: '',
        tax_id: '',
    });
    const [isLoading, setIsLoading] = useState(false);
    const [formErrors, setFormErrors] = useState({});
    const [dirty, setDirty] = useState(false);

    useEffect(() => {
        const keyboardDidShowListener = Keyboard.addListener('keyboardDidShow', () => {});
        const keyboardDidHideListener = Keyboard.addListener('keyboardDidHide', () => {});
        return () => {
            keyboardDidShowListener.remove();
            keyboardDidHideListener.remove();
        };
    }, []);

    const updateFormData = (field, value) => {
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

    const focusField = (fieldName) => {
        if (inputRefs.current[fieldName] && scrollViewRef.current) {
            inputRefs.current[fieldName].focus();
            inputRefs.current[fieldName].measureLayout(
                scrollViewRef.current,
                (x, y) => {
                    scrollViewRef.current.scrollTo({ y: y - 100, animated: true });
                },
                () => logger.warn('Measurement failed')
            );
        }
    };

    const scrollToField = (fieldName) => {
        if (scrollViewRef.current && inputRefs.current[fieldName]) {
            setTimeout(() => {
                inputRefs.current[fieldName].measureLayout(
                    scrollViewRef.current,
                    (_, y) => {
                        scrollViewRef.current.scrollTo({ y: y - 120, animated: true });
                    },
                    () => {}
                );
            }, 100);
        }
    };

    const pickLogo = async () => {
        setLogoLoading(true);
        try {
            const uri = await pickCompanyLogo();
            if (uri) updateFormData('logo', uri);
        } catch (error) {
            logger.error('Logo picker error:', error);
        } finally {
            setLogoLoading(false);
        }
    };

    const removeLogo = () => {
        updateFormData('logo', null);
    };

    const validateForm = () => {
        const errors = {};

        if (!validateRequired(formData.name)) {
            errors.name = t('company.nameRequired');
        }

        if (formData.email && !validateEmail(formData.email)) {
            errors.email = t('common.invalidEmail');
        }

        if (formData.phone_number && !validatePhone(formData.phone_number)) {
            errors.phone_number = t('common.invalidPhone');
        }

        if (Object.keys(errors).length > 0) {
            const firstErrorField = Object.keys(errors)[0];
            setTimeout(() => focusField(firstErrorField), 100);
        }

        setFormErrors(errors);
        return Object.keys(errors).length === 0;
    };

    const normalizeWebsiteUrl = (url) => {
        if (!url || url.trim() === '') return '';
        const trimmedUrl = url.trim();
        if (/^https?:\/\//.test(trimmedUrl)) {
            return trimmedUrl;
        }
        return `https://${trimmedUrl}`;
    };

    const handleSubmit = async () => {
        Keyboard.dismiss();

        if (!validateForm()) {
            showErrorModal(t('common.error'), t('company.formError'));
            return;
        }

        setIsLoading(true);

        try {
            const submitData = {};

            Object.keys(formData).forEach(key => {
                if (key !== 'logo' && formData[key] !== null && formData[key] !== undefined) {
                    const value = formData[key].toString().trim();
                    if (value !== '') {
                        submitData[key] = value;
                    }
                }
            });

            if (formData.logo && typeof formData.logo === 'string' && formData.logo.startsWith('file://')) {
                submitData.logo = formData.logo;
            }

            await userService.createCompany(submitData);
            setDirty(false);
            navigation.goBack();
        } catch (error) {
            logger.error('Company save error:', error);

            let errorMessage = t('company.saveError');
            if (error.response?.data?.message) {
                if (Array.isArray(error.response.data.message)) {
                    errorMessage = error.response.data.message.join('\n');
                } else {
                    errorMessage = error.response.data.message;
                }
            } else if (error.message) {
                errorMessage = error.message;
            }

            showErrorModal(t('common.error'), errorMessage);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <CustomSafeAreaView backgroundColor={colors.background} statusBarColor={colors.surface} statusBarStyle={isDark ? 'light-content' : 'dark-content'}>
            <ScreenHeader title={t('company.createTitle')} onBack={handleBack} />

            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={gStyles.keyboardAvoidingView}
            >
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

                    <View style={styles.logoSection}>
                        <View style={styles.logoCard}>
                            <View style={styles.logoUploadContainer}>
                                <TouchableOpacity
                                    style={styles.logoPickerButton}
                                    onPress={pickLogo}
                                    disabled={logoLoading}
                                    activeOpacity={interactions.activeOpacityLight}
                                >
                                    {logoLoading ? (
                                        <ActivityIndicator size="large" color={colors.primary} />
                                    ) : formData.logo ? (
                                        <View style={styles.logoContainer}>
                                            <Image source={{ uri: formData.logo }} style={styles.logoImage} resizeMode="cover" />
                                            <TouchableOpacity
                                                style={styles.removeLogoButton}
                                                onPress={removeLogo}
                                                activeOpacity={interactions.activeOpacityLight}
                                                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                                accessibilityRole="button"
                                                accessibilityLabel={t('upload.removeImage')}
                                            >
                                                <Ionicons name="close-circle" size={24} color={colors.primary} />
                                            </TouchableOpacity>
                                        </View>
                                    ) : (
                                        <View style={styles.logoPlaceholder}>
                                            <Ionicons name="business-outline" size={40} color={colors.primary} />
                                        </View>
                                    )}
                                </TouchableOpacity>
                            </View>
                            <View style={styles.logoInfo}>
                                <Text style={styles.logoTitle}>{t('company.logo')}</Text>
                                <Text style={styles.logoSubtitle}>
                                    {t('company.logoHint')}
                                </Text>
                                <TouchableOpacity
                                    style={styles.changeLogoButton}
                                    onPress={pickLogo}
                                    disabled={logoLoading}
                                    activeOpacity={interactions.activeOpacityLight}
                                >
                                    <Ionicons name="camera-outline" size={16} color={colors.primary} />
                                    <Text style={styles.changeLogoText}>
                                        {formData.logo ? t('company.logoChange') : t('company.logoAdd')}
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>

                    <View style={styles.formSection}>
                        <View style={gStyles.sectionHeader}>
                            <Text style={[gStyles.sectionSubtitle, { color: colors.text.secondary }]}>{t('company.basicInfo')}</Text>
                        </View>
                        <View style={styles.formCard}>
                            <TextInput
                                ref={(r) => { inputRefs.current['name'] = r; }}
                                label={t('company.name')}
                                value={formData.name}
                                onChangeText={(text) => updateFormData('name', text)}
                                error={formErrors.name}
                                required
                                onFocus={() => scrollToField('name')}
                            />
                            <TextInput
                                ref={(r) => { inputRefs.current['description'] = r; }}
                                label={`${t('company.description')}`}
                                value={formData.description}
                                onChangeText={(text) => updateFormData('description', text)}
                                error={formErrors.description}
                                multiline
                                numberOfLines={3}
                                onFocus={() => scrollToField('description')}
                            />
                            <TextInput
                                ref={(r) => { inputRefs.current['website'] = r; }}
                                label={`${t('common.website')}`}
                                value={formData.website}
                                onChangeText={(text) => updateFormData('website', text)}
                                error={formErrors.website}
                                keyboardType="url"
                                onFocus={() => scrollToField('website')}
                                onBlur={() => {
                                    if (formData.website && formData.website.trim() !== '') {
                                        updateFormData('website', normalizeWebsiteUrl(formData.website));
                                    }
                                }}
                                containerStyle={styles.lastField}
                            />
                        </View>
                    </View>

                    <View style={styles.formSection}>
                        <View style={gStyles.sectionHeader}>
                            <Text style={[gStyles.sectionSubtitle, { color: colors.text.secondary }]}>{t('company.contactInfo')}</Text>
                        </View>
                        <View style={styles.formCard}>
                            <TextInput
                                ref={(r) => { inputRefs.current['address'] = r; }}
                                label={`${t('common.address')}`}
                                value={formData.address}
                                onChangeText={(text) => updateFormData('address', text)}
                                error={formErrors.address}
                                onFocus={() => scrollToField('address')}
                            />
                            <TextInput
                                ref={(r) => { inputRefs.current['phone_number'] = r; }}
                                label={`${t('common.phone')}`}
                                value={formData.phone_number}
                                onChangeText={(text) => updateFormData('phone_number', text)}
                                error={formErrors.phone_number}
                                keyboardType="phone-pad"
                                onFocus={() => scrollToField('phone_number')}
                            />
                            <TextInput
                                ref={(r) => { inputRefs.current['email'] = r; }}
                                label={`${t('common.email')}`}
                                value={formData.email}
                                onChangeText={(text) => updateFormData('email', text)}
                                error={formErrors.email}
                                keyboardType="email-address"
                                onFocus={() => scrollToField('email')}
                                containerStyle={styles.lastField}
                            />
                        </View>
                    </View>

                    <View style={styles.formSection}>
                        <View style={gStyles.sectionHeader}>
                            <Text style={[gStyles.sectionSubtitle, { color: colors.text.secondary }]}>{t('company.legalInfo')}</Text>
                        </View>
                        <View style={styles.formCard}>
                            <TextInput
                                ref={(r) => { inputRefs.current['registration_number'] = r; }}
                                label={`${t('company.regNumber')}`}
                                value={formData.registration_number}
                                onChangeText={(text) => updateFormData('registration_number', text)}
                                error={formErrors.registration_number}
                                onFocus={() => scrollToField('registration_number')}
                            />
                            <TextInput
                                ref={(r) => { inputRefs.current['tax_id'] = r; }}
                                label={`${t('company.taxId')}`}
                                value={formData.tax_id}
                                onChangeText={(text) => updateFormData('tax_id', text)}
                                error={formErrors.tax_id}
                                onFocus={() => scrollToField('tax_id')}
                                containerStyle={styles.lastField}
                            />
                        </View>
                    </View>

                    <View style={styles.bottomSpacing} />
                    </View>
                </ScrollView>

                <View style={[
                    styles.submitButtonContainer,
                    gStyles.bottomContainerWithInset(safeAreaHelpers.getBottomSafeArea(insets)),
                    { backgroundColor: colors.surface },
                ]}>
                    <Button
                        title={t('company.createTitle')}
                        onPress={handleSubmit}
                        disabled={isLoading || logoLoading}
                        loading={isLoading}
                        loadingText={t('common.saving')}
                        icon="add-circle-outline"
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
    logoSection: {
        marginBottom: spacing.xl,
    },
    logoCard: {
        backgroundColor: colors.surface,
        borderRadius: radius.xxl,
        padding: spacing.xl,
        flexDirection: 'row',
        alignItems: 'center',
        ...shadows.medium,
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
        justifyContent: 'center',
        alignItems: 'center',
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
    removeLogoButton: {
        position: 'absolute',
        top: -8,
        right: -8,
        backgroundColor: colors.surface,
        borderRadius: radius.lg,
        ...shadows.small,
    },
    logoInfo: {
        flex: 1,
    },
    logoTitle: {
        fontSize: typography.md,
        fontWeight: 'bold',
        color: colors.text.primary,
        marginBottom: spacing.xs,
    },
    logoSubtitle: {
        fontSize: typography.sm,
        color: colors.text.secondary,
        marginBottom: spacing.md,
        lineHeight: 18,
    },
    changeLogoButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.opacity.background.primary,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        borderRadius: radius.xxl,
        alignSelf: 'flex-start',
    },
    changeLogoText: {
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
    bottomSpacing: {
        height: spacing.xl,
    },
    submitButtonContainer: {
        backgroundColor: colors.surface,
        borderTopWidth: 1,
        borderTopColor: colors.border.light,
        padding: spacing.lg,
        ...shadows.medium,
    },
});

export default ProviderCompanyCreate;

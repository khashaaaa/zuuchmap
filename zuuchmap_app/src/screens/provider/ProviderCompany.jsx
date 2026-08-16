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
import { spacing, typography, shadows, radius, safeAreaHelpers, interactions } from '../../design/theme';
import { useAppTheme } from '../../hooks/useAppTheme';
import { useTranslation } from 'react-i18next';
import userService from '../../services/api/userService';
import CustomSafeAreaView from '../../components/CustomSafeAreaView';
import ScreenHeader from '../../components/ScreenHeader';
import { TextInput, Button } from '../../components';
import { validateEmail, validatePhone, validateRequired } from '../../utils/formUtils';
import { logger } from '../../utils/logger';
import { showErrorModal } from '../../utils/errorManager';

const ProviderCompany = ({ route, navigation }) => {
    const { colors, isDark, styles: gStyles } = useAppTheme();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const { t } = useTranslation();
    const insets = useSafeAreaInsets();
    const { companyId } = route.params;
    const [isEditing, setIsEditing] = useState(false);
    const [company, setCompany] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [logoLoading, setLogoLoading] = useState(false);
    const [logoChanged, setLogoChanged] = useState(false);
    const [formErrors, setFormErrors] = useState({});
    const scrollViewRef = useRef(null);
    const inputRefs = useRef({});

    useEffect(() => {
        loadCompany();

        const keyboardDidShowListener = Keyboard.addListener('keyboardDidShow', () => {});
        const keyboardDidHideListener = Keyboard.addListener('keyboardDidHide', () => {});

        return () => {
            keyboardDidShowListener.remove();
            keyboardDidHideListener.remove();
        };
    }, []);

    const loadCompany = async () => {
        setIsLoading(true);
        try {
            const companyData = await userService.getCompany(companyId);
            setCompany(companyData);
        } catch (error) {
            logger.error('Company loading error:', error);
            showErrorModal(t('common.error'), t('company.loadError'));
        } finally {
            setIsLoading(false);
        }
    };

    const updateCompanyData = (field, value) => {
        setCompany(prev => ({ ...prev, [field]: value }));
        if (formErrors[field]) {
            setFormErrors(prev => ({ ...prev, [field]: null }));
        }
    };

    const pickLogo = async () => {
        setLogoLoading(true);
        try {
            const uri = await pickCompanyLogo();
            if (uri) {
                updateCompanyData('logo', uri);
                setLogoChanged(true);
            }
        } catch (error) {
            logger.error('Logo picker error:', error);
        } finally {
            setLogoLoading(false);
        }
    };

    const removeLogo = () => {
        updateCompanyData('logo', null);
        setLogoChanged(true);
    };

    const validateForm = () => {
        const errors = {};

        if (!validateRequired(company.name)) {
            errors.name = t('company.nameRequired');
        }

        if (company.email && !validateEmail(company.email)) {
            errors.email = t('common.invalidEmail');
        }

        if (company.phone_number && !validatePhone(company.phone_number)) {
            errors.phone_number = t('common.invalidPhone');
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
            const submitData = {};

            const excludedFields = ['id', 'is_verified', 'date_created', 'date_updated', 'users', 'logo'];

            Object.keys(company).forEach(key => {
                if (!excludedFields.includes(key) &&
                    company[key] !== null &&
                    company[key] !== undefined) {
                    const value = company[key].toString().trim();
                    if (value !== '') {
                        submitData[key] = value;
                    }
                }
            });

            if (logoChanged && company.logo && typeof company.logo === 'string' && company.logo.startsWith('file://')) {
                submitData.logo = company.logo;
            }

            await userService.updateCompany(company.id, submitData);

            setIsEditing(false);
            setLogoChanged(false);
            await loadCompany();
        } catch (error) {
            logger.error('Company update error:', error);

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
            setIsSaving(false);
        }
    };

    const handleCancel = () => {
        setIsEditing(false);
        setLogoChanged(false);
        loadCompany();
    };

    const renderInfoField = (icon, label, value) => {
        if (!value) return null;

        return (
            <View style={styles.infoItem}>
                <View style={styles.infoIcon}>
                    <Ionicons name={icon} size={20} color={colors.primary} />
                </View>
                <View style={styles.infoContent}>
                    <Text style={styles.infoLabel}>{label}</Text>
                    <Text style={styles.infoText}>{value}</Text>
                </View>
            </View>
        );
    };

    if (isLoading) {
        return (
            <CustomSafeAreaView backgroundColor={colors.background} statusBarColor={colors.surface} statusBarStyle={isDark ? 'light-content' : 'dark-content'}>
                <ScreenHeader title={t('company.title')} onBack={() => navigation.goBack()} />
                <View style={[gStyles.loadingContainer, { backgroundColor: colors.background }]}>
                    <ActivityIndicator size="large" color={colors.primary} />
                    <Text style={[gStyles.loadingText, { color: colors.text.secondary }]}>{t('company.loading')}</Text>
                </View>
            </CustomSafeAreaView>
        );
    }

    if (!company) {
        return (
            <CustomSafeAreaView backgroundColor={colors.background} statusBarColor={colors.surface} statusBarStyle={isDark ? 'light-content' : 'dark-content'}>
                <ScreenHeader title={t('company.title')} onBack={() => navigation.goBack()} />
                <View style={styles.errorContainer}>
                    <View style={styles.errorIconContainer}>
                        <Ionicons name="alert-circle-outline" size={64} color={colors.primary} />
                    </View>
                    <Text style={styles.errorTitle}>{t('company.notFound')}</Text>
                    <Text style={styles.errorDesc}>{t('company.notFoundDesc')}</Text>
                    <Button title={t('common.retry')} onPress={loadCompany} />
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
                    title={t('company.title')}
                    onBack={() => navigation.goBack()}
                    rightComponent={isEditing ? (
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
                    {company.is_verified && (
                        <View style={styles.verificationSection}>
                            <View style={styles.verificationBadge}>
                                <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
                                <Text style={styles.verificationText}>{t('company.verified')}</Text>
                            </View>
                        </View>
                    )}

                    <View style={styles.logoSection}>
                        <View style={styles.logoCard}>
                            {!isEditing && (
                                <TouchableOpacity
                                    style={[styles.inlineEditButton, { backgroundColor: colors.opacity.background.primary }]}
                                    onPress={() => setIsEditing(true)}
                                    activeOpacity={interactions.activeOpacityLight}
                                >
                                    <Ionicons name="create-outline" size={16} color={colors.primary} />
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
                                            <ActivityIndicator size="large" color={colors.primary} />
                                        ) : company.logo ? (
                                            <View style={styles.logoContainer}>
                                                <Image source={{ uri: company.logo }} style={styles.logoImage} resizeMode="cover" />
                                                <TouchableOpacity style={styles.removeLogoButton} onPress={removeLogo} activeOpacity={interactions.activeOpacityLight}>
                                                    <Ionicons name="close-circle" size={24} color={colors.primary} />
                                                </TouchableOpacity>
                                            </View>
                                        ) : (
                                            <View style={styles.logoPlaceholder}>
                                                <Ionicons name="business-outline" size={40} color={colors.primary} />
                                            </View>
                                        )}
                                    </TouchableOpacity>
                                ) : (
                                    company.logo ? (
                                        <View style={styles.logoDisplayContainer}>
                                            <Image source={{ uri: company.logo }} style={styles.logoDisplay} resizeMode="cover" />
                                        </View>
                                    ) : (
                                        <View style={styles.logoPlaceholder}>
                                            <Ionicons name="business-outline" size={40} color={colors.primary} />
                                        </View>
                                    )
                                )}
                            </View>
                            <View style={styles.logoInfo}>
                                <Text style={styles.logoTitle}>{t('company.logo')}</Text>
                                <Text style={styles.logoSubtitle}>
                                    {isEditing
                                        ? t('company.logoHint')
                                        : company.logo
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
                                        <Ionicons name="camera-outline" size={16} color={colors.primary} />
                                        <Text style={styles.changeLogoText}>
                                            {company.logo ? t('company.logoChange') : t('company.logoAdd')}
                                        </Text>
                                    </TouchableOpacity>
                                )}
                            </View>
                        </View>
                    </View>

                    <View style={styles.formSection}>
                        {isEditing ? (
                            <View style={styles.formCard}>
                                <TextInput
                                    ref={(r) => { inputRefs.current['name'] = r; }}
                                    label={t('company.name')}
                                    value={company.name || ''}
                                    onChangeText={(text) => updateCompanyData('name', text)}
                                    error={formErrors.name}
                                    required
                                />
                                <TextInput
                                    ref={(r) => { inputRefs.current['description'] = r; }}
                                    label={`${t('company.description')}`}
                                    value={company.description || ''}
                                    onChangeText={(text) => updateCompanyData('description', text)}
                                    error={formErrors.description}
                                    multiline
                                    numberOfLines={4}
                                />
                                <TextInput
                                    ref={(r) => { inputRefs.current['website'] = r; }}
                                    label={`${t('common.website')}`}
                                    value={company.website || ''}
                                    onChangeText={(text) => updateCompanyData('website', text)}
                                    error={formErrors.website}
                                    keyboardType="url"
                                    containerStyle={styles.lastField}
                                />
                            </View>
                        ) : (
                            <View style={styles.infoCard}>
                                {renderInfoField('business-outline', t('company.name'), company.name)}
                                {renderInfoField('document-text-outline', t('company.description'), company.description)}
                                {renderInfoField('globe-outline', t('common.website'), company.website)}
                            </View>
                        )}
                    </View>

                    <View style={styles.formSection}>
                        {isEditing ? (
                            <View style={styles.formCard}>
                                <TextInput
                                    ref={(r) => { inputRefs.current['address'] = r; }}
                                    label={`${t('common.address')}`}
                                    value={company.address || ''}
                                    onChangeText={(text) => updateCompanyData('address', text)}
                                    error={formErrors.address}
                                />
                                <TextInput
                                    ref={(r) => { inputRefs.current['phone_number'] = r; }}
                                    label={`${t('common.phone')}`}
                                    value={company.phone_number || ''}
                                    onChangeText={(text) => updateCompanyData('phone_number', text)}
                                    error={formErrors.phone_number}
                                    keyboardType="phone-pad"
                                />
                                <TextInput
                                    ref={(r) => { inputRefs.current['email'] = r; }}
                                    label={`${t('common.email')}`}
                                    value={company.email || ''}
                                    onChangeText={(text) => updateCompanyData('email', text)}
                                    error={formErrors.email}
                                    keyboardType="email-address"
                                    containerStyle={styles.lastField}
                                />
                            </View>
                        ) : (
                            <View style={styles.infoCard}>
                                {renderInfoField('location-outline', t('common.address'), company.address)}
                                {renderInfoField('call-outline', t('common.phone'), company.phone_number)}
                                {renderInfoField('mail-outline', t('common.email'), company.email)}
                            </View>
                        )}
                    </View>

                    <View style={styles.formSection}>
                        {isEditing ? (
                            <View style={styles.formCard}>
                                <TextInput
                                    ref={(r) => { inputRefs.current['registration_number'] = r; }}
                                    label={`${t('company.regNumber')}`}
                                    value={company.registration_number || ''}
                                    onChangeText={(text) => updateCompanyData('registration_number', text)}
                                    error={formErrors.registration_number}
                                />
                                <TextInput
                                    ref={(r) => { inputRefs.current['tax_id'] = r; }}
                                    label={`${t('company.taxId')}`}
                                    value={company.tax_id || ''}
                                    onChangeText={(text) => updateCompanyData('tax_id', text)}
                                    error={formErrors.tax_id}
                                    containerStyle={styles.lastField}
                                />
                            </View>
                        ) : (
                            <View style={styles.infoCard}>
                                {renderInfoField('card-outline', t('company.regNumber'), company.registration_number)}
                                {renderInfoField('receipt-outline', t('company.taxId'), company.tax_id)}
                            </View>
                        )}
                    </View>

                    <View style={styles.bottomSpacing} />
                </ScrollView>

                {isEditing && (
                    <View style={[
                        styles.saveButtonContainer,
                        gStyles.bottomContainerWithInset(safeAreaHelpers.getBottomSafeArea(insets)),
                        { backgroundColor: colors.surface },
                    ]}>
                        <Button
                            title={t('common.save')}
                            onPress={handleSave}
                            disabled={isSaving}
                            loading={isSaving}
                            loadingText={t('common.saving')}
                            icon="checkmark-circle-outline"
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
        borderColor: colors.opacity.background.success,
    },
    verificationText: {
        marginLeft: spacing.sm,
        fontSize: typography.sm,
        color: colors.success,
        fontWeight: '600',
    },
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
        position: 'relative',
    },
    inlineEditButton: {
        position: 'absolute',
        top: spacing.sm,
        right: spacing.sm,
        width: 32,
        height: 32,
        borderRadius: radius.xl,
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
    infoCard: {
        backgroundColor: colors.surface,
        borderRadius: radius.xxl,
        padding: spacing.lg,
        ...shadows.medium,
    },
    infoItem: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        paddingVertical: spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: colors.border.light,
        marginBottom: spacing.sm,
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
        fontSize: typography.xs,
        color: colors.text.secondary,
        marginBottom: spacing.xs,
        fontWeight: '500',
    },
    infoText: {
        fontSize: typography.md,
        color: colors.text.primary,
        lineHeight: 20,
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
        fontSize: typography.sm,
        fontWeight: '500',
    },
    bottomSpacing: {
        height: spacing.xl,
    },
    saveButtonContainer: {
        backgroundColor: colors.surface,
        borderTopWidth: 1,
        borderTopColor: colors.border.light,
        padding: spacing.lg,
        ...shadows.medium,
    },
    errorContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: spacing.xxl,
    },
    errorIconContainer: {
        width: 120,
        height: 120,
        borderRadius: radius.pill,
        backgroundColor: colors.opacity.background.danger,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: spacing.xxl,
    },
    errorTitle: {
        fontSize: typography.lg,
        fontWeight: 'bold',
        color: colors.text.primary,
        marginBottom: spacing.sm,
    },
    errorDesc: {
        fontSize: typography.md,
        color: colors.text.secondary,
        textAlign: 'center',
        lineHeight: 22,
        marginBottom: spacing.xxl,
    },
});

export default ProviderCompany;

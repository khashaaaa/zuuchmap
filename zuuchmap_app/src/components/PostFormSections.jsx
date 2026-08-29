import React, { useMemo } from 'react';
import { View, Text, TextInput } from 'react-native';
import FormField from './FormField';
import PickerField from './PickerField';
import { provinces, districts } from '../config/app.config';
import { useAppTheme } from '../hooks/useAppTheme';
import { useTranslation } from 'react-i18next';

// The three non-schema sections of the post form (ProviderPostForm). Category
// fields come from DynamicForm; these are the fixed ones every post carries.

export const ContactSection = ({
    contactPhone,
    onContactPhoneChange,
    error,
    inputRefs
}) => {
    const { colors, styles: gStyles } = useAppTheme();
    const { t } = useTranslation();
    return (
        <>
            <View style={gStyles.sectionHeader}>
                <Text style={[gStyles.sectionSubtitle, { color: colors.text.secondary }]}>{t('form.contactInfo')}</Text>
            </View>

            <FormField
                label={t('form.contactPhone')}
                required
                error={error}
                component={
                    <TextInput
                        style={[gStyles.input, { backgroundColor: colors.surface, color: colors.text.primary, borderColor: colors.border.light }, error && gStyles.inputError]}
                        value={contactPhone}
                        onChangeText={(text) => onContactPhoneChange(text.replace(/[^0-9]/g, ''))}
                        keyboardType="phone-pad"
                        maxLength={8}
                        placeholderTextColor={colors.text.placeholder}
                        ref={(ref) => {
                            if (inputRefs?.current) {
                                inputRefs.current.contact_phone = ref;
                            }
                        }}
                    />
                }
            />
        </>
    );
};

export const LocationSection = ({
    province,
    district,
    onProvinceChange,
    onDistrictChange,
    errors
}) => {
    const { colors, styles: gStyles } = useAppTheme();
    const { t } = useTranslation();

    const provinceOptions = provinces.map((value) => ({ value, label: t(`province.${value}`, { defaultValue: value }) }));
    const districtOptions = districts.map((value) => ({ value, label: t(`district.${value}`, { defaultValue: value }) }));

    return (
        <>
            <View style={gStyles.sectionHeader}>
                <Text style={[gStyles.sectionSubtitle, { color: colors.text.secondary }]}>{t('form.locationInfo')}</Text>
            </View>

            <FormField
                label={t('common.province')}
                error={errors.province}
                component={
                    <PickerField
                        value={province}
                        options={provinceOptions}
                        onSelect={onProvinceChange}
                        placeholder={t('common.province')}
                        error={errors.province}
                        title={t('common.province')}
                    />
                }
            />

            {province === 'ULAANBAATAR' && (
                <FormField
                    label={t('common.district')}
                    error={errors.district}
                    component={
                        <PickerField
                            value={district}
                            options={districtOptions}
                            onSelect={onDistrictChange}
                            placeholder={t('common.district')}
                            error={errors.district}
                            title={t('common.district')}
                        />
                    }
                />
            )}
        </>
    );
};

export const StatusSection = ({ status, onStatusChange, error }) => {
    const { colors, styles: gStyles } = useAppTheme();
    const { t } = useTranslation();

    const statuses = useMemo(() => [
        { value: 'ACTIVE', label: t('status.active') },
        { value: 'EXPIRED', label: t('status.expired') },
        { value: 'RENTED', label: t('status.rented') },
    ], [t]);

    return (
        <>
            <View style={gStyles.sectionHeader}>
                <Text style={[gStyles.sectionTitle, { color: colors.text.primary }]}>{t('posts.status')}</Text>
                <Text style={[gStyles.sectionSubtitle, { color: colors.text.secondary }]}>{t('form.postStatus')}</Text>
            </View>

            <FormField
                label={t('posts.status')}
                error={error}
                component={
                    <PickerField
                        value={status}
                        options={statuses}
                        onSelect={onStatusChange}
                        placeholder={t('posts.status')}
                        error={error}
                        title={t('posts.status')}
                    />
                }
            />
        </>
    );
};

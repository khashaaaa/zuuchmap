import React from 'react';
import { View, Text } from 'react-native';
import FormField from './FormField';
import PickerField from './PickerField';
import { provinces, districts } from '../config/app.config';
import { useAppTheme } from '../hooks/useAppTheme';
import { useTranslation } from 'react-i18next';

const LocationSection = ({
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

export default LocationSection;

import React from 'react';
import { View, Text } from 'react-native';
import FormField from './FormField';
import PickerField from './PickerField';
import { provinces, districts } from '../config/app.config';
import {  } from '../design/theme';
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

    return (
        <>
            <View style={gStyles.sectionHeader}>
                <Text style={[gStyles.sectionSubtitle, { color: colors.text.secondary }]}>{t('form.locationInfo')}</Text>
            </View>

            <FormField
                label={t('common.province')}
                field="province"
                error={errors.province}
                component={
                    <PickerField
                        value={province}
                        options={provinces}
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
                    field="district"
                    error={errors.district}
                    component={
                        <PickerField
                            value={district}
                            options={districts}
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

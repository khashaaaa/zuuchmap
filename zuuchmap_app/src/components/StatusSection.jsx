import React, { useMemo } from 'react';
import { View, Text } from 'react-native';
import FormField from './FormField';
import PickerField from './PickerField';
import {  } from '../design/theme';
import { useAppTheme } from '../hooks/useAppTheme';
import { useTranslation } from 'react-i18next';

const StatusSection = ({ status, onStatusChange, error }) => {
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
                field="status"
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

export default StatusSection;

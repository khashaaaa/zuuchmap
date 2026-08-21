import React from 'react';
import { View, Text, TextInput } from 'react-native';
import FormField from './FormField';
import {  } from '../design/theme';
import { useAppTheme } from '../hooks/useAppTheme';
import { useTranslation } from 'react-i18next';

const ContactSection = ({
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
                field="contact_phone"
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

export default ContactSection;

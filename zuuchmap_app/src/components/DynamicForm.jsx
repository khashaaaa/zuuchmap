import React from 'react';
import { View, Text, TextInput } from 'react-native';
import FormField from './FormField';
import PickerField from './PickerField';
import {  } from '../design/theme';
import { useAppTheme } from '../hooks/useAppTheme';
import { useTranslation } from 'react-i18next';

// Converts snake_case field keys (from backend) to camelCase for i18n lookup
const toCamel = (s) => s.toLowerCase().replace(/_([a-z])/g, (_, c) => c.toUpperCase());

// Prefer the schema's own translations; fall back to client i18n, then the raw label
const fieldLabel = (field, t, lng) =>
  field.labels?.[lng] ?? t(`attrs.${toCamel(field.key)}`, { defaultValue: field.label });

const SelectField = ({ field, value, onChange, error }) => {
  const { t, i18n } = useTranslation();
  const label = fieldLabel(field, t, i18n.language);
  const options = (field.options || []).map((o) => {
    const raw = typeof o === 'string' ? o : o.value;
    const fallback = typeof o === 'string' ? o : (o.label || o.value);
    return { value: raw, label: t(`attrs.${toCamel(raw.toLowerCase())}`, { defaultValue: fallback }) };
  });
  const placeholder = field.placeholder || `${label} ${t('common.select').toLowerCase()}`;
  return (
    <FormField
      label={label}
      required={!!field.required}
      error={error}
      component={
        <PickerField
          value={value}
          options={options}
          onSelect={onChange}
          placeholder={placeholder}
          error={error}
          title={label}
        />
      }
    />
  );
};

const DynamicForm = ({ fields = [], formData = {}, updateFormData, formErrors = {}, inputRefs }) => {
  const { colors, styles: gStyles } = useAppTheme();
  const { t, i18n } = useTranslation();

  if (!fields.length) return null;

  const setRef = (key, ref) => {
    if (inputRefs?.current) inputRefs.current[key] = ref;
  };

  return (
    <View>
      <View style={gStyles.sectionHeader}>
        <Text style={[gStyles.sectionSubtitle, { color: colors.text.secondary }]}>{t('form.categoryDetails')}</Text>
      </View>
      {fields.map((field) => {
        const value = formData.attributes?.[field.key] ?? '';
        const error = formErrors[`attributes.${field.key}`] || formErrors[field.key];
        const onChange = (val) =>
          updateFormData('attributes', { ...(formData.attributes || {}), [field.key]: val });

        if (field.type === 'select') {
          return (
            <SelectField
              key={field.key}
              field={field}
              value={value}
              onChange={onChange}
              error={error}
            />
          );
        }

        const label = fieldLabel(field, t, i18n.language);
        const isTextarea = field.type === 'textarea';
        const keyboardType =
          field.type === 'number' ? 'numeric' :
          field.type === 'phone' ? 'phone-pad' :
          'default';

        return (
          <FormField
            key={field.key}
            label={label}
            required={!!field.required}
            error={error}
            component={
              <TextInput
                style={[
                  gStyles.input,
                  { backgroundColor: colors.surface, color: colors.text.inverse, borderColor: colors.border.light },
                  isTextarea && gStyles.inputTextArea,
                  error && gStyles.inputError,
                ]}
                value={String(value)}
                onChangeText={onChange}
                placeholderTextColor={colors.text.placeholder}
                keyboardType={keyboardType}
                multiline={isTextarea}
                numberOfLines={isTextarea ? 4 : 1}
                textAlignVertical={isTextarea ? 'top' : 'auto'}
                ref={(ref) => setRef(field.key, ref)}
              />
            }
          />
        );
      })}
    </View>
  );
};

export default DynamicForm;

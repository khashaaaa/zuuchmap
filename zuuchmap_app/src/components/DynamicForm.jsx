import React from 'react';
import { View, Text, TextInput, Switch } from 'react-native';
import FormField from './FormField';
import PickerField from './PickerField';
import PressableScale from './PressableScale';
import CollapsibleSection from './CollapsibleSection';
import { spacing, radius, typography } from '../design/theme';
import { useAppTheme } from '../hooks/useAppTheme';
import { useTranslation } from 'react-i18next';

// Converts snake_case field keys (from backend) to camelCase for i18n lookup
const toCamel = (s) => s.toLowerCase().replace(/_([a-z])/g, (_, c) => c.toUpperCase());

// Prefer the schema's own translations; fall back to client i18n, then the raw
// label. A `unit` travels with the label so "Даац" reads "Даац (т)".
const fieldLabel = (field, t, lng) => {
  const base = field.labels?.[lng] ?? t(`attrs.${toCamel(field.key)}`, { defaultValue: field.label });
  return field.unit ? `${base} (${field.unit})` : base;
};

// Localized placeholder mirrors `labels`; flat `placeholder` is the fallback.
const fieldPlaceholder = (field, lng) =>
  field.placeholders?.[lng] ?? field.placeholder ?? undefined;

const optionLabel = (opt, t) =>
  t(`attrs.${toCamel(String(opt).toLowerCase())}`, { defaultValue: String(opt) });

const SelectField = ({ field, value, onChange, error }) => {
  const { t, i18n } = useTranslation();
  const label = fieldLabel(field, t, i18n.language);
  const options = (field.options || []).map((o) => {
    const raw = typeof o === 'string' ? o : o.value;
    const fallback = typeof o === 'string' ? o : (o.label || o.value);
    return { value: raw, label: t(`attrs.${toCamel(raw.toLowerCase())}`, { defaultValue: fallback }) };
  });
  const placeholder = fieldPlaceholder(field, i18n.language) || t('form.selectPlaceholder', { field: label });
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

const BooleanField = ({ field, value, onChange, error }) => {
  const { colors } = useAppTheme();
  const { t, i18n } = useTranslation();
  const label = fieldLabel(field, t, i18n.language);
  return (
    <FormField
      label={label}
      required={!!field.required}
      error={error}
      component={
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ ...typography.styles.body, color: colors.text.secondary }}>
            {value === true ? t('common.yes') : t('common.no')}
          </Text>
          <Switch
            value={value === true}
            onValueChange={onChange}
            trackColor={{ false: colors.border.light, true: colors.primary }}
            thumbColor={colors.onPrimary}
          />
        </View>
      }
    />
  );
};

const MultiSelectField = ({ field, value, onChange, error }) => {
  const { colors } = useAppTheme();
  const { t, i18n } = useTranslation();
  const label = fieldLabel(field, t, i18n.language);
  const selected = Array.isArray(value) ? value : [];
  const toggle = (opt) =>
    onChange(selected.includes(opt) ? selected.filter((s) => s !== opt) : [...selected, opt]);

  return (
    <FormField
      label={label}
      required={!!field.required}
      error={error}
      component={
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          {(field.options || []).map((opt) => {
            const on = selected.includes(opt);
            return (
              <PressableScale
                key={opt}
                onPress={() => toggle(opt)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                style={[
                  { paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radius.full, borderWidth: 1 },
                  on
                    ? { ...colors.elevation.selected, borderColor: colors.primary, backgroundColor: colors.primary }
                    : { borderColor: colors.border.light, backgroundColor: colors.surface },
                ]}
              >
                <Text style={{ ...typography.styles.label, color: on ? colors.onPrimary : colors.text.primary }}>
                  {optionLabel(opt, t)}
                </Text>
              </PressableScale>
            );
          })}
        </View>
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

  // Required fields render upfront; optional ones sit behind a disclosure.
  const core = fields.filter((f) => (f.group ?? 'core') === 'core');
  const details = fields.filter((f) => f.group === 'details');

  // Single-line text inputs, in render order, for keyboard "next" chaining.
  // Only core fields chain — focusing an input inside a collapsed section
  // would move the cursor somewhere the user cannot see. Selects, textareas,
  // switches and chip groups are skipped: return does not advance them.
  const chainKeys = core
    .filter((f) => !['select', 'textarea', 'boolean', 'multiselect'].includes(f.type))
    .map((f) => f.key);

  const renderField = (field) => {
    const value = formData.attributes?.[field.key] ?? '';
    const error = formErrors[`attributes.${field.key}`] || formErrors[field.key];
    const onChange = (val) =>
      updateFormData('attributes', { ...(formData.attributes || {}), [field.key]: val });

    if (field.type === 'select') {
      return <SelectField key={field.key} field={field} value={value} onChange={onChange} error={error} />;
    }
    if (field.type === 'boolean') {
      return <BooleanField key={field.key} field={field} value={value} onChange={onChange} error={error} />;
    }
    if (field.type === 'multiselect') {
      return <MultiSelectField key={field.key} field={field} value={value} onChange={onChange} error={error} />;
    }

    const label = fieldLabel(field, t, i18n.language);
    const isTextarea = field.type === 'textarea';
    const nextKey = isTextarea ? undefined : chainKeys[chainKeys.indexOf(field.key) + 1];
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
              { backgroundColor: colors.surface, color: colors.text.primary, borderColor: colors.border.light },
              isTextarea && gStyles.inputTextArea,
              error && gStyles.inputError,
            ]}
            value={String(value)}
            onChangeText={onChange}
            placeholder={fieldPlaceholder(field, i18n.language)}
            placeholderTextColor={colors.text.placeholder}
            keyboardType={keyboardType}
            multiline={isTextarea}
            numberOfLines={isTextarea ? 4 : 1}
            textAlignVertical={isTextarea ? 'top' : 'auto'}
            returnKeyType={isTextarea ? undefined : (nextKey ? 'next' : 'done')}
            onSubmitEditing={isTextarea || !nextKey ? undefined : () => inputRefs?.current?.[nextKey]?.focus?.()}
            blurOnSubmit={isTextarea ? undefined : !nextKey}
            ref={(ref) => setRef(field.key, ref)}
          />
        }
      />
    );
  };

  return (
    <View>
      <View style={gStyles.sectionHeader}>
        <Text style={[gStyles.sectionSubtitle, { color: colors.text.secondary }]}>{t('form.categoryDetails')}</Text>
      </View>
      {core.map(renderField)}
      {details.length > 0 && (
        <CollapsibleSection title={t('form.moreDetails')}>
          {details.map(renderField)}
        </CollapsibleSection>
      )}
    </View>
  );
};

export default DynamicForm;

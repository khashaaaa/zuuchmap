import React, { useEffect, useRef } from 'react';
import { View, Text, TextInput as RNTextInput, Switch, Animated, StyleSheet } from 'react-native';
import FormField from './FormField';
import TextInput from './TextInput';
import PickerField from './PickerField';
import PressableScale from './PressableScale';
import CollapsibleSection from './CollapsibleSection';
import { spacing, radius, typography, animations, withAlpha } from '../design/theme';
import { useAppTheme } from '../hooks/useAppTheme';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useTranslation } from 'react-i18next';
import { PRICE_UNITS } from '../config/app.config';
import { getPriceUnitLabel, formatPrice } from '../utils/displayUtils';
import { logger } from '../utils/logger';

// Converts snake_case field keys (from backend) to camelCase for i18n lookup
const toCamel = (s) => s.toLowerCase().replace(/_([a-z])/g, (_, c) => c.toUpperCase());

// Prefer the schema's own translations; fall back to client i18n, then the raw
// label. A `unit` travels with the label so "Даац" reads "Даац (т)".
export const fieldLabel = (field, t, lng) => {
  const base = field.labels?.[lng] ?? t(`attrs.${toCamel(field.key)}`, { defaultValue: field.label });
  return field.unit ? `${base} (${field.unit})` : base;
};

// Localized placeholder mirrors `labels`; flat `placeholder` is the fallback.
const fieldPlaceholder = (field, lng) =>
  field.placeholders?.[lng] ?? field.placeholder ?? undefined;

const optionLabel = (opt, t) =>
  t(`attrs.${toCamel(String(opt).toLowerCase())}`, { defaultValue: String(opt) });

const HIGHLIGHT_SCROLL_OFFSET = 96;

/**
 * Wraps one form field so an admin's rejection can point straight at it.
 *
 * When `active`, the wrapper takes the amber selected border, scrolls itself
 * into view (measured against `scrollViewRef`, the same way `useFocusField`
 * does) and breathes its tint three times. Reduce-motion keeps the border and
 * the scroll but skips the pulse — the border alone still says "here".
 */
export const FieldHighlight = ({ active, scrollViewRef, children, style }) => {
  const { colors } = useAppTheme();
  const reduced = useReducedMotion();
  const ref = useRef(null);
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!active) return undefined;
    // Layout settles a frame after mount; measuring synchronously returns 0.
    const id = setTimeout(() => {
      const node = ref.current;
      const scroll = scrollViewRef?.current;
      if (!node || !scroll) return;
      node.measureLayout(
        scroll,
        (x, y) => scroll.scrollTo({ y: Math.max(0, y - HIGHLIGHT_SCROLL_OFFSET), animated: !reduced }),
        () => logger.warn('Highlight measurement failed'),
      );
    }, 350);

    if (reduced) {
      pulse.setValue(1);
      return () => clearTimeout(id);
    }
    const leg = animations.duration.slower;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: leg, useNativeDriver: false }),
        Animated.timing(pulse, { toValue: 0.35, duration: leg, useNativeDriver: false }),
      ]),
      { iterations: 3 },
    );
    loop.start(() => pulse.setValue(1));
    return () => { clearTimeout(id); loop.stop(); };
  }, [active, reduced]);

  if (!active) return <View style={style}>{children}</View>;

  return (
    <Animated.View
      ref={ref}
      style={[
        hl.wrap,
        colors.elevation.selected,
        {
          borderColor: colors.primary,
          backgroundColor: pulse.interpolate({
            inputRange: [0, 1],
            outputRange: [withAlpha(colors.primary, 0), withAlpha(colors.primary, 0.1)],
          }),
        },
        style,
      ]}
    >
      {children}
    </Animated.View>
  );
};

const hl = StyleSheet.create({
  wrap: {
    borderRadius: radius.card,
    padding: spacing.md,
    // The wrapped FormField brings its own bottom margin inside the outline.
    paddingBottom: 0,
    marginBottom: spacing.md,
  },
});

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
          <Text style={{ ...typography.styles.body, color: colors.text.secondary }} maxFontSizeMultiplier={1.3}>
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
                <Text style={{ ...typography.styles.label, color: on ? colors.onPrimary : colors.text.primary }} maxFontSizeMultiplier={1.3}>
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

/**
 * Schema-driven attribute fields plus the price block (when the category
 * has `has_price`). Price lives here rather than in the screen so the
 * `format="currency"` input and the rejection highlight share one path.
 *
 * `highlightKey` — a `FieldDef.key` or the base key `price` — outlines that
 * field and scrolls it into view; see `FieldHighlight`.
 */
const DynamicForm = ({
  fields = [],
  schema = null,
  formData = {},
  updateFormData,
  formErrors = {},
  inputRefs,
  highlightKey = null,
  scrollViewRef,
}) => {
  const { colors, styles: gStyles } = useAppTheme();
  const { t, i18n } = useTranslation();

  const hasPrice = !!schema?.has_price;
  if (!fields.length && !hasPrice) return null;

  const setRef = (key, ref) => {
    if (inputRefs?.current) inputRefs.current[key] = ref;
  };

  // Required fields render upfront; optional ones sit behind a disclosure.
  // A highlighted optional field is promoted so the outline is not hidden
  // behind a collapsed section.
  const core = fields.filter((f) => (f.group ?? 'core') === 'core' || f.key === highlightKey);
  const details = fields.filter((f) => f.group === 'details' && f.key !== highlightKey);

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

    let node;
    if (field.type === 'select') {
      node = <SelectField field={field} value={value} onChange={onChange} error={error} />;
    } else if (field.type === 'boolean') {
      node = <BooleanField field={field} value={value} onChange={onChange} error={error} />;
    } else if (field.type === 'multiselect') {
      node = <MultiSelectField field={field} value={value} onChange={onChange} error={error} />;
    } else {
      const label = fieldLabel(field, t, i18n.language);
      const isTextarea = field.type === 'textarea';
      const nextKey = isTextarea ? undefined : chainKeys[chainKeys.indexOf(field.key) + 1];
      const keyboardType =
        field.type === 'number' ? 'numeric' :
        field.type === 'phone' ? 'phone-pad' :
        'default';

      node = (
        <FormField
          label={label}
          required={!!field.required}
          error={error}
          component={
            <RNTextInput
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
              maxFontSizeMultiplier={1.3}
              ref={(ref) => setRef(field.key, ref)}
            />
          }
        />
      );
    }

    return (
      <FieldHighlight key={field.key} active={highlightKey === field.key} scrollViewRef={scrollViewRef}>
        {node}
      </FieldHighlight>
    );
  };

  const priceRaw = String(formData.price_amount ?? '');
  const pricePreview = priceRaw ? formatPrice(priceRaw, formData.price_unit) : null;

  return (
    <View>
      {fields.length > 0 && (
        <>
          <View style={gStyles.sectionHeader}>
            <Text style={[gStyles.sectionSubtitle, { color: colors.text.secondary }]} maxFontSizeMultiplier={1.3}>
              {t('form.categoryDetails')}
            </Text>
          </View>
          {core.map(renderField)}
          {details.length > 0 && (
            <CollapsibleSection title={t('form.moreDetails')}>
              {details.map(renderField)}
            </CollapsibleSection>
          )}
        </>
      )}

      {hasPrice && (
        <View>
          <View style={gStyles.sectionHeader}>
            <Text style={[gStyles.sectionSubtitle, { color: colors.text.secondary }]} maxFontSizeMultiplier={1.3}>
              {t('form.priceSection')}
            </Text>
          </View>
          <FieldHighlight active={highlightKey === 'price'} scrollViewRef={scrollViewRef}>
            <FormField
              label={t('form.priceAmount')}
              hint={pricePreview ? t('form.priceHintPreview', { preview: pricePreview }) : t('form.priceHint')}
              component={
                <TextInput
                  format="currency"
                  value={priceRaw}
                  onChangeText={(raw) => updateFormData('price_amount', raw)}
                  placeholder="0"
                  containerStyle={{ marginBottom: 0 }}
                  style={{ backgroundColor: colors.surface }}
                  error={formErrors.price_amount}
                  ref={(ref) => setRef('price_amount', ref)}
                />
              }
            />
            <FormField
              label={t('form.priceUnit')}
              style={{ marginBottom: 0 }}
              component={
                <PickerField
                  value={formData.price_unit}
                  options={PRICE_UNITS.map((u) => ({ value: u, label: getPriceUnitLabel(u) }))}
                  onSelect={(v) => updateFormData('price_unit', v)}
                  placeholder={t('form.priceUnit')}
                  title={t('form.priceUnit')}
                />
              }
            />
          </FieldHighlight>
        </View>
      )}
    </View>
  );
};

export default DynamicForm;

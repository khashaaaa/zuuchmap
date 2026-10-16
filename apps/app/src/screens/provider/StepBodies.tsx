import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Image, Pressable, Text, View } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { useTranslation } from 'react-i18next';
import { categoryColor } from '@zuuchmap/tokens';
import {
  DISTRICT_CODES, PRICE_UNITS, PROVINCE_CODES, formatPrice, groupThousands, listingHealth, nearestPlace,
  type CategoryFamilyView, type CategoryView,
} from '@zuuchmap/core';
import { themedStyles, useAppTheme } from '../../design/theme';
import { placeLabel } from '../../lib/browse';
import { UB, getGeoState, useGeo } from '../../lib/geo';
import { optionLabel } from '../../lib/provider';
import { DETAILS_MAX, TITLE_MAX, type FieldErrors, type WizardForm } from '../../lib/wizard';
import { MAX_PHOTOS, type PhotoItem } from '../../lib/photos';
import { Banner } from '../../ui/Banner';
import { BottomSheet } from '../../ui/BottomSheet';
import { Button } from '../../ui/Button';
import { Chip } from '../../ui/Chip';
import { Icon } from '../../ui/Icon';
import { ListingCard } from '../../ui/ListingCard';
import { ListingHealthRing } from '../../ui/ListingHealthRing';
import { PressableScale } from '../../ui/PressableScale';
import { Radio } from '../../ui/Radio';
import { Select } from '../../ui/Select';
import { Switch } from '../../ui/Switch';
import { TextField } from '../../ui/TextField';
import { useToast } from '../../ui/Toast';
import { useLocale } from '../../ui/useLocale';

const useStyles = themedStyles((t) => ({
  group: { ...t.type.overline, color: t.colors.textSecondary, paddingTop: 8 },
  h: { ...t.type.h3, color: t.colors.textPrimary },
  body: { ...t.type.caption, color: t.colors.textSecondary },
  card: { borderRadius: t.radius.card, backgroundColor: t.colors.bgSurface, overflow: 'hidden' },
  row: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 8 },
  tile: { width: 40, height: 40, borderRadius: t.radius.md, alignItems: 'center', justifyContent: 'center' },
  name: { ...t.type.bodyBold, color: t.colors.textPrimary },
  rule: { height: 1, marginLeft: 64, backgroundColor: t.colors.borderSubtle },
  err: { ...t.type.small, color: t.colors.statusDanger },
  photo: { width: 88, height: 88, borderRadius: t.radius.md, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderStyle: 'dashed', borderColor: t.colors.borderStrong, gap: 4 },
  review: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12 },
  rLabel: { ...t.type.small, color: t.colors.textSecondary },
  rValue: { ...t.type.bodyMedium, color: t.colors.textPrimary },
}));

export interface StepProps {
  form: WizardForm;
  set: (patch: Partial<WizardForm>) => void;
  errors: FieldErrors;
  cat: CategoryView | undefined;
  /** Edit mode: the category cannot change. */
  locked: boolean;
}

const Err = ({ text }: { text?: string }) => {
  const s = useStyles();
  return text ? <Text style={s.err}>{text}</Text> : null;
};

// ---- Step 1: category and type ----

export function StepCategory({ form, set, errors, cats, families, locked }: Omit<StepProps, 'cat'> & { cats: CategoryView[]; families: CategoryFamilyView[] }) {
  const s = useStyles();
  const { colors, scheme } = useAppTheme();
  const { t } = useTranslation();
  const [typeFor, setTypeFor] = useState<CategoryView | null>(null);
  const [typeOpen, setTypeOpen] = useState(false);
  const [pending, setPending] = useState<string | null>(null);

  const pick = (c: CategoryView) => {
    if (locked && c.key !== form.category) return;
    if (c.subcategories.length > 0) {
      setTypeFor(c);
      setPending(c.key === form.category ? form.subcategory : null);
      setTypeOpen(true);
    } else {
      set({ category: c.key, subcategory: null, price_unit: c.default_price_unit, attrs: c.key === form.category ? form.attrs : {} });
    }
  };
  const confirmType = () => {
    if (!typeFor || !pending) return;
    set({ category: typeFor.key, subcategory: pending, price_unit: typeFor.key === form.category ? form.price_unit : typeFor.default_price_unit, attrs: typeFor.key === form.category ? form.attrs : {} });
    setTypeOpen(false);
  };
  const subLabel = (c: CategoryView) => (c.key === form.category ? c.subcategories.find((x) => x.value === form.subcategory)?.label : undefined);

  return (
    <View style={{ gap: 8 }}>
      <Text style={s.h} accessibilityRole="header">{t('prov.wizard.q1')}</Text>
      <Text style={s.body}>{t('prov.wizard.q1Body')}</Text>
      {families.map((f) => {
        const rows = cats.filter((c) => f.categories.includes(c.key));
        if (rows.length === 0) return null;
        return (
          <View key={f.key} style={{ gap: 8 }}>
            <Text style={s.group} accessibilityRole="header">{f.label}</Text>
            <View style={s.card}>
              {rows.map((c, i) => {
                const fill = categoryColor(c.key, scheme).fill;
                const on = form.category === c.key;
                return (
                  <View key={c.key}>
                    {i > 0 ? <View style={s.rule} /> : null}
                    <PressableScale
                      accessibilityRole="radio"
                      accessibilityState={{ selected: on, disabled: locked && !on }}
                      accessibilityLabel={c.label}
                      onPress={() => pick(c)}
                      contentStyle={[s.row, locked && !on ? { opacity: 0.4 } : null]}
                    >
                      <View style={[s.tile, { backgroundColor: fill + '29' }]}><Icon name={c.icon} categoryKey={c.key} size={22} color={fill} /></View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.name} numberOfLines={1}>{c.label}</Text>
                        {subLabel(c) ? <Text style={s.body}>{subLabel(c)}</Text> : null}
                      </View>
                      {on ? <Icon name="circle-check" size={22} color={colors.iconAccent} /> : <Icon name="chevron-right" size={20} color={colors.iconSecondary} />}
                    </PressableScale>
                  </View>
                );
              })}
            </View>
          </View>
        );
      })}
      <Err text={errors.category ?? errors.subcategory} />
      <BottomSheet
        visible={typeOpen}
        onClose={() => setTypeOpen(false)}
        title={t('prov.wizard.whichType', { category: typeFor?.label ?? '' })}
        footerLabel={t('prov.wizard.continue')}
        footerDisabled={!pending}
        onFooter={confirmType}
      >
        {typeFor?.subcategories.map((x) => <Radio key={x.value} label={x.label} selected={pending === x.value} onPress={() => setPending(x.value)} />)}
      </BottomSheet>
    </View>
  );
}

// ---- Step 2: details ----

function AttrField({ f, value, onChange, error }: { f: CategoryView['fields'][number]; value: unknown; onChange: (v: unknown) => void; error?: string }) {
  const s = useStyles();
  const { t } = useTranslation();
  const label = f.required ? f.label : `${f.label} · ${t('prov.company.optional')}`;
  switch (f.type) {
    case 'boolean':
      return (
        <View style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Text style={[s.name, { flex: 1 }]}>{label}</Text>
          <Switch label={f.label} value={value === true} onValueChange={onChange} />
        </View>
      );
    case 'select':
      return (
        <View style={{ gap: 4 }}>
          <Select label={label} placeholder={t('form.selectPlaceholder', { field: f.label })} value={typeof value === 'string' ? value : null} onChange={onChange} options={(f.options ?? []).map((o) => ({ value: o, label: optionLabel(t, f, o) }))} />
          <Err text={error} />
        </View>
      );
    case 'multiselect': {
      const cur = Array.isArray(value) ? (value as string[]) : [];
      return (
        <View style={{ gap: 6 }}>
          <Text style={s.name}>{label}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {(f.options ?? []).map((o) => (
              <Chip key={o} label={optionLabel(t, f, o)} selected={cur.includes(o)} onPress={() => onChange(cur.includes(o) ? cur.filter((x) => x !== o) : [...cur, o])} />
            ))}
          </View>
          <Err text={error} />
        </View>
      );
    }
    case 'number':
      return (
        <TextField
          label={label}
          value={value === undefined || value === null ? '' : String(value)}
          onChangeText={(v) => onChange(v.replace(/[^\d.]/g, ''))}
          inputMode="numeric"
          placeholder={f.placeholder ? t('form.example', { value: f.placeholder }) : undefined}
          helper={f.unit}
          error={error}
        />
      );
    case 'phone':
      return <TextField label={label} value={typeof value === 'string' ? value : ''} onChangeText={onChange} inputMode="tel" placeholder={f.placeholder ? t('form.example', { value: f.placeholder }) : undefined} error={error} />;
    case 'textarea':
      return <TextField label={label} value={typeof value === 'string' ? value : ''} onChangeText={onChange} multiline placeholder={f.placeholder ? t('form.example', { value: f.placeholder }) : undefined} error={error} />;
    default:
      return <TextField label={label} value={typeof value === 'string' ? value : ''} onChangeText={onChange} placeholder={f.placeholder ? t('form.example', { value: f.placeholder }) : f.type === 'date' ? 'YYYY-MM-DD' : undefined} error={error} />;
  }
}

export interface PhotoProps {
  photos: PhotoItem[];
  unavailable: boolean;
  onAdd: () => void;
  onRemove: (id: string) => void;
  onRetry: (id: string) => void;
  onCover: (id: string) => void;
}

export function StepDetails({ form, set, errors, cat, photoProps }: StepProps & { photoProps: PhotoProps }) {
  const s = useStyles();
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const { photos } = photoProps;
  const failed = photos.filter((p) => p.state === 'failed');
  const core = (cat?.fields ?? []).filter((f) => f.required || (f as { group?: string }).group === 'core');
  const more = (cat?.fields ?? []).filter((f) => !core.includes(f));
  const setAttr = (key: string) => (v: unknown) => set({ attrs: { ...form.attrs, [key]: v } });
  const n = form.title.trim().length;
  return (
    <View style={{ gap: 16 }}>
      <View style={{ gap: 8 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={s.name}>{t('prov.wizard.photos')}</Text>
          <Text style={s.body}>{t('prov.wizard.photosCount', { count: photos.length, max: MAX_PHOTOS })}</Text>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {photos.map((p, i) => <PhotoTile key={p.id} item={p} cover={i === 0} {...photoProps} />)}
          {photos.length < MAX_PHOTOS ? (
            <Pressable accessibilityRole="button" accessibilityLabel={t('prov.wizard.addPhoto')} style={s.photo} onPress={photoProps.onAdd}>
              <Icon name="camera" size={22} color={colors.iconSecondary} />
              <Text style={s.body}>{t('prov.wizard.addPhoto')}</Text>
            </Pressable>
          ) : null}
        </View>
        {failed.length > 0 ? <Banner tone="danger" title={t('prov.wizard.photoFailed', { count: failed.length })} body={t('prov.wizard.photoFailedBody', { count: failed.length })} actionLabel={t('prov.wizard.retry')} onAction={() => failed.forEach((p) => photoProps.onRetry(p.id))} /> : null}
        <Text style={s.body}>{photoProps.unavailable ? t('prov.wizard.photosUnavailable') : t('prov.wizard.photoTip')}</Text>
      </View>

      <TextField
        label={t('prov.wizard.titleLabel')}
        value={form.title}
        onChangeText={(v) => set({ title: v })}
        maxLength={TITLE_MAX}
        helper={t('prov.wizard.titleHint', { count: n, max: TITLE_MAX })}
        error={errors.title}
      />
      {core.map((f) => <AttrField key={f.key} f={f} value={form.attrs[f.key]} onChange={setAttr(f.key)} error={errors[f.key]} />)}
      <TextField
        label={t('prov.wizard.details')}
        value={form.details}
        onChangeText={(v) => set({ details: v })}
        multiline
        maxLength={DETAILS_MAX}
        placeholder={t('prov.wizard.detailsPlaceholder')}
        error={errors.details}
      />
      {more.map((f) => <AttrField key={f.key} f={f} value={form.attrs[f.key]} onChange={setAttr(f.key)} error={errors[f.key]} />)}

      <View style={{ gap: 8 }}>
        <Text style={s.group}>{t('prov.wizard.preview')}</Text>
        <ListingCard
          title={form.title.trim() || cat?.label || ''}
          categoryKey={form.category ?? 'machineryrent'}
          categoryIcon={cat?.icon}
          photoUri={photos.find((p) => p.state !== 'failed')?.uri ?? null}
          meta={placeLabel(t, form.province, form.district) ?? t('prov.wizard.locationLater')}
          price={Number(form.price) > 0 ? { amount: form.price, unit: form.price_unit } : null}
        />
        {Number(form.price) > 0 ? null : <Text style={s.body}>{t('prov.wizard.priceLater')}</Text>}
      </View>
    </View>
  );
}

function PhotoTile({ item, cover, onRemove, onRetry, onCover }: { item: PhotoItem; cover: boolean } & PhotoProps) {
  const { colors, type, radius } = useAppTheme();
  const { t } = useTranslation();
  return (
    <View style={{ width: 88, height: 88, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.bgSurfaceSunken, borderWidth: item.state === 'failed' ? 2 : 0, borderColor: colors.statusDanger }}>
      <Pressable accessibilityRole="button" accessibilityLabel={cover ? t('prov.wizard.cover') : t('prov.wizard.photos')} disabled={cover || item.state !== 'done'} onPress={() => onCover(item.id)} style={{ flex: 1 }}>
        <Image source={{ uri: item.uri }} style={{ width: '100%', height: '100%', opacity: item.state === 'done' ? 1 : 0.5 }} accessibilityIgnoresInvertColors />
      </Pressable>
      {item.state === 'uploading' ? <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={colors.iconPrimary} /></View> : null}
      {item.state === 'failed' ? (
        <Pressable accessibilityRole="button" accessibilityLabel={t('prov.wizard.retry')} onPress={() => onRetry(item.id)} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="refresh-cw" size={24} color={colors.statusDanger} />
        </Pressable>
      ) : null}
      {cover && item.state === 'done' ? <Text style={[type.micro, { position: 'absolute', left: 4, bottom: 4, paddingHorizontal: 6, borderRadius: 6, color: colors.textOnMedia, backgroundColor: colors.bgMediaScrim }]}>{t('prov.wizard.cover')}</Text> : null}
      <Pressable accessibilityRole="button" accessibilityLabel={t('common.delete')} hitSlop={6} onPress={() => onRemove(item.id)} style={{ position: 'absolute', top: 4, right: 4, width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bgMediaScrim }}>
        <Icon name="x" size={14} color={colors.textOnMedia} />
      </Pressable>
    </View>
  );
}

// ---- Step 3: price and dates ----

export function StepPrice({ form, set, errors, cat, onBlockDays }: StepProps & { onBlockDays?: () => void }) {
  const s = useStyles();
  const { t } = useTranslation();
  const locale = useLocale();
  return (
    <View style={{ gap: 16 }}>
      {cat?.has_price ? (
        <>
          <TextField
            label={t('prov.wizard.price')}
            value={groupThousands(form.price)}
            onChangeText={(v) => set({ price: v.replace(/\D/g, '').slice(0, 13) })}
            inputMode="numeric"
            helper={form.price ? (formatPrice(form.price, form.price_unit, locale, t as never) ?? t('prov.wizard.priceHint')) : t('prov.wizard.priceHint')}
            error={errors.price_amount}
          />
          <View style={{ gap: 4 }}>
            <Select
              label={t('prov.wizard.unit')}
              placeholder={t('form.priceUnit')}
              value={form.price_unit}
              onChange={(v) => set({ price_unit: v })}
              options={PRICE_UNITS.map((u) => ({ value: u, label: t(`priceUnit.${u}`) }))}
            />
            <Err text={errors.price_unit} />
          </View>
        </>
      ) : (
        <Text style={s.body}>{t('prov.wizard.priceLater')}</Text>
      )}
      {cat?.has_availability_dates ? (
        <View style={{ gap: 8 }}>
          <Text style={s.h} accessibilityRole="header">{t('prov.wizard.availability')}</Text>
          <Text style={s.name}>{t('prov.wizard.allFree')}</Text>
          <Text style={s.body}>{t('prov.wizard.blockHint')}</Text>
          {onBlockDays ? <Button label={t('prov.wizard.blockDays')} icon="calendar" variant="outline" size="medium" onPress={onBlockDays} /> : null}
        </View>
      ) : null}
    </View>
  );
}

// ---- Step 4: location ----

export function StepLocation({ form, set, errors }: StepProps) {
  const s = useStyles();
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const geo = useGeo();
  const toast = useToast();
  const at = form.lat !== null && form.lng !== null ? { latitude: form.lat, longitude: form.lng } : null;
  const center = at ?? { latitude: UB.lat, longitude: UB.lng };

  const locateMe = async () => {
    await geo.ask(true);
    const { coords } = getGeoState();
    // An empty province is pre-filled from the fix; a picked one is never overwritten.
    if (coords) set({ lat: coords.lat, lng: coords.lng, ...(form.province ? {} : nearestPlace(coords.lat, coords.lng)) });
    else toast.show({ message: t('provider.locationCurrentFail'), kind: 'error' });
  };

  return (
    <View style={{ gap: 16 }}>
      <View style={{ gap: 2 }}>
        <Text style={s.h} accessibilityRole="header">{t('prov.wizard.whereTitle')}</Text>
        <Text style={s.body}>{t('prov.wizard.whereBody')}</Text>
      </View>
      <View style={{ gap: 4 }}>
        <Select
          label={t('prov.wizard.province')}
          placeholder={t('common.province')}
          value={form.province}
          onChange={(v) => set({ province: v, district: v === 'ULAANBAATAR' ? form.district : null })}
          options={PROVINCE_CODES.map((p) => ({ value: p, label: placeLabel(t as never, p) ?? p }))}
        />
        <Err text={errors.province} />
      </View>
      {form.province === 'ULAANBAATAR' ? (
        <Select
          label={t('prov.wizard.district')}
          placeholder={t('kit.pickDistrict')}
          value={form.district}
          onChange={(v) => set({ district: v })}
          options={DISTRICT_CODES.map((d) => ({ value: d, label: placeLabel(t as never, null, d) ?? d }))}
        />
      ) : null}
      <TextField label={t('prov.wizard.address')} value={form.address} onChangeText={(v) => set({ address: v })} maxLength={300} icon="map-pin" />
      <Button label={t('prov.wizard.useMyLocation')} icon="locate" variant="outline" size="medium" onPress={() => void locateMe()} />
      <View style={{ height: 200, borderRadius: 16, overflow: 'hidden', backgroundColor: colors.bgSurfaceSunken }}>
        <MapView
          key={at ? `${at.latitude.toFixed(4)},${at.longitude.toFixed(4)}` : 'ub'}
          provider={PROVIDER_GOOGLE}
          style={{ flex: 1 }}
          initialRegion={{ ...center, latitudeDelta: at ? 0.02 : 0.12, longitudeDelta: at ? 0.02 : 0.12 }}
          onPress={(e) => set({ lat: e.nativeEvent.coordinate.latitude, lng: e.nativeEvent.coordinate.longitude })}
        >
          {at ? <Marker coordinate={at} draggable onDragEnd={(e) => set({ lat: e.nativeEvent.coordinate.latitude, lng: e.nativeEvent.coordinate.longitude })} /> : null}
        </MapView>
      </View>
      <Text style={s.body}>{t('prov.wizard.pinHint')}</Text>
    </View>
  );
}

// ---- Step 5: review ----

export function StepReview({ form, cat, photoCount, onEdit, children }: Omit<StepProps, 'set' | 'errors' | 'locked'> & { photoCount: number; onEdit: (step: number) => void; children?: ReactNode }) {
  const s = useStyles();
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const locale = useLocale();
  const health = listingHealth({ imageCount: photoCount, attributes: form.attrs, details: form.details, price: form.price, schema: cat });
  const priceText = form.price ? formatPrice(form.price, form.price_unit, locale, t as never) : null;
  const rows: Array<{ step: number; label: string; value: string }> = [
    { step: 1, label: t('prov.wizard.rowCategory'), value: [cat?.label, cat?.subcategories.find((x) => x.value === form.subcategory)?.label].filter(Boolean).join(' · ') },
    { step: 2, label: t('prov.wizard.titleLabel'), value: form.title.trim() },
    ...(cat?.has_price ? [{ step: 3, label: t('prov.wizard.rowPrice'), value: priceText ?? '—' }] : []),
    { step: 4, label: t('prov.wizard.rowLocation'), value: [placeLabel(t as never, form.province, form.district), form.address.trim()].filter(Boolean).join(' · ') || '—' },
    ...(cat?.has_availability_dates ? [{ step: 3, label: t('prov.wizard.rowDays'), value: t('prov.wizard.allFree') }] : []),
  ];
  const hints: Record<string, string> = { photos: 'provider.healthPhotos', attributes: 'provider.healthAttributes', details: 'provider.healthDetails', price: 'provider.healthPrice' };
  return (
    <View style={{ gap: 16 }}>
      <Text style={s.body}>{t('prov.wizard.reviewBody')}</Text>
      <View style={[s.card, { paddingHorizontal: 16 }]}>
        {rows.map((r, i) => (
          <View key={r.label}>
            {i > 0 ? <View style={{ height: 1, backgroundColor: colors.borderSubtle }} /> : null}
            <Pressable accessibilityRole="button" accessibilityLabel={`${r.label}: ${r.value}`} style={s.review} onPress={() => onEdit(r.step)}>
              <View style={{ flex: 1 }}>
                <Text style={s.rLabel}>{r.label}</Text>
                <Text style={s.rValue} numberOfLines={2}>{r.value}</Text>
              </View>
              <Icon name="pencil" size={18} color={colors.iconSecondary} />
            </Pressable>
          </View>
        ))}
      </View>
      <View style={[s.card, { padding: 16, flexDirection: 'row', gap: 16, alignItems: 'center' }]}>
        <ListingHealthRing percent={health.score} size={64} label="" />
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={s.name}>{health.missing.length === 0 ? t('prov.wizard.good') : t('prov.perf.healthPct', { pct: health.score })}</Text>
          {health.missing.length === 0 ? <Text style={s.body}>{t('prov.wizard.goodBody')}</Text> : health.missing.map((m) => <Text key={m} style={s.body}>{`• ${t(hints[m])}`}</Text>)}
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        <Icon name="clock" size={16} color={colors.iconSecondary} />
        <Text style={[s.body, { flex: 1 }]}>{t('prov.wizard.adminTime')}</Text>
      </View>
      {children}
    </View>
  );
}

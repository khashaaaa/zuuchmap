import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { DISTRICT_CODES, PRICE_UNITS, PROVINCE_CODES, SAVED_SEARCH_LIMIT, countDays, type CategoryView } from '@zuuchmap/core';
import { themedStyles, useAppTheme } from '../../design/theme';
import { ApiError, errorText } from '../../lib/api';
import { placeLabel, setBrowse, toSavedParams, type BrowseState } from '../../lib/browse';
import { quickRange, shortRange, toYmd, fromYmd, type QuickRange } from '../../lib/dates';
import { useBrowseCount, useSavedSearches, useSaveSearch } from '../../lib/queries';
import { BottomSheet } from '../../ui/BottomSheet';
import { askPush } from '../../ui/PushPromptSheet';
import { Checkbox } from '../../ui/Checkbox';
import { Chip } from '../../ui/Chip';
import { DateRangeCalendar, type DateRange } from '../../ui/DateRangeCalendar';
import { Banner } from '../../ui/Banner';
import { Switch } from '../../ui/Switch';
import { TextField } from '../../ui/TextField';
import { useToast } from '../../ui/Toast';
import { useLocale } from '../../ui/useLocale';

const useStyles = themedStyles((t) => ({
  group: { gap: 10 },
  cap: { ...t.type.overline, color: t.colors.textSecondary },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  two: { flexDirection: 'row', gap: 12 },
  small: { ...t.type.small, color: t.colors.textSecondary },
  summary: { padding: 14, borderRadius: t.radius.lg, backgroundColor: t.colors.bgSurfaceSunken },
  summaryText: { ...t.type.labelStrong, color: t.colors.textPrimary },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48, gap: 12 },
  rowText: { ...t.type.bodyMedium, color: t.colors.textPrimary, flex: 1 },
}));

const upper1 = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const digits = (v: string) => v.replace(/\D/g, '');

// ---- A3: dates ----

export function DatesSheet({ visible, onClose, state }: { visible: boolean; onClose: () => void; state: BrowseState }) {
  const s = useStyles();
  const { t } = useTranslation();
  const locale = useLocale();
  const [range, setRange] = useState<DateRange>({ start: null, end: null });
  useEffect(() => {
    if (visible) setRange({ start: state.date_from ? fromYmd(state.date_from) : null, end: state.date_to ? fromYmd(state.date_to) : null });
  }, [visible, state.date_from, state.date_to]);

  const from = range.start ? toYmd(range.start) : undefined;
  const to = range.end ? toYmd(range.end) : undefined;
  const complete = !!from && !!to;
  const count = useBrowseCount({ ...state, date_from: complete ? from : undefined, date_to: complete ? to : undefined }, visible);
  const days = countDays(from, to);

  const quick: QuickRange[] = ['today', 'tomorrow', 'weekend', 'week'];
  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={t('customer.dates.title')}
      secondaryLabel={t('common.clear')}
      onSecondary={() => setRange({ start: null, end: null })}
      footerLabel={t('customer.filter.show', { count: count.data ?? 0 })}
      onFooter={() => {
        setBrowse({ date_from: complete ? from : undefined, date_to: complete ? to : undefined });
        onClose();
      }}
    >
      <View style={s.group}>
        <Text style={s.cap}>{t('customer.dates.quick')}</Text>
        <View style={s.wrap}>
          {quick.map((k) => (
            <Chip
              key={k}
              label={t(`customer.dates.${k}`)}
              onPress={() => {
                const [a, b] = quickRange(k);
                setRange({ start: a, end: b });
              }}
            />
          ))}
        </View>
      </View>
      <DateRangeCalendar value={range} onChange={setRange} />
      {complete ? (
        <View style={s.summary}>
          <Text style={s.summaryText}>{`${shortRange(from, to, locale)} · ${t('ui.days', { days })}`}</Text>
        </View>
      ) : null}
    </BottomSheet>
  );
}

// ---- A4: filters ----

const SORTS: BrowseState['sort'][] = ['relevance', 'newest', 'price_asc', 'price_desc'];

/** `WEEKDAY_DAY` → `attrs.weekdayDay`; an unknown code reads as itself. */
function optionKey(code: string): string {
  const camel = code.toLowerCase().replace(/_([a-z0-9])/g, (_m, c: string) => c.toUpperCase());
  return code === 'PROVINCE' ? 'coverageProvince' : camel;
}

export function FilterSheet({ visible, onClose, state, category }: { visible: boolean; onClose: () => void; state: BrowseState; category?: CategoryView }) {
  const s = useStyles();
  const { t } = useTranslation();
  const [draft, setDraft] = useState(state);
  useEffect(() => {
    if (visible) setDraft(state);
  }, [visible, state]);
  const count = useBrowseCount(draft, visible);
  const patch = (p: Partial<BrowseState>) => setDraft((d) => ({ ...d, ...p }));
  const setAttr = (k: string, v: string) =>
    setDraft((d) => {
      const attrs = { ...d.attrs };
      if (v === '') delete attrs[k];
      else attrs[k] = v;
      return { ...d, attrs };
    });

  const unit = draft.price_unit;
  const filterable = (category?.fields ?? []).filter((f) => f.filterable);
  const units = PRICE_UNITS.filter((u) => u !== 'PIECE');

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={t('customer.filter.title')}
      secondaryLabel={t('common.clear')}
      onSecondary={() => setDraft({ ...draft, subcategory: undefined, price_unit: undefined, price_min: undefined, price_max: undefined, attrs: {}, sort: 'relevance' })}
      footerLabel={t('customer.filter.show', { count: count.data ?? 0 })}
      onFooter={() => {
        setBrowse({ subcategory: draft.subcategory, price_unit: draft.price_unit, price_min: draft.price_min, price_max: draft.price_max, attrs: draft.attrs, sort: draft.sort });
        onClose();
      }}
    >
      {category && category.subcategories.length > 0 ? (
        <View style={s.group}>
          <Text style={s.cap}>{t('customer.filter.typeOf', { category: category.label })}</Text>
          <View style={s.wrap}>
            {category.subcategories.map((sub) => (
              <Chip key={sub.value} label={sub.label} selected={draft.subcategory === sub.value} onPress={() => patch({ subcategory: draft.subcategory === sub.value ? undefined : sub.value })} />
            ))}
          </View>
        </View>
      ) : null}

      <View style={s.group}>
        <Text style={s.cap}>{t('customer.filter.price')}</Text>
        <View style={s.wrap}>
          {units.map((u) => (
            <Chip
              key={u}
              label={upper1(t(`priceUnit.${u}`))}
              selected={unit === u}
              onPress={() => patch(unit === u ? { price_unit: undefined, price_min: undefined, price_max: undefined } : { price_unit: u })}
            />
          ))}
        </View>
        <Text style={s.small}>{t('customer.filter.unitNote')}</Text>
        <View style={s.two}>
          <View style={{ flex: 1 }}>
            <TextField label={t('customer.filter.min')} value={draft.price_min !== undefined ? String(draft.price_min) : ''} placeholder="0 ₮" disabled={!unit} inputMode="numeric" keyboardType="number-pad" onChangeText={(v) => patch({ price_min: digits(v) ? Number(digits(v)) : undefined })} />
          </View>
          <View style={{ flex: 1 }}>
            <TextField label={t('customer.filter.max')} value={draft.price_max !== undefined ? String(draft.price_max) : ''} placeholder="₮" disabled={!unit} inputMode="numeric" keyboardType="number-pad" onChangeText={(v) => patch({ price_max: digits(v) ? Number(digits(v)) : undefined })} />
          </View>
        </View>
      </View>

      {filterable.map((f) => {
        if (f.type === 'boolean') {
          return <Checkbox key={f.key} label={f.label} checked={draft.attrs[f.key] === 'true'} onChange={(on) => setAttr(f.key, on ? 'true' : '')} />;
        }
        if (f.type === 'select') {
          return (
            <View key={f.key} style={s.group}>
              <Text style={s.cap}>{f.label}</Text>
              <View style={s.wrap}>
                {(f.options ?? []).map((o) => (
                  <Chip key={o} label={t(`attrs.${optionKey(o)}`, { defaultValue: o })} selected={draft.attrs[f.key] === o} onPress={() => setAttr(f.key, draft.attrs[f.key] === o ? '' : o)} />
                ))}
              </View>
            </View>
          );
        }
        if (f.type === 'number') {
          return (
            <View key={f.key} style={s.group}>
              <Text style={s.cap}>{f.label}</Text>
              <View style={s.two}>
                <View style={{ flex: 1 }}>
                  <TextField label={t('customer.filter.min')} value={draft.attrs[`${f.key}_min`] ?? ''} inputMode="numeric" keyboardType="number-pad" onChangeText={(v) => setAttr(`${f.key}_min`, digits(v))} />
                </View>
                <View style={{ flex: 1 }}>
                  <TextField label={t('customer.filter.max')} value={draft.attrs[`${f.key}_max`] ?? ''} inputMode="numeric" keyboardType="number-pad" onChangeText={(v) => setAttr(`${f.key}_max`, digits(v))} />
                </View>
              </View>
            </View>
          );
        }
        return <TextField key={f.key} label={f.label} value={draft.attrs[f.key] ?? ''} onChangeText={(v) => setAttr(f.key, v)} />;
      })}

      <View style={s.group}>
        <Text style={s.cap}>{t('filter.sortBy')}</Text>
        <View style={s.wrap}>
          {SORTS.map((k) => (
            <Chip key={k} label={t(`sort.${k}`)} selected={draft.sort === k} onPress={() => patch({ sort: k })} />
          ))}
        </View>
      </View>
    </BottomSheet>
  );
}

// ---- Province (and, for Ulaanbaatar, district) picker ----

export function ProvinceSheet({ visible, onClose, province, district, onPick }: { visible: boolean; onClose: () => void; province?: string; district?: string; onPick: (province?: string, district?: string) => void }) {
  const s = useStyles();
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  return (
    <BottomSheet visible={visible} onClose={onClose} title={t('common.province')} secondaryLabel={province ? t('common.clear') : undefined} onSecondary={() => { onPick(undefined, undefined); onClose(); }}>
      <Pressable
        onPress={() => { onPick(undefined, undefined); onClose(); }}
        accessibilityRole="radio"
        accessibilityState={{ selected: !province }}
        style={s.row}
      >
        <Text style={[s.rowText, !province && { color: colors.textLink }]}>{t('customer.landing.allProvinces')}</Text>
      </Pressable>
      {province === 'ULAANBAATAR' ? (
        <View style={s.group}>
          <Text style={s.cap}>{t('common.district')}</Text>
          <View style={s.wrap}>
            {DISTRICT_CODES.map((d) => (
              <Chip key={d} label={t(`district.${d}`)} selected={district === d} onPress={() => { onPick('ULAANBAATAR', district === d ? undefined : d); onClose(); }} />
            ))}
          </View>
        </View>
      ) : null}
      {PROVINCE_CODES.map((p) => (
        <Pressable
          key={p}
          onPress={() => {
            onPick(p, undefined);
            if (p !== 'ULAANBAATAR') onClose();
          }}
          accessibilityRole="radio"
          accessibilityState={{ selected: province === p }}
          style={s.row}
        >
          <Text style={[s.rowText, province === p && { color: colors.textLink }]}>{placeLabel(t, p)}</Text>
        </Pressable>
      ))}
    </BottomSheet>
  );
}

// ---- C12 / C14: save this search ----

export function SaveSearchSheet({ visible, onClose, state }: { visible: boolean; onClose: () => void; state: BrowseState }) {
  const s = useStyles();
  const { t } = useTranslation();
  const toast = useToast();
  const qc = useQueryClient();
  const saved = useSavedSearches();
  const save = useSaveSearch();
  const [name, setName] = useState('');
  const [notify, setNotify] = useState(true);
  const used = saved.data?.length ?? 0;
  const atLimit = used >= SAVED_SEARCH_LIMIT;

  useEffect(() => {
    if (visible) {
      setName([state.q.trim(), placeLabel(t, state.province, state.district)].filter(Boolean).join(' · '));
      setNotify(true);
    }
  }, [visible, state, t]);

  const noFilters = Object.keys(toSavedParams(state)).length === 0;
  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={t('savedSearch.save')}
      footerLabel={t('common.save')}
      footerDisabled={atLimit || !name.trim() || save.isPending}
      onFooter={() => {
        save.mutate(
          { name: name.trim(), params: toSavedParams(state), notify },
          {
            onSuccess: () => {
              toast.show({ message: t('posts.saved'), kind: 'success' });
              void qc.invalidateQueries({ queryKey: ['saved-searches'] });
              onClose();
              if (notify) askPush('savedSearch.hint');
            },
            onError: (e) => toast.show({ message: e instanceof ApiError && e.code === 'SAVED_SEARCH_LIMIT' ? t('savedSearch.limit') : errorText(e), kind: 'error' }),
          },
        );
      }}
    >
      {atLimit ? <Banner tone="warning" title={t('savedSearch.limit')} body={t('customer.saved.searchCount', { count: used, limit: SAVED_SEARCH_LIMIT })} /> : null}
      <TextField label={t('savedSearch.nameLabel')} value={name} onChangeText={setName} placeholder={t('savedSearch.namePlaceholder')} disabled={atLimit} />
      <View style={s.row}>
        <Text style={s.rowText}>{notify ? t('customer.saved.notifyOn') : t('customer.saved.notifyOff')}</Text>
        <Switch value={notify} onValueChange={setNotify} label={t('customer.saved.notifyOn')} disabled={atLimit} />
      </View>
      <Text style={s.small}>{noFilters ? t('savedSearch.noFilters') : t('savedSearch.hint')}</Text>
    </BottomSheet>
  );
}


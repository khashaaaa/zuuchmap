import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getPriceUnitLabel, PRICE_UNITS, type BrowseSort, type CategoryFieldView } from '@zuuchmap/core';
import { useCategoryLookup, useOptionLabel } from '@/lib/labels';
import { useBrowseOnce } from '@/lib/queries';
import { searchToApi, type SearchState } from '@/lib/search';
import { useFormat } from '@/lib/useFormat';
import { BottomSheet, SheetPresence } from '@/ui/BottomSheet';
import { Chip } from '@/ui/Chip';
import { Switch } from '@/ui/Switch';
import { TextField } from '@/ui/TextField';

export type FilterPatch = Pick<SearchState, 'sort' | 'subcategory' | 'price_min' | 'price_max' | 'price_unit' | 'attrs'>;

interface Props {
  open: boolean;
  onClose: () => void;
  state: SearchState;
  /** Sort by distance is offered only when the viewer's location is known. */
  canNearby: boolean;
  onApply: (p: FilterPatch) => void;
}

const digits = (v: string) => v.replace(/\D/g, '').slice(0, 12);

/** The filters that apply to one category's schema field. */
export function AttrFilter({ field, attrs, onChange }: { field: CategoryFieldView; attrs: Record<string, string>; onChange: (a: Record<string, string>) => void }) {
  const { t } = useTranslation();
  const optionLabel = useOptionLabel();
  const set = (k: string, v: string | undefined) => {
    const next = { ...attrs };
    if (v) next[k] = v;
    else delete next[k];
    onChange(next);
  };
  if (field.type === 'boolean') {
    return (
      <div className="flex items-center justify-between gap-3">
        <span className="text-body text-text-primary">{field.label}</span>
        <Switch label={field.label} checked={attrs[field.key] === 'true'} onChange={(on) => set(field.key, on ? 'true' : undefined)} />
      </div>
    );
  }
  if (field.type === 'select') {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-label text-text-primary">{field.label}</p>
        <div className="flex flex-wrap gap-2">
          {(field.options ?? []).map((o) => (
            <Chip key={o} label={optionLabel(o)} selected={attrs[field.key] === o} onClick={() => set(field.key, attrs[field.key] === o ? undefined : o)} />
          ))}
        </div>
      </div>
    );
  }
  if (field.type === 'number') {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-label text-text-primary">{field.label}{field.unit ? ` (${field.unit})` : ''}</p>
        <div className="flex gap-3">
          <TextField className="flex-1" label={t('customer.filter.min')} inputMode="numeric" value={attrs[`${field.key}_min`] ?? ''} onChange={(e) => set(`${field.key}_min`, digits(e.target.value))} />
          <TextField className="flex-1" label={t('customer.filter.max')} inputMode="numeric" value={attrs[`${field.key}_max`] ?? ''} onChange={(e) => set(`${field.key}_max`, digits(e.target.value))} />
        </div>
      </div>
    );
  }
  return null;
}

function Body({ onClose, state, canNearby, onApply }: Omit<Props, 'open'>) {
  const { t } = useTranslation();
  const f = useFormat();
  const cats = useCategoryLookup();
  const [d, setD] = useState<SearchState>(state);
  const count = useBrowseOnce(searchToApi({ ...d, sort: undefined }), 1);
  const cat = d.category ? cats.byKey.get(d.category) : undefined;
  const filterable = (cat?.fields ?? []).filter((x) => x.filterable && (x.type === 'select' || x.type === 'boolean' || x.type === 'number'));
  const sorts: BrowseSort[] = ['relevance', 'newest', ...(canNearby ? (['nearby'] as const) : []), 'price_asc', 'price_desc'];
  const units = PRICE_UNITS.filter((u) => u !== 'PIECE' && u !== 'TOTAL');
  const sortLabel = (s: BrowseSort) => (s === 'nearby' ? t('ui.sortNearby') : t(`sort.${s}`));

  return (
    <BottomSheet
      open
      onClose={onClose}
      title={t('customer.filter.title')}
      secondary={{ label: t('common.clear'), onClick: () => setD({ ...d, sort: undefined, subcategory: undefined, price_min: undefined, price_max: undefined, price_unit: undefined, attrs: {} }) }}
      primary={{
        label: t('customer.filter.show', { count: count.data?.total ?? 0 }),
        onClick: () => {
          onApply({ sort: d.sort, subcategory: d.subcategory, price_min: d.price_min, price_max: d.price_max, price_unit: d.price_unit, attrs: d.attrs });
          onClose();
        },
      }}
    >
      <section className="flex flex-col gap-2">
        <p className="text-label text-text-primary">{t('filter.sortBy')}</p>
        <div className="flex flex-wrap gap-2">
          {sorts.map((s) => (
            <Chip key={s} label={sortLabel(s)} selected={(d.sort ?? 'relevance') === s} onClick={() => setD({ ...d, sort: s === 'relevance' ? undefined : s })} />
          ))}
        </div>
      </section>
      {cat && cat.subcategories.length > 0 && (
        <section className="flex flex-col gap-2">
          <p className="text-label text-text-primary">{t('customer.filter.typeOf', { category: cat.label })}</p>
          <div className="flex flex-wrap gap-2">
            <Chip label={t('filter.all')} selected={!d.subcategory} onClick={() => setD({ ...d, subcategory: undefined })} />
            {cat.subcategories.map((s) => (
              <Chip key={s.value} label={s.label} selected={d.subcategory === s.value} onClick={() => setD({ ...d, subcategory: s.value })} />
            ))}
          </div>
        </section>
      )}
      <section className="flex flex-col gap-2">
        <p className="text-label text-text-primary">{t('customer.filter.price')}</p>
        <div className="flex flex-wrap gap-2">
          {units.map((u) => (
            <Chip key={u} label={getPriceUnitLabel(u, f.locale)} selected={d.price_unit === u} onClick={() => setD({ ...d, price_unit: d.price_unit === u ? undefined : u })} />
          ))}
        </div>
        <div className="flex gap-3">
          <TextField className="flex-1" label={t('customer.filter.min')} inputMode="numeric" value={d.price_min ?? ''} onChange={(e) => setD({ ...d, price_min: digits(e.target.value) || undefined, price_unit: d.price_unit ?? 'DAY' })} />
          <TextField className="flex-1" label={t('customer.filter.max')} inputMode="numeric" value={d.price_max ?? ''} onChange={(e) => setD({ ...d, price_max: digits(e.target.value) || undefined, price_unit: d.price_unit ?? 'DAY' })} />
        </div>
        <p className="text-small text-text-secondary">{t('customer.filter.unitNote')}</p>
      </section>
      {filterable.map((fld) => (
        <AttrFilter key={fld.key} field={fld} attrs={d.attrs} onChange={(attrs) => setD({ ...d, attrs })} />
      ))}
    </BottomSheet>
  );
}

/** A4. Draft state is local; the live count answers the draft, the footer applies it. */
export function FilterSheet({ open, ...rest }: Props) {
  return <SheetPresence open={open}><Body {...rest} /></SheetPresence>;
}

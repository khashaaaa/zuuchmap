import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FAMILY_KEYS, LOCALES, PRICE_UNITS, type CategorySchema, type FieldDef, type FieldType, type Locale, type LocalizedLabels } from '@zuuchmap/core';
import { errorKey } from '@/lib/api';
import { useAdminCategories, useCategoryUsage, useSaveCategory } from '@/lib/admin';
import { useDocTitle } from '@/lib/meta';
import { useFamilies } from '@/lib/queries';
import { useToast } from '@/lib/toast';
import { useFormat } from '@/lib/useFormat';
import { cn } from '@/lib/cn';
import { BottomSheet } from '@/ui/BottomSheet';
import { Button } from '@/ui/Button';
import { Checkbox } from '@/ui/Checkbox';
import { EmptyState } from '@/ui/EmptyState';
import { Icon } from '@/ui/Icon';
import { IconButton } from '@/ui/IconButton';
import { CategoryTile } from '@/ui/ListingCard';
import { Select } from '@/ui/Select';
import { Switch } from '@/ui/Switch';
import { TextField } from '@/ui/TextField';
import { AdminHead, Panel } from './Frame';

const TYPES: FieldType[] = ['text', 'textarea', 'number', 'select', 'multiselect', 'boolean', 'date', 'phone'];
/** Icons offered in the picker: the shipped Lucide names a category is likely to use. */
const ICON_CHOICES = ['truck', 'wrench', 'package', 'briefcase', 'home', 'building-2', 'camera', 'map-pin', 'sparkles', 'shield-check', 'calendar', 'users', 'star', 'image', 'layout-grid'];
const SNAKE = /^[a-z0-9_]+$/;

type Draft = Pick<CategorySchema, 'key' | 'label' | 'icon' | 'color' | 'has_rental_status' | 'has_availability_dates' | 'has_price' | 'default_price_unit' | 'emphasized'> & {
  family: string;
  labels: LocalizedLabels;
  fields: FieldDef[];
  subcategories: Array<{ value: string; display: string; labels?: LocalizedLabels }>;
};

const draftOf = (c: CategorySchema): Draft => ({
  key: c.key, label: c.label, icon: c.icon, color: c.color, family: c.family ?? FAMILY_KEYS[0],
  labels: { ...(c.labels ?? {}), mn: c.labels?.mn || c.label } as LocalizedLabels,
  has_rental_status: c.has_rental_status, has_availability_dates: c.has_availability_dates, has_price: c.has_price,
  default_price_unit: c.default_price_unit, emphasized: c.emphasized,
  fields: (c.fields ?? []).map((f) => ({ ...f })), subcategories: (c.subcategories ?? []).map((s) => ({ ...s })),
});

/** Four name inputs; only Mongolian is required (Figma J14d). */
function Names({ value, onChange }: { value: Partial<Record<Locale, string>>; onChange: (v: Partial<Record<Locale, string>>) => void }) {
  const { t } = useTranslation();
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {LOCALES.map((l) => (
        <TextField
          key={l}
          label={t('admin.cat.name', { lang: l.toUpperCase() })}
          value={value[l] ?? ''}
          placeholder={l === 'mn' ? undefined : t('admin.cat.addTranslation')}
          onChange={(e) => onChange({ ...value, [l]: e.target.value })}
        />
      ))}
    </div>
  );
}

/** Figma J15d: a field's names, unit, group and switches; key and type are locked once listings use them. */
function FieldSheet({ field, used, category, onClose, onSave, onDelete }: {
  field: (FieldDef & { isNew?: boolean }) | null;
  used: number;
  category: string;
  onClose: () => void;
  onSave: (f: FieldDef) => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const [f, setF] = useState<FieldDef | null>(field);
  const [options, setOptions] = useState('');
  useEffect(() => {
    setF(field);
    setOptions((field?.options ?? []).join(', '));
  }, [field]);
  if (!f || !field) return null;
  const locked = used > 0;
  const labels = (f.labels ?? { mn: f.label }) as Partial<Record<Locale, string>>;
  const valid = SNAKE.test(f.key) && !!(labels.mn ?? '').trim();
  const save = () => {
    const opts = options.split(',').map((o) => o.trim()).filter(Boolean);
    onSave({ ...f, label: labels.mn ?? f.label, labels: labels as LocalizedLabels, options: f.type === 'select' || f.type === 'multiselect' ? opts : undefined });
  };
  return (
    <BottomSheet open onClose={onClose} title={t('admin.cat.editField', { key: f.key || '…' })} secondary={{ label: t('admin.cat.save'), onClick: () => { if (valid) save(); } }}>
      <p className="text-small text-text-secondary">{t('admin.cat.fieldFilterNote', { category, key: f.key })}</p>
      <div className="grid grid-cols-2 gap-3">
        <TextField label={t('admin.cat.key')} value={f.key} disabled={locked} onChange={(e) => setF({ ...f, key: e.target.value.trim() })} />
        <Select label={t('admin.cat.type')} value={f.type} disabled={locked} onChange={(v) => setF({ ...f, type: v as FieldType })} options={TYPES.map((x) => ({ value: x, label: `${x} — ${t(`admin.cat.types.${x}`)}` }))} />
      </div>
      {locked && <p className="flex gap-2 rounded-md bg-status-warning-tint p-3 text-small text-text-primary"><Icon name="info" size={16} className="mt-0.5 shrink-0" />{t('admin.cat.locked', { count: used })}</p>}
      <p className="text-label-strong text-text-primary">{t('admin.cat.label')}</p>
      <p className="-mt-2 text-small text-text-secondary">{t('admin.cat.labelHint')}</p>
      <Names value={labels} onChange={(v) => setF({ ...f, labels: v as LocalizedLabels, label: v.mn ?? f.label })} />
      {(f.type === 'select' || f.type === 'multiselect') && <TextField label={t('admin.cat.options')} value={options} onChange={(e) => setOptions(e.target.value)} />}
      <div className="grid grid-cols-2 gap-3">
        <TextField label={t('admin.cat.unit')} value={f.unit ?? ''} onChange={(e) => setF({ ...f, unit: e.target.value || undefined })} />
        <Select label={t('admin.cat.group')} value={f.group ?? 'core'} onChange={(v) => setF({ ...f, group: v as 'core' | 'details', required: v === 'details' ? false : f.required })} options={[{ value: 'core', label: t('admin.cat.groupCore') }, { value: 'details', label: t('admin.cat.groupDetails') }]} />
      </div>
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1"><p className="text-label-strong text-text-primary">{t('admin.cat.required')}</p><p className="text-small text-text-secondary">{t('admin.cat.requiredHint')}</p></div>
        <Switch label={t('admin.cat.required')} checked={!!f.required} disabled={f.group === 'details'} onChange={(v) => setF({ ...f, required: v })} />
      </div>
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1"><p className="text-label-strong text-text-primary">{t('admin.cat.filter')}</p><p className="text-small text-text-secondary">{t('admin.cat.filterHint')}</p></div>
        <Switch label={t('admin.cat.filter')} checked={!!f.filterable} onChange={(v) => setF({ ...f, filterable: v })} />
      </div>
      <div className="flex gap-2 pt-2">
        {!field.isNew && <Button variant="outline" icon="trash-2" disabled={locked} onClick={onDelete}>{t('admin.cat.deleteField')}</Button>}
        <span className="flex-1" />
        <Button variant="outline" onClick={onClose}>{t('admin.cat.cancel')}</Button>
        <Button disabled={!valid} onClick={save}>{t('admin.cat.save')}</Button>
      </div>
    </BottomSheet>
  );
}

/** Figma J16d: a subcategory's value (locked once used) and names. */
function SubSheet({ sub, used, onClose, onSave }: {
  sub: { value: string; display: string; labels?: LocalizedLabels; isNew?: boolean } | null;
  used: number;
  onClose: () => void;
  onSave: (s: { value: string; display: string; labels: LocalizedLabels }) => void;
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState('');
  const [labels, setLabels] = useState<Partial<Record<Locale, string>>>({});
  useEffect(() => {
    setValue(sub?.value ?? '');
    setLabels({ ...(sub?.labels ?? {}), mn: sub?.labels?.mn || sub?.display || '' });
  }, [sub]);
  if (!sub) return null;
  const valid = SNAKE.test(value) && !!(labels.mn ?? '').trim();
  return (
    <BottomSheet open onClose={onClose} title={sub.isNew ? t('admin.cat.newSub') : sub.display} primary={{ label: t('admin.cat.save'), disabled: !valid, onClick: () => onSave({ value, display: labels.mn ?? value, labels: labels as LocalizedLabels }) }}>
      <TextField label={t('admin.cat.value')} value={value} disabled={used > 0} onChange={(e) => setValue(e.target.value.trim())} />
      {used > 0 && <p className="text-small text-text-secondary">{t('admin.cat.subsHint')}</p>}
      <Names value={labels} onChange={setLabels} />
    </BottomSheet>
  );
}

function Editor({ schema }: { schema: CategorySchema }) {
  const { t } = useTranslation();
  const f = useFormat();
  const toast = useToast();
  const families = useFamilies();
  const usage = useCategoryUsage(schema.key);
  const save = useSaveCategory();
  const [d, setD] = useState<Draft>(() => draftOf(schema));
  const [field, setField] = useState<(FieldDef & { isNew?: boolean; index: number }) | null>(null);
  const [sub, setSub] = useState<{ value: string; display: string; labels?: LocalizedLabels; isNew?: boolean; index: number } | null>(null);
  useEffect(() => setD(draftOf(schema)), [schema]);
  const dirty = JSON.stringify(d) !== JSON.stringify(draftOf(schema));
  const u = usage.data;
  const updated = (schema as CategorySchema & { updated_at?: string }).updated_at ?? schema.created_at;

  const submit = () => {
    const labels = Object.fromEntries(Object.entries(d.labels).filter(([, v]) => typeof v === 'string' && v.trim())) as LocalizedLabels;
    save.mutate({
      key: d.key, family: d.family, label: labels.mn, labels, icon: d.icon, color: d.color || null,
      has_rental_status: d.has_rental_status, has_availability_dates: d.has_availability_dates, has_price: d.has_price,
      default_price_unit: d.has_price ? d.default_price_unit : null, emphasized: d.emphasized, fields: d.fields, subcategories: d.subcategories,
    }, { onSuccess: () => toast.success(t('admin.cat.saved')), onError: (e) => toast.error(t(errorKey(e))) });
  };
  const flag = (k: 'has_rental_status' | 'has_availability_dates' | 'has_price' | 'emphasized', label: string, hint: string, extra?: React.ReactNode) => (
    <div className="flex items-center gap-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="text-label-strong text-text-primary">{label}</p>
        <p className="text-small text-text-secondary">{hint}</p>
        {extra}
      </div>
      <Switch label={label} checked={d[k]} onChange={(v) => setD({ ...d, [k]: v })} />
    </div>
  );

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="size-12 overflow-hidden rounded-md"><CategoryTile categoryKey={d.key} icon={d.icon ?? undefined} glyph={22} className="size-full" /></div>
        <div className="min-w-0 flex-1">
          <h2 className="text-h2 text-text-primary">{d.labels.mn || d.label}</h2>
          <p className="text-small text-text-secondary">{t('admin.cat.meta', { key: d.key, count: u?.posts ?? 0, date: f.date(updated) })}</p>
        </div>
        <Button variant="outline" disabled={!dirty} onClick={() => setD(draftOf(schema))}>{t('admin.cat.cancel')}</Button>
        <Button disabled={!dirty || !d.labels.mn.trim()} loading={save.isPending} onClick={submit}>{t('admin.cat.save')}</Button>
      </div>

      <Panel title={t('admin.cat.names')} hint={t('admin.cat.namesHint')}>
        <Names value={d.labels} onChange={(v) => setD({ ...d, labels: v as LocalizedLabels })} />
        <div className="grid gap-3 sm:grid-cols-[minmax(0,280px)_180px]">
          <Select label={t('admin.cat.family')} value={d.family} onChange={(v) => setD({ ...d, family: v })} options={FAMILY_KEYS.map((k) => ({ value: k, label: families.data?.find((x) => x.key === k)?.label ?? k }))} />
          <TextField label={t('admin.cat.color')} value={d.color ?? ''} onChange={(e) => setD({ ...d, color: e.target.value })} placeholder="#6A7BC2" />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-label text-text-primary">{t('admin.cat.icon')}</span>
          <div className="flex flex-wrap gap-1.5">
            {ICON_CHOICES.map((name) => (
              <button key={name} type="button" aria-label={name} aria-pressed={d.icon === name} onClick={() => setD({ ...d, icon: name })} className={cn('inline-flex size-10 items-center justify-center rounded-md border', d.icon === name ? 'border-border-selected border-2' : 'border-border-subtle')}>
                <Icon name={name} size={18} />
              </button>
            ))}
          </div>
        </div>
      </Panel>

      <Panel title={t('admin.cat.settings')} hint={t('admin.cat.settingsHint')}>
        <div className="flex flex-col divide-y divide-border-subtle">
          {flag('has_rental_status', t('admin.cat.rental'), t('admin.cat.rentalHint'))}
          {flag('has_availability_dates', t('admin.cat.dates'), t('admin.cat.datesHint'))}
          {flag('has_price', t('admin.cat.priced'), t('admin.cat.pricedHint', { unit: d.default_price_unit ? t(`priceUnit.${d.default_price_unit}`) : '—' }), d.has_price && (
            <Select label={t('admin.cat.unit')} value={d.default_price_unit ?? ''} onChange={(v) => setD({ ...d, default_price_unit: v || null })} options={[{ value: '', label: '—' }, ...PRICE_UNITS.map((p) => ({ value: p, label: t(`priceUnit.${p}`) }))]} className="mt-2 max-w-[240px]" />
          ))}
          {flag('emphasized', t('admin.cat.emphasized'), t('admin.cat.emphasizedHint'))}
        </div>
      </Panel>

      <Panel
        title={t('admin.cat.subs', { count: d.subcategories.length })}
        hint={t('admin.cat.subsHint')}
      >
        <ul className="flex flex-col divide-y divide-border-subtle">
          {d.subcategories.map((s, i) => (
            <li key={`${s.value}:${String(i)}`} className="flex items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-label-strong text-text-primary">{s.labels?.mn || s.display}</p>
                <p className="truncate text-small text-text-secondary">
                  {[s.value, ...(['en', 'zh', 'ru'] as const).map((l) => `${l.toUpperCase()} ${s.labels?.[l] || `— ${t('admin.cat.noTranslation')}`}`), t('admin.cat.subPosts', { count: u?.subcategories[s.value] ?? 0 })].join(' · ')}
                </p>
              </div>
              <button type="button" onClick={() => setSub({ ...s, index: i })} className="inline-flex h-10 items-center text-label-strong text-text-link">{t('admin.cat.edit')}</button>
            </li>
          ))}
        </ul>
        <button type="button" onClick={() => setSub({ value: '', display: '', isNew: true, index: d.subcategories.length })} className="inline-flex h-10 items-center self-start text-label-strong text-text-link">{t('admin.cat.addSub')}</button>
      </Panel>

      <Panel title={t('admin.cat.fields', { count: d.fields.length })} hint={t('admin.cat.fieldsHint')}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left">
            <thead className="bg-bg-surface-sunken text-small text-text-secondary">
              <tr>
                <th className="px-3 py-2 font-medium">{t('admin.cat.colKey')}</th>
                <th className="px-3 py-2 font-medium">{t('admin.cat.colType')}</th>
                <th className="px-3 py-2 font-medium">{t('admin.cat.colName')}</th>
                <th className="px-3 py-2 font-medium">{t('admin.cat.colFilter')}</th>
                <th className="px-3 py-2 font-medium">{t('admin.cat.colRequired')}</th>
                <th className="w-12" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {d.fields.map((fd, i) => (
                <tr key={`${fd.key}:${String(i)}`} className="text-body">
                  <td className="px-3 py-2.5 text-label-strong text-text-primary">{fd.key}</td>
                  <td className="px-3 py-2.5 text-text-secondary">{fd.type}</td>
                  <td className="px-3 py-2.5 text-text-primary">{fd.labels?.mn || fd.label}</td>
                  <td className="px-3 py-2.5"><Checkbox aria-label={t('admin.cat.filter')} checked={!!fd.filterable} onChange={(v) => setD({ ...d, fields: d.fields.map((x, j) => (j === i ? { ...x, filterable: v } : x)) })} /></td>
                  <td className="px-3 py-2.5"><Checkbox aria-label={t('admin.cat.required')} checked={!!fd.required} disabled={fd.group === 'details'} onChange={(v) => setD({ ...d, fields: d.fields.map((x, j) => (j === i ? { ...x, required: v } : x)) })} /></td>
                  <td><IconButton icon="pencil" label={t('admin.cat.edit')} variant="ghost" size="medium" onClick={() => setField({ ...fd, index: i })} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button type="button" onClick={() => setField({ key: '', label: '', type: 'text', group: 'core', isNew: true, index: d.fields.length })} className="inline-flex h-10 items-center self-start text-label-strong text-text-link">{t('admin.cat.addField')}</button>
      </Panel>

      <FieldSheet
        field={field}
        used={field && !field.isNew ? u?.fields[field.key] ?? 0 : 0}
        category={d.labels.mn || d.label}
        onClose={() => setField(null)}
        onSave={(nf) => {
          const list = [...d.fields];
          list[field?.index ?? list.length] = nf;
          setD({ ...d, fields: list });
          setField(null);
        }}
        onDelete={() => {
          setD({ ...d, fields: d.fields.filter((_, j) => j !== field?.index) });
          setField(null);
        }}
      />
      <SubSheet
        sub={sub}
        used={sub && !sub.isNew ? u?.subcategories[sub.value] ?? 0 : 0}
        onClose={() => setSub(null)}
        onSave={(ns) => {
          const list = [...d.subcategories];
          list[sub?.index ?? list.length] = ns;
          setD({ ...d, subcategories: list });
          setSub(null);
        }}
      />
    </div>
  );
}

/** Figma J14d–J16d: the categories by family on the left, the chosen one's editor on the right. */
export default function Categories() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const { key } = useParams();
  const q = useAdminCategories();
  const families = useFamilies();
  useDocTitle(t('admin.nav.categories'));
  const list = useMemo(() => q.data ?? [], [q.data]);
  const current = list.find((c) => c.key === key) ?? null;
  useEffect(() => {
    if (!key && list.length && window.matchMedia('(min-width: 1024px)').matches) void nav(`/admin/categories/${list[0].key}`, { replace: true });
  }, [key, list, nav]);

  return (
    <div className="pb-10">
      <AdminHead title={t('admin.cat.count', { count: list.length })} />
      <div className="grid gap-6 px-4 md:px-8 lg:grid-cols-[240px_minmax(0,1fr)]">
        <nav className={cn('flex flex-col gap-1', current && 'hidden lg:flex')} aria-label={t('admin.nav.categories')}>
          {FAMILY_KEYS.map((fam) => {
            const rows = list.filter((c) => c.family === fam);
            if (!rows.length) return null;
            return (
              <div key={fam} className="flex flex-col gap-0.5 pb-2">
                <p className="px-2 pb-1 text-overline text-text-secondary">{families.data?.find((x) => x.key === fam)?.label ?? fam}</p>
                {rows.map((c) => (
                  <button key={c.key} type="button" aria-current={c.key === key ? 'page' : undefined} onClick={() => void nav(`/admin/categories/${c.key}`)} className={cn('flex h-10 items-center gap-2 rounded-md px-2 text-left', c.key === key ? 'bg-bg-surface-sunken text-label-strong text-text-primary' : 'text-label text-text-secondary hover:bg-bg-surface-sunken')}>
                    <span className="size-6 overflow-hidden rounded-sm"><CategoryTile categoryKey={c.key} icon={c.icon ?? undefined} glyph={14} className="size-full" /></span>
                    <span className="truncate">{c.labels?.mn || c.label}</span>
                  </button>
                ))}
              </div>
            );
          })}
        </nav>
        <div className={cn('min-w-0', !current && 'hidden lg:block')}>
          {current ? (
            <>
              <button type="button" onClick={() => void nav('/admin/categories')} className="mb-3 inline-flex h-10 items-center gap-1 text-label-strong text-text-link lg:hidden">
                <Icon name="arrow-left" size={16} />
                {t('admin.nav.categories')}
              </button>
              <Editor schema={current} />
            </>
          ) : (
            <EmptyState icon="layout-grid" title={t('admin.nav.categories')} className="py-16" />
          )}
        </div>
      </div>
    </div>
  );
}

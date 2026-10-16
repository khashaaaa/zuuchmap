import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CategoryFieldView, PhotoUploadResponse } from '@zuuchmap/core';
import { api, ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useOptionLabel } from '@/lib/labels';
import { MAX_PHOTOS, TITLE_MAX, TITLE_MIN, useErrorText } from '@/lib/provider';
import { Banner } from '@/ui/Banner';
import { Chip } from '@/ui/Chip';
import { Icon } from '@/ui/Icon';
import { Select } from '@/ui/Select';
import { Switch } from '@/ui/Switch';
import { TextArea } from '@/ui/TextArea';
import { TextField } from '@/ui/TextField';
import { HealthChecks, PreviewCard, type StepProps } from './shared';

/** R2 answers 503 in dev: once seen, the wizard stops offering the picker for the session. */
let storageDown = false;

function Photos({ form, set }: Pick<StepProps, 'form' | 'set'>) {
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<File[]>([]);
  const [down, setDown] = useState(storageDown);

  const upload = async (files: File[]) => {
    const room = MAX_PHOTOS - form.images.length;
    const batch = files.slice(0, Math.max(0, room));
    if (batch.length === 0) return;
    setBusy(true);
    const keep: File[] = [];
    const added = [...form.images];
    for (const file of batch) {
      const body = new FormData();
      body.append('files', file);
      try {
        const r = await api<PhotoUploadResponse>('/posts/photos', { method: 'POST', form: body });
        for (const p of r.photos) added.push({ key: p.key, url: p.url });
      } catch (e) {
        if (e instanceof ApiError && e.code === 'PHOTO_STORAGE_UNAVAILABLE') {
          storageDown = true;
          setDown(true);
          keep.length = 0;
          break;
        }
        keep.push(file);
      }
    }
    set({ images: added });
    setFailed(keep);
    setBusy(false);
  };

  const remove = (key: string) => set({ images: form.images.filter((p) => p.key !== key) });
  const slots = Math.min(MAX_PHOTOS, Math.max(5, form.images.length + 1));

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-border-subtle bg-bg-surface p-4">
      <div className="flex items-baseline justify-between">
        <h3 className="text-title text-text-primary">{t('prov.wizard.photos')}</h3>
        <span className="text-small text-text-secondary">{t('prov.wizard.photosCount', { count: form.images.length, max: MAX_PHOTOS })}</span>
      </div>
      <div className="grid grid-cols-3 gap-2 md:grid-cols-5">
        {Array.from({ length: slots }, (_, i) => {
          const p = form.images[i];
          if (p) {
            return (
              <div key={p.key} className="relative aspect-square overflow-hidden rounded-lg bg-bg-surface-sunken">
                {p.url.startsWith('http') ? <img src={p.url} alt="" className="size-full object-cover" /> : <span className="flex size-full items-center justify-center text-icon-secondary"><Icon name="image" size={28} /></span>}
                {i === 0 && <span className="absolute bottom-1 left-1 rounded-sm bg-bg-media-scrim px-1.5 py-0.5 text-micro text-text-on-media">{t('prov.wizard.cover')}</span>}
                <button type="button" aria-label={t('ui.remove')} onClick={() => remove(p.key)} className="absolute right-1 top-1 inline-flex size-8 items-center justify-center rounded-pill bg-bg-media-scrim text-text-on-media focus-visible:outline-none focus-visible:shadow-focus">
                  <Icon name="x" size={16} />
                </button>
              </div>
            );
          }
          if (i === form.images.length) {
            return (
              <button
                key="add"
                type="button"
                disabled={busy || down}
                onClick={() => input.current?.click()}
                className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border-[1.5px] border-dashed border-border-default text-small text-text-secondary focus-visible:outline-none focus-visible:shadow-focus disabled:opacity-50"
              >
                <Icon name={busy ? 'loader-2' : 'upload'} size={22} className={busy ? 'animate-spin' : undefined} />
                {t('prov.wizard.addPhoto')}
              </button>
            );
          }
          return <span key={`e${i}`} aria-hidden="true" className="aspect-square rounded-lg bg-bg-surface-sunken" />;
        })}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = '';
          void upload(files);
        }}
      />
      {down && <Banner tone="info" title={t('prov.wizard.photosUnavailable')} />}
      {failed.length > 0 && (
        <Banner tone="warning" title={t('prov.wizard.photoFailed', { count: failed.length })} body={t('prov.wizard.photoFailedBody', { count: failed.length })} action={{ label: t('prov.wizard.retry'), onClick: () => void upload(failed) }} />
      )}
      <p className="flex items-start gap-1.5 text-caption text-text-secondary"><Icon name="sparkles" size={14} className="mt-0.5" />{t('prov.wizard.photoTip')}</p>
    </section>
  );
}

function Field({ f, step }: { f: CategoryFieldView; step: StepProps }) {
  const { t } = useTranslation();
  const optionLabel = useOptionLabel();
  const err = useErrorText();
  const key = `attr.${f.key}`;
  const value = step.form.attributes[f.key];
  const setAttr = (v: unknown) => step.set({ attributes: { ...step.form.attributes, [f.key]: v } });
  const error = err(step.errors[key], f.label);
  const label = f.required ? f.label : `${f.label}`;

  switch (f.type) {
    case 'boolean':
      return (
        <div className="flex min-h-12 items-center justify-between gap-3">
          <span className="text-label text-text-primary">{label}</span>
          <Switch checked={value === true} onChange={setAttr} label={f.label} />
        </div>
      );
    case 'select':
      return (
        <div className="flex flex-col gap-1.5">
          <Select label={label} value={typeof value === 'string' ? value : undefined} placeholder={t('form.selectPlaceholder', { field: f.label })} options={(f.options ?? []).map((o) => ({ value: o, label: optionLabel(o) }))} onChange={setAttr} />
          {error && <p role="alert" className="text-small text-status-danger">{error}</p>}
        </div>
      );
    case 'multiselect': {
      const cur = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div className="flex flex-col gap-1.5">
          <span className="text-label text-text-primary">{label}</span>
          <div className="flex flex-wrap gap-2">
            {(f.options ?? []).map((o) => (
              <Chip key={o} label={optionLabel(o)} selected={cur.includes(o)} onClick={() => setAttr(cur.includes(o) ? cur.filter((x) => x !== o) : [...cur, o])} />
            ))}
          </div>
          {error && <p role="alert" className="text-small text-status-danger">{error}</p>}
        </div>
      );
    }
    case 'textarea':
      return <TextArea label={label} value={typeof value === 'string' ? value : ''} placeholder={f.placeholder ? t('form.example', { value: f.placeholder }) : undefined} onChange={(e) => setAttr(e.target.value)} />;
    case 'number':
      return (
        <TextField
          label={f.unit ? `${label} (${f.unit})` : label}
          type="number"
          inputMode="decimal"
          min={f.min}
          max={f.max}
          value={typeof value === 'number' ? String(value) : ''}
          placeholder={f.placeholder ? t('form.example', { value: f.placeholder }) : undefined}
          error={error}
          onChange={(e) => setAttr(e.target.value === '' ? '' : Number.isFinite(Number(e.target.value)) ? Number(e.target.value) : value)}
        />
      );
    case 'date':
      return <TextField label={label} type="date" value={typeof value === 'string' ? value : ''} error={error} onChange={(e) => setAttr(e.target.value)} />;
    case 'phone':
      return <TextField label={label} type="tel" inputMode="tel" value={typeof value === 'string' ? value : ''} placeholder={f.placeholder ? t('form.example', { value: f.placeholder }) : undefined} error={error} onChange={(e) => setAttr(e.target.value)} />;
    default:
      return <TextField label={label} value={typeof value === 'string' ? value : ''} placeholder={f.placeholder ? t('form.example', { value: f.placeholder }) : undefined} error={error} onChange={(e) => setAttr(e.target.value)} />;
  }
}

/** F2: photos, title with counter, the category's fields, description and a live preview. */
export function StepDetails(step: StepProps) {
  const { t } = useTranslation();
  const { form, set, cat, errors } = step;
  const len = form.title.trim().length;
  const core = (cat?.fields ?? []).filter((f) => f.group !== 'details');
  const more = (cat?.fields ?? []).filter((f) => f.group === 'details');
  const titleError = errors.title ? t('prov.wizard.titleMin', { min: TITLE_MIN, count: len }) : undefined;

  return (
    <div className="flex flex-col gap-4 md:grid md:grid-cols-[minmax(0,1fr)_340px] md:items-start md:gap-x-6">
      <div className="flex min-w-0 flex-col gap-4">
        <Photos form={form} set={set} />
        <section className="flex flex-col gap-4 rounded-xl border border-border-subtle bg-bg-surface p-4">
          <h3 className="text-title text-text-primary">{t('kit.wizard.s2')}</h3>
          <TextField
            label={t('prov.wizard.titleLabel')}
            value={form.title}
            maxLength={TITLE_MAX}
            error={titleError}
            helper={t('prov.wizard.titleHint', { count: len, max: TITLE_MAX })}
            onChange={(e) => set({ title: e.target.value })}
          />
          <div className={cn('grid gap-4', core.length > 2 && 'md:grid-cols-3')}>
            {core.map((f) => <Field key={f.key} f={f} step={step} />)}
          </div>
        </section>
        {more.length > 0 && (
          <section className="flex flex-col gap-4 rounded-xl border border-border-subtle bg-bg-surface p-4">
            <h3 className="text-title text-text-primary">{t('form.moreDetails')}</h3>
            {more.map((f) => <Field key={f.key} f={f} step={step} />)}
          </section>
        )}
        <section className="rounded-xl border border-border-subtle bg-bg-surface p-4">
          <TextArea label={t('prov.wizard.details')} rows={5} value={form.details} placeholder={t('prov.wizard.detailsPlaceholder')} maxLength={5000} onChange={(e) => set({ details: e.target.value })} />
        </section>
      </div>
      <aside className="flex flex-col gap-3 md:sticky md:top-6">
        <PreviewCard form={form} cat={cat} />
        <HealthChecks form={form} cat={cat} />
      </aside>
    </div>
  );
}

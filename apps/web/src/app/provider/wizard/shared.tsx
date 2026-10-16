import { useTranslation } from 'react-i18next';
import { HEALTH_PHOTO_TARGET, listingHealth, type CategoryView } from '@zuuchmap/core';
import { usePlace } from '@/lib/labels';
import { type FieldErrors, type WizardForm } from '@/lib/provider';
import { ListingCard } from '@/ui/ListingCard';
import { Icon } from '@/ui/Icon';
import { cn } from '@/lib/cn';

export interface StepProps {
  form: WizardForm;
  set: (patch: Partial<WizardForm>) => void;
  errors: FieldErrors;
  cat: CategoryView | undefined;
  /** An existing listing is being edited: its category is fixed. */
  editing: boolean;
}

/** The "how it will look in search" card. */
export function PreviewCard({ form, cat }: { form: WizardForm; cat: CategoryView | undefined }) {
  const { t } = useTranslation();
  const place = usePlace();
  const loc = place(form.province, form.district);
  const price = form.price ? Number(form.price) : null;
  return (
    <div className="flex flex-col gap-2">
      <p className="flex items-center gap-1.5 text-label-strong text-text-secondary"><Icon name="eye" size={16} />{t('prov.wizard.preview')}</p>
      <ListingCard
        variant="grid"
        className="max-w-none"
        title={form.title.trim() || t('prov.wizard.titleLabel')}
        categoryKey={form.category ?? ''}
        categoryIcon={cat?.icon}
        categoryLabel={cat?.label}
        photo={form.images[0]?.url.startsWith('http') ? form.images[0].url : undefined}
        location={loc || t('prov.wizard.locationLater')}
        price={price}
        priceUnit={form.price_unit || cat?.default_price_unit}
        hideSave
      />
      {price === null && cat?.has_price && <p className="text-caption text-text-tertiary">{t('prov.wizard.priceLater')}</p>}
    </div>
  );
}

/** Photos, required fields and description, as the checklist beside the preview. */
export function HealthChecks({ form, cat, className }: { form: WizardForm; cat: CategoryView | undefined; className?: string }) {
  const { t } = useTranslation();
  const h = listingHealth({ imageCount: form.images.length, attributes: form.attributes, details: form.details, price: form.price, schema: cat });
  const rows: { ok: boolean; text: string }[] = [
    { ok: form.images.length >= HEALTH_PHOTO_TARGET, text: t('prov.wizard.checkPhotos', { count: form.images.length }) },
    { ok: !h.missing.includes('details'), text: t('prov.wizard.checkDetails', { count: form.details.trim().length }) },
  ];
  const complete = !h.missing.includes('price') && !h.missing.includes('attributes');
  if (complete) rows.push({ ok: true, text: t('prov.wizard.checkComplete') });
  else {
    if (h.missing.includes('price')) rows.push({ ok: false, text: t('provider.healthPrice') });
    if (h.missing.includes('attributes')) rows.push({ ok: false, text: t('provider.healthAttributes') });
  }
  return (
    <ul className={cn('flex flex-col gap-2.5 rounded-xl border border-border-subtle bg-bg-surface p-4', className)}>
      {rows.map((r) => (
        <li key={r.text} className="flex items-start gap-2.5 text-caption text-text-primary">
          <Icon name={r.ok ? 'circle-check' : 'circle-alert'} size={18} className={cn('mt-px', r.ok ? 'text-status-success' : 'text-status-warning')} />
          {r.text}
        </li>
      ))}
    </ul>
  );
}

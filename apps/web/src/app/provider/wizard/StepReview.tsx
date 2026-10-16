import { useTranslation } from 'react-i18next';
import { listingHealth } from '@zuuchmap/core';
import { usePlace } from '@/lib/labels';
import { useFormat } from '@/lib/useFormat';
import { Icon } from '@/ui/Icon';
import { ListingHealthRing } from '@/ui/ListingHealthRing';
import { HealthChecks, PreviewCard, type StepProps } from './shared';

interface Props extends StepProps {
  goto: (step: number) => void;
  blockedLabel: string;
}

/** F5: what customers will see, rows that jump back to their step, and the health ring. */
export function StepReview({ form, cat, goto, blockedLabel, editing }: Props) {
  const { t } = useTranslation();
  const f = useFormat();
  const place = usePlace();
  const h = listingHealth({ imageCount: form.images.length, attributes: form.attributes, details: form.details, price: form.price, schema: cat });
  const parts = f.priceParts(form.price ? Number(form.price) : null, form.price_unit || cat?.default_price_unit);
  const sub = cat?.subcategories.find((s) => s.value === form.subcategory)?.label;
  const rows: { label: string; value: string; step: number; show: boolean }[] = [
    { label: t('prov.wizard.rowCategory'), value: [cat?.label, sub].filter(Boolean).join(' · '), step: 1, show: !editing },
    { label: t('prov.wizard.titleLabel'), value: form.title, step: 2, show: true },
    { label: t('prov.wizard.rowPrice'), value: parts ? `${parts.amount}${parts.unit ? ` / ${parts.unit}` : ''}` : '—', step: 3, show: !!cat?.has_price },
    { label: t('prov.wizard.rowLocation'), value: [place(form.province, form.district), form.address].filter(Boolean).join(', ') || '—', step: 4, show: true },
    { label: t('prov.wizard.rowDays'), value: blockedLabel, step: 3, show: !!cat?.has_availability_dates },
  ];
  return (
    <div className="flex flex-col gap-4 md:grid md:grid-cols-[minmax(0,1fr)_340px] md:items-start md:gap-x-6">
      <div className="flex min-w-0 flex-col gap-4">
        <p className="text-caption text-text-secondary">{t('prov.wizard.reviewBody')}</p>
        <ul className="flex flex-col overflow-hidden rounded-xl border border-border-subtle bg-bg-surface">
          {rows.filter((r) => r.show).map((r) => (
            <li key={r.label} className="border-b border-border-subtle last:border-b-0">
              <button type="button" onClick={() => goto(r.step)} className="flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left focus-visible:outline-none focus-visible:shadow-focus">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-small text-text-secondary">{r.label}</span>
                  <span className="truncate text-body text-text-primary">{r.value}</span>
                </span>
                <Icon name="pencil" size={16} className="text-icon-secondary" />
              </button>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-4 rounded-xl border border-border-subtle bg-bg-surface p-4">
          <ListingHealthRing value={h.score} size={64} label="" />
          <div className="flex min-w-0 flex-col gap-0.5">
            <p className="text-body-bold text-text-primary">{h.score >= 80 ? t('prov.wizard.good') : t('prov.perf.healthPct', { pct: h.score })}</p>
            <p className="text-caption text-text-secondary">{h.hint ? t(`provider.health${h.hint[0].toUpperCase()}${h.hint.slice(1)}`) : t('prov.wizard.goodBody')}</p>
          </div>
        </div>
        <HealthChecks form={form} cat={cat} />
        {!editing && <p className="flex items-center gap-2 text-caption text-text-secondary"><Icon name="clock" size={16} />{t('prov.wizard.adminTime')}</p>}
      </div>
      <aside className="md:sticky md:top-6"><PreviewCard form={form} cat={cat} /></aside>
    </div>
  );
}

import { useTranslation } from 'react-i18next';
import { groupThousands, PRICE_UNITS } from '@zuuchmap/core';
import { useErrorText } from '@/lib/provider';
import { useAvailability } from '@/lib/queries';
import { Button } from '@/ui/Button';
import { Icon } from '@/ui/Icon';
import { Select } from '@/ui/Select';
import { TextField } from '@/ui/TextField';
import { PreviewCard, type StepProps } from './shared';

interface Props extends StepProps {
  /** The saved draft or listing; days can only be blocked once it exists. */
  postId: number | null;
  onBlock: () => void;
}

/** Number of blocked days (BLOCKED ranges only) of a listing. */
function useBlockedCount(id: number | null): number {
  const q = useAvailability(id ?? 0, id !== null);
  if (!q.data) return 0;
  return q.data.busy.filter((b) => b.kind === 'BLOCKED').reduce((n, b) => n + Math.round((Date.parse(b.end_date.slice(0, 10)) - Date.parse(b.start_date.slice(0, 10))) / 86_400_000) + 1, 0);
}

/** F3: price with thousands grouping, unit, and the days a rental is not free. */
export function StepPrice(p: Props) {
  const { t } = useTranslation();
  const err = useErrorText();
  const { form, set, cat, errors } = p;
  const blocked = useBlockedCount(p.postId);
  if (!cat) return null;

  return (
    <div className="flex flex-col gap-4 md:grid md:grid-cols-[minmax(0,1fr)_340px] md:items-start md:gap-x-6">
      <div className="flex min-w-0 flex-col gap-4">
        {cat.has_price ? (
          <section className="flex flex-col gap-4 rounded-xl border border-border-subtle bg-bg-surface p-4">
            <h3 className="text-title text-text-primary">{t('prov.wizard.s3')}</h3>
            <TextField
              label={t('prov.wizard.price')}
              inputMode="numeric"
              autoComplete="off"
              value={groupThousands(form.price)}
              error={err(errors.price, t('common.price'))}
              helper={t('prov.wizard.priceHint')}
              onChange={(e) => set({ price: e.target.value.replace(/\D/g, '').slice(0, 13) })}
            />
            <Select
              label={t('prov.wizard.unit')}
              value={form.price_unit || cat.default_price_unit || undefined}
              options={PRICE_UNITS.map((u) => ({ value: u, label: t(`priceUnit.${u}`) }))}
              onChange={(v) => set({ price_unit: v })}
            />
          </section>
        ) : (
          <p className="rounded-xl border border-border-subtle bg-bg-surface p-4 text-caption text-text-secondary">{t('ui.prov.noPriceCategory')}</p>
        )}
        {cat.has_availability_dates && (
          <section className="flex flex-col gap-3 rounded-xl border border-border-subtle bg-bg-surface p-4">
            <h3 className="text-title text-text-primary">{t('prov.wizard.availability')}</h3>
            <p className="flex items-center gap-2 text-body text-text-primary">
              <Icon name="circle-check" size={20} className="text-status-success" />
              {blocked > 0 ? t('prov.wizard.blockedCount', { count: blocked }) : t('prov.wizard.allFree')}
            </p>
            <p className="text-caption text-text-secondary">{t('prov.wizard.blockHint')}</p>
            <Button variant="outline" size="medium" icon="calendar-x" onClick={p.onBlock} className="self-start">{t('prov.wizard.blockDays')}</Button>
          </section>
        )}
      </div>
      <aside className="md:sticky md:top-6"><PreviewCard form={form} cat={cat} /></aside>
    </div>
  );
}

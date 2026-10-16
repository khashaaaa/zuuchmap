import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CategoryView } from '@zuuchmap/core';
import { cn } from '@/lib/cn';
import { useCategoryLookup } from '@/lib/labels';
import { useFamilies } from '@/lib/queries';
import { BottomSheet } from '@/ui/BottomSheet';
import { Icon } from '@/ui/Icon';
import type { StepProps } from './shared';

/** F7: which kind of <category>. "Skip" keeps the category without a type. */
function TypeSheet({ cat, value, onPick, onClose }: { cat: CategoryView; value: string | null; onPick: (sub: string | null) => void; onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <BottomSheet open onClose={onClose} title={t('prov.wizard.whichType', { category: cat.label })}>
      <ul className="flex flex-col">
        {cat.subcategories.map((s) => (
          <li key={s.value}>
            <button
              type="button"
              aria-pressed={value === s.value}
              onClick={() => onPick(s.value)}
              className="flex min-h-12 w-full items-center justify-between rounded-md px-2 text-left text-body text-text-primary focus-visible:outline-none focus-visible:shadow-focus"
            >
              {s.label}
              {value === s.value && <Icon name="check" size={18} />}
            </button>
          </li>
        ))}
        <li>
          <button type="button" onClick={() => onPick(null)} className="flex min-h-12 w-full items-center px-2 text-left text-body text-text-secondary focus-visible:outline-none focus-visible:shadow-focus">
            {t('provider.skipSubcategory')}
          </button>
        </li>
      </ul>
    </BottomSheet>
  );
}

/** F1: families → categories; choosing one with types opens the type sheet. */
export function StepCategory({ form, set, errors, editing }: StepProps) {
  const { t } = useTranslation();
  const families = useFamilies();
  const cats = useCategoryLookup();
  const [typeFor, setTypeFor] = useState<CategoryView | null>(null);

  const choose = (c: CategoryView) => {
    if (editing && c.key !== form.category) return;
    if (c.key !== form.category) set({ category: c.key, subcategory: null, attributes: {}, price_unit: c.default_price_unit ?? '' });
    if (c.subcategories.length > 0) setTypeFor(c);
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-h2 text-text-primary">{t('prov.wizard.q1')}</h2>
        <p className="text-caption text-text-secondary">{t('prov.wizard.q1Body')}</p>
      </div>
      {errors.category && <p role="alert" className="flex items-center gap-1.5 text-small text-status-danger"><Icon name="circle-alert" size={16} />{t('prov.wizard.q1')}</p>}
      {(families.data ?? []).map((fam) => {
        const rows = fam.categories.map((k) => cats.byKey.get(k)).filter((c): c is CategoryView => !!c);
        return (
          <section key={fam.key} className="flex flex-col gap-2">
            <h3 className="text-overline text-text-secondary">{fam.label}</h3>
            <ul className="grid gap-2 md:grid-cols-2">
              {rows.map((c) => {
                const on = form.category === c.key;
                const sub = on ? c.subcategories.find((s) => s.value === form.subcategory)?.label : undefined;
                return (
                  <li key={c.key}>
                    <button
                      type="button"
                      aria-pressed={on}
                      disabled={editing && !on}
                      onClick={() => choose(c)}
                      className={cn(
                        'flex min-h-16 w-full items-center gap-3 rounded-xl border bg-bg-surface px-3 py-2 text-left focus-visible:outline-none focus-visible:shadow-focus disabled:opacity-40',
                        on ? 'border-action-primary shadow-[inset_0_0_0_1px_var(--color-action-primary)]' : 'border-border-subtle',
                      )}
                    >
                      <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-md bg-bg-surface-sunken" style={{ color: `var(--color-category-text-${c.key})` }}>
                        <Icon name={c.icon} categoryKey={c.key} size={20} />
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-body-bold text-text-primary">{c.label}</span>
                        {sub && <span className="truncate text-caption text-text-secondary">{sub}</span>}
                      </span>
                      {on ? <Icon name="circle-check" size={20} className="text-status-success" /> : <Icon name="chevron-right" size={18} className="text-icon-secondary" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
      {typeFor && (
        <TypeSheet
          cat={typeFor}
          value={form.subcategory}
          onClose={() => setTypeFor(null)}
          onPick={(sub) => {
            set({ subcategory: sub });
            setTypeFor(null);
          }}
        />
      )}
    </div>
  );
}

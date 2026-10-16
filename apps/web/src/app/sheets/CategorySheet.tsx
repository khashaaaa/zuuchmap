import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCategoryLookup } from '@/lib/labels';
import { useFamilies, useStats } from '@/lib/queries';
import { BottomSheet, SheetPresence } from '@/ui/BottomSheet';
import { Icon } from '@/ui/Icon';
import { TextField } from '@/ui/TextField';

export interface CategoryPick { category?: string; subcategory?: string; family?: string }

interface Props {
  open: boolean;
  onClose: () => void;
  onPick: (p: CategoryPick) => void;
}

function Body({ onClose, onPick }: Omit<Props, 'open'>) {
  const { t } = useTranslation();
  const cats = useCategoryLookup();
  const families = useFamilies();
  const stats = useStats();
  const [q, setQ] = useState('');
  const [sub, setSub] = useState<string | null>(null);
  const count = (key: string) => stats.data?.categories.find((c) => c.key === key)?.count ?? 0;
  const done = (p: CategoryPick) => {
    onPick(p);
    onClose();
  };

  const active = sub ? cats.byKey.get(sub) : undefined;
  if (active) {
    return (
      <BottomSheet open onClose={onClose} title={t('customer.picker.subcategory', { count: count(active.key) })} secondary={{ label: t('common.back'), onClick: () => setSub(null) }}>
        <p className="text-caption text-text-secondary">{active.label}</p>
        <ul className="flex flex-col">
          <li>
            <button type="button" onClick={() => done({ category: active.key })} className="flex min-h-12 w-full items-center px-2 text-left text-body-bold text-text-primary focus-visible:outline-none focus-visible:shadow-focus">
              {t('customer.picker.all')}
            </button>
          </li>
          {active.subcategories.map((s) => (
            <li key={s.value}>
              <button type="button" onClick={() => done({ category: active.key, subcategory: s.value })} className="flex min-h-12 w-full items-center px-2 text-left text-body text-text-primary focus-visible:outline-none focus-visible:shadow-focus">
                {s.label}
              </button>
            </li>
          ))}
        </ul>
        <p className="text-small text-text-secondary">{t('customer.picker.note')}</p>
      </BottomSheet>
    );
  }

  const needle = q.trim().toLowerCase();
  return (
    <BottomSheet open onClose={onClose} title={t('customer.picker.category')}>
      <TextField label={t('nav.search')} icon="search" placeholder={t('customer.picker.search')} value={q} onChange={(e) => setQ(e.target.value)} />
      {(families.data ?? []).map((fam) => {
        const rows = fam.categories.map((k) => cats.byKey.get(k)).filter((c) => !!c && (!needle || c.label.toLowerCase().includes(needle)));
        if (rows.length === 0) return null;
        return (
          <section key={fam.key} className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <h3 className="text-overline text-text-secondary">{fam.label}</h3>
              <button type="button" onClick={() => done({ family: fam.key })} className="h-10 px-1 text-label-strong text-text-link focus-visible:outline-none focus-visible:shadow-focus">
                {t('customer.picker.count', { count: fam.count })}
              </button>
            </div>
            <ul>
              {rows.map((c) =>
                c ? (
                  <li key={c.key}>
                    <button
                      type="button"
                      onClick={() => (c.subcategories.length ? setSub(c.key) : done({ category: c.key }))}
                      className="flex min-h-14 w-full items-center gap-3 rounded-md px-2 text-left focus-visible:outline-none focus-visible:shadow-focus"
                    >
                      <span className="inline-flex size-10 items-center justify-center rounded-md bg-bg-surface-sunken" style={{ color: `var(--color-category-text-${c.key})` }}>
                        <Icon name={c.icon} categoryKey={c.key} size={20} />
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-body-bold text-text-primary">{c.label}</span>
                        <span className="text-caption text-text-secondary">{t('customer.picker.subs', { subs: c.subcategories.length, count: count(c.key) })}</span>
                      </span>
                      <Icon name="chevron-right" size={18} className="text-icon-secondary" />
                    </button>
                  </li>
                ) : null,
              )}
            </ul>
          </section>
        );
      })}
    </BottomSheet>
  );
}

/** A6 (families → categories) and A7 (subcategories). */
export function CategorySheet({ open, ...rest }: Props) {
  return <SheetPresence open={open}><Body {...rest} /></SheetPresence>;
}

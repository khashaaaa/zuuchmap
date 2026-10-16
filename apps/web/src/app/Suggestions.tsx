import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useCategoryLookup } from '@/lib/labels';
import { readRecent } from '@/lib/search';
import { useStats } from '@/lib/queries';
import { Icon } from '@/ui/Icon';

interface Props {
  query: string;
  onCategory: (category: string, subcategory?: string) => void;
  onQuery: (q: string) => void;
}

/** A5: category/subcategory labels matching the typed prefix, else the last five searches. All client-side. */
export function Suggestions({ query, onCategory, onQuery }: Props) {
  const { t } = useTranslation();
  const cats = useCategoryLookup();
  const stats = useStats();
  const needle = query.trim().toLowerCase();
  const recent = useMemo(() => readRecent(), []);

  const rows = useMemo(() => {
    if (!needle) return [];
    const out: { key: string; label: string; icon: string; cat: string; sub?: string; count?: number }[] = [];
    for (const c of cats.list) {
      const count = stats.data?.categories.find((x) => x.key === c.key)?.count ?? 0;
      if (c.label.toLowerCase().includes(needle)) out.push({ key: c.key, label: t('customer.suggest.categoryCount', { category: c.label, count }), icon: c.icon, cat: c.key, count });
      for (const s of c.subcategories) if (s.label.toLowerCase().includes(needle)) out.push({ key: `${c.key}/${s.value}`, label: `${c.label} · ${s.label}`, icon: c.icon, cat: c.key, sub: s.value });
    }
    return out.slice(0, 6);
  }, [needle, cats.list, stats.data, t]);

  if (!needle && recent.length === 0) return null;
  const row = 'flex min-h-12 w-full items-center gap-3 rounded-md px-3 text-left text-body text-text-primary hover:bg-bg-surface-sunken focus-visible:outline-none focus-visible:shadow-focus';
  return (
    <div onMouseDown={(e) => e.preventDefault()} className="zm-pop-in absolute inset-x-0 top-full z-20 mt-1 flex flex-col gap-1 rounded-xl border border-border-elevation bg-bg-surface-raised p-2 shadow-lg">
      {needle ? (
        <>
          {rows.length > 0 && <p className="px-3 pt-1 text-overline text-text-secondary">{t('customer.suggest.categories')}</p>}
          {rows.map((r) => (
            <button key={r.key} type="button" className={row} onClick={() => onCategory(r.cat, r.sub)}>
              <Icon name={r.icon} categoryKey={r.cat} size={20} className="text-icon-secondary" />
              <span className="truncate">{r.label}</span>
            </button>
          ))}
          <button type="button" className={row} onClick={() => onQuery(query.trim())}>
            <Icon name="search" size={20} className="text-icon-secondary" />
            <span className="truncate">{query.trim()}</span>
          </button>
        </>
      ) : (
        <>
          <p className="px-3 pt-1 text-overline text-text-secondary">{t('customer.suggest.recent')}</p>
          {recent.map((r) => (
            <button key={r} type="button" className={row} onClick={() => onQuery(r)}>
              <Icon name="clock" size={20} className="text-icon-secondary" />
              <span className="truncate">{r}</span>
            </button>
          ))}
        </>
      )}
    </div>
  );
}

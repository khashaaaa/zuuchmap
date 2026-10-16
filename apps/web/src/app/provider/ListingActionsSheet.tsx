import { useTranslation } from 'react-i18next';
import type { MyListingItem } from '@zuuchmap/core';
import { cn } from '@/lib/cn';
import type { ListingFacts } from '@/lib/provider';
import { BottomSheet } from '@/ui/BottomSheet';
import { Icon } from '@/ui/Icon';

export type ListingAction = 'edit' | 'copy' | 'feature' | 'block' | 'perf' | 'delete';

interface Props {
  item: MyListingItem | null;
  facts: ListingFacts | null;
  rentable: boolean;
  onClose: () => void;
  onPick: (a: ListingAction) => void;
}

/** E12: the ⋯ sheet of a listing card. */
export function ListingActionsSheet({ item, facts, rentable, onClose, onPick }: Props) {
  const { t } = useTranslation();
  if (!item || !facts) return null;
  const live = facts.state === 'live';
  const rows: { key: ListingAction; icon: string; label: string; hint?: string; danger?: boolean }[] = [
    { key: 'edit', icon: 'pencil', label: t('prov.actions.edit') },
    { key: 'copy', icon: 'copy', label: t('prov.actions.copy'), hint: t('prov.actions.copyHint') },
  ];
  if (live) rows.push({ key: 'feature', icon: 'star', label: t('prov.actions.feature') });
  if (live && rentable) rows.push({ key: 'block', icon: 'calendar-x', label: t('prov.actions.blockDays') });
  if (facts.state !== 'draft') rows.push({ key: 'perf', icon: 'bar-chart-3', label: t('prov.actions.performance') });
  rows.push({ key: 'delete', icon: 'trash-2', label: t('prov.actions.delete'), danger: true });
  return (
    <BottomSheet open onClose={onClose} title={item.title ?? ''}>
      <ul className="flex flex-col">
        {rows.map((r) => (
          <li key={r.key}>
            <button
              type="button"
              onClick={() => onPick(r.key)}
              className={cn('flex min-h-14 w-full items-center gap-3 rounded-md px-2 text-left focus-visible:outline-none focus-visible:shadow-focus', r.danger ? 'text-status-danger' : 'text-text-primary')}
            >
              <Icon name={r.icon} size={20} className={r.danger ? 'text-status-danger' : 'text-icon-secondary'} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-body-bold">{r.label}</span>
                {r.hint && <span className="text-caption text-text-secondary">{r.hint}</span>}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </BottomSheet>
  );
}

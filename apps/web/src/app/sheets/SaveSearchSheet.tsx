import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { SAVED_SEARCH_LIMIT, type SavedSearch } from '@zuuchmap/core';
import { api, errorKey } from '@/lib/api';
import { useCategoryLookup, usePlace } from '@/lib/labels';
import { useSavedSearches } from '@/lib/queries';
import { askForPush } from '@/lib/push';
import { searchToSaved, type SearchState } from '@/lib/search';
import { useToast } from '@/lib/toast';
import { BottomSheet, SheetPresence } from '@/ui/BottomSheet';
import { EmptyState } from '@/ui/EmptyState';
import { Switch } from '@/ui/Switch';
import { TextField } from '@/ui/TextField';

interface Props {
  open: boolean;
  onClose: () => void;
  state: SearchState;
}

function Body({ onClose, state }: Omit<Props, 'open'>) {
  const { t } = useTranslation();
  const toast = useToast();
  const qc = useQueryClient();
  const place = usePlace();
  const cats = useCategoryLookup();
  const existing = useSavedSearches();
  const [name, setName] = useState(() => [state.q, place(state.province, state.district), state.category ? cats.byKey.get(state.category)?.label : undefined].filter(Boolean).join(' · '));
  const [notify, setNotify] = useState(true);
  const save = useMutation({
    mutationFn: () => api<SavedSearch>('/saved-searches', { method: 'POST', body: { name: name.trim() || t('savedSearch.title'), params: searchToSaved(state), notify } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['saved-searches'] });
      toast.success(t('posts.saved'));
      onClose();
      void askForPush('search');
    },
    onError: (e) => toast.error(t(errorKey(e))),
  });
  const full = (existing.data?.length ?? 0) >= SAVED_SEARCH_LIMIT;

  if (full) {
    return (
      <BottomSheet open onClose={onClose} title={t('savedSearch.title')}>
        <EmptyState icon="info" title={t('savedSearch.limit')} body={t('customer.saved.searchCount', { count: existing.data?.length ?? 0, limit: SAVED_SEARCH_LIMIT })} action={{ label: t('common.close'), onClick: onClose }} />
      </BottomSheet>
    );
  }
  return (
    <BottomSheet open onClose={onClose} title={t('savedSearch.title')} primary={{ label: t('savedSearch.save'), disabled: save.isPending, onClick: () => save.mutate() }}>
      <TextField label={t('savedSearch.nameLabel')} placeholder={t('savedSearch.namePlaceholder')} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
      <div className="flex items-center justify-between gap-3">
        <p className="text-caption text-text-secondary">{t('customer.saved.hint')}</p>
        <Switch label={t('customer.saved.notifyOn')} checked={notify} onChange={setNotify} />
      </div>
    </BottomSheet>
  );
}

/** C12, and C14 when the account is at the limit. */
export function SaveSearchSheet({ open, ...rest }: Props) {
  return <SheetPresence open={open}><Body {...rest} /></SheetPresence>;
}

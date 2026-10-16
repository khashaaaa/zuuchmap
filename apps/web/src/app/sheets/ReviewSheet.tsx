import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { Review } from '@zuuchmap/core';
import { api, errorKey } from '@/lib/api';
import { useRefreshDeals } from '@/lib/deals';
import { useToast } from '@/lib/toast';
import { BottomSheet, SheetPresence } from '@/ui/BottomSheet';
import { StarPicker } from '@/ui/StarPicker';
import { TextArea } from '@/ui/TextArea';

interface Props {
  open: boolean;
  onClose: () => void;
  providerId: string;
  /** "{{listing}} · {{dates}} захиалга дууссан" — present when reviewing from a booking. */
  context?: string;
  /** The viewer's existing review: the sheet edits it. */
  existing?: Review | null;
}

function Body({ onClose, providerId, context, existing }: Omit<Props, 'open'>) {
  const { t } = useTranslation();
  const toast = useToast();
  const refresh = useRefreshDeals();
  const [rating, setRating] = useState(existing?.rating ?? 0);
  const [comment, setComment] = useState(existing?.comment ?? '');
  const save = useMutation({
    mutationFn: () => api<Review>('/reviews', { method: 'POST', body: { provider_id: providerId, rating, comment: comment.trim() || null } }),
    onSuccess: () => {
      refresh();
      toast.success(t('review.submitted'));
      onClose();
    },
    onError: (e) => toast.error(t(errorKey(e))),
  });
  return (
    <BottomSheet
      open
      onClose={onClose}
      title={existing ? t('review.editRating') : t('deal.review.title')}
      primary={{ label: t('review.submit'), disabled: rating < 1 || save.isPending, onClick: () => save.mutate() }}
    >
      {context && <p className="text-caption text-text-secondary">{context}</p>}
      <StarPicker value={rating} onChange={setRating} />
      <p aria-live="polite" className="h-5 text-center text-label-strong text-text-primary">{rating > 0 ? t('deal.review.outOf', { count: rating }) : ''}</p>
      <TextArea label={t('deal.review.comment')} placeholder={t('review.comment')} value={comment} maxLength={1000} onChange={(e) => setComment(e.target.value)} />
      <p className="text-small text-text-secondary">{t('deal.review.note')}</p>
    </BottomSheet>
  );
}

/** R1: stars and a comment; `POST /reviews` writes or edits. */
export function ReviewSheet({ open, ...rest }: Props) {
  return <SheetPresence open={open}><Body {...rest} /></SheetPresence>;
}

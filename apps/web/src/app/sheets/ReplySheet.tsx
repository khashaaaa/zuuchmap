import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { Review } from '@zuuchmap/core';
import { api, errorKey } from '@/lib/api';
import { displayName, useRefreshDeals } from '@/lib/deals';
import { useToast } from '@/lib/toast';
import { BottomSheet, SheetPresence } from '@/ui/BottomSheet';
import { Rating } from '@/ui/Rating';
import { TextArea } from '@/ui/TextArea';

interface Props { open: boolean; onClose: () => void; review: Review; providerName: string }

function Body({ onClose, review, providerName }: Omit<Props, 'open'>) {
  const { t } = useTranslation();
  const toast = useToast();
  const refresh = useRefreshDeals();
  const [reply, setReply] = useState(review.reply ?? '');
  const save = useMutation({
    mutationFn: () => api<Review>(`/reviews/${review.id}/reply`, { method: 'PUT', body: { reply: reply.trim() } }),
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
      title={t('deal.review.replyTitle')}
      primary={{ label: t('deal.review.replySubmit'), disabled: !reply.trim() || save.isPending, onClick: () => save.mutate() }}
    >
      <div className="flex flex-col gap-1.5 rounded-lg bg-bg-surface-sunken px-3.5 py-3">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-label-strong text-text-primary">{displayName(review.author)}</span>
          <Rating value={review.rating} />
        </div>
        {review.comment && <p className="text-caption text-text-secondary">{review.comment}</p>}
      </div>
      <TextArea label={t('deal.review.replyLabel')} value={reply} maxLength={1000} onChange={(e) => setReply(e.target.value)} />
      <p className="text-small text-text-secondary">{t('deal.review.replyNote', { name: providerName })}</p>
    </BottomSheet>
  );
}

/** R9: the reviewed provider's one public reply (a second save edits it). */
export function ReplySheet({ open, ...rest }: Props) {
  return <SheetPresence open={open}><Body {...rest} /></SheetPresence>;
}

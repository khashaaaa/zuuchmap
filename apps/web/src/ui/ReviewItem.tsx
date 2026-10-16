import { useTranslation } from 'react-i18next';
import type { Review } from '@zuuchmap/core';
import { displayName } from '@/lib/deals';
import { useFormat } from '@/lib/useFormat';
import { Avatar } from './Avatar';
import { Rating } from './Rating';

export interface ReviewItemProps {
  review: Review;
  /** The reviewed provider's name, on the reply. */
  providerName: string;
  /** Reply / edit-reply action (the reviewed provider only). */
  onReply?: () => void;
  /** Edit action (the author only). */
  onEdit?: () => void;
}

export function ReviewItem({ review, providerName, onReply, onEdit }: ReviewItemProps) {
  const { t } = useTranslation();
  const f = useFormat();
  const author = displayName(review.author) || review.author.phone_number || '';
  const link = 'inline-flex h-12 items-center text-label-strong text-text-link focus-visible:outline-none focus-visible:shadow-focus';
  return (
    <article className="flex flex-col gap-2 border-b border-border-subtle py-4 last:border-b-0">
      <div className="flex items-center gap-3">
        <Avatar name={author} src={review.author.profile_picture ?? undefined} size="medium" />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-body-bold text-text-primary">{author}</span>
          <span className="text-small text-text-secondary">{f.date(review.date_created)}</span>
        </div>
        <Rating value={review.rating} />
      </div>
      {review.comment && <p className="whitespace-pre-wrap break-words text-body text-text-primary">{review.comment}</p>}
      {review.reply && (
        <div className="flex flex-col gap-1 rounded-lg bg-bg-surface-sunken px-3.5 py-3">
          <span className="text-label-strong text-text-primary">{t('deal.review.replied', { name: providerName })}</span>
          <p className="whitespace-pre-wrap break-words text-caption text-text-secondary">{review.reply}</p>
        </div>
      )}
      {(onReply || onEdit) && (
        <div className="flex gap-4">
          {onReply && <button type="button" onClick={onReply} className={link}>{review.reply ? t('deal.review.replyEdit') : t('deal.review.replyTitle')}</button>}
          {onEdit && <button type="button" onClick={onEdit} className={link}>{t('review.editRating')}</button>}
        </div>
      )}
    </article>
  );
}

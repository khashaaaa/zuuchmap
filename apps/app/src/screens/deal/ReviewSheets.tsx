import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { PublicUser, Review } from '@zuuchmap/core';
import { themedStyles } from '../../design/theme';
import { api, errorText } from '../../lib/api';
import { displayName } from '../../lib/deal';
import { BottomSheet } from '../../ui/BottomSheet';
import { StarPicker } from '../../ui/StarPicker';
import { TextField } from '../../ui/TextField';
import { useToast } from '../../ui/Toast';

const useStyles = themedStyles((t) => ({
  context: { padding: 14, borderRadius: t.radius.lg, backgroundColor: t.colors.bgSurfaceSunken },
  contextText: { ...t.type.labelStrong, color: t.colors.textPrimary },
  count: { ...t.type.labelStrong, color: t.colors.textPrimary, textAlign: 'center' },
  note: { ...t.type.small, color: t.colors.textSecondary },
}));

const COMMENT_MAX = 1000;

function useRefreshReviews() {
  const qc = useQueryClient();
  return () => {
    for (const k of ['reviews', 'seller', 'bookings']) void qc.invalidateQueries({ queryKey: [k] });
  };
}

// ---- R1: write or edit a review ----

export function ReviewSheet({
  visible, onClose, provider, existing, context,
}: {
  visible: boolean;
  onClose: () => void;
  provider: PublicUser;
  /** The viewer's own review: editing rewrites it. */
  existing: Review | null;
  /** The finished booking this review comes from. */
  context?: { listing: string; dates: string };
}) {
  const s = useStyles();
  const { t } = useTranslation();
  const toast = useToast();
  const refresh = useRefreshReviews();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (visible) {
      setRating(existing?.rating ?? 0);
      setComment(existing?.comment ?? '');
    }
  }, [visible, existing]);

  const submit = async () => {
    setBusy(true);
    try {
      await api('/reviews', { method: 'POST', body: { provider_id: provider.id, rating, comment: comment.trim() || null } });
      toast.show({ message: t('review.submitted'), kind: 'success' });
      refresh();
      onClose();
    } catch (e) {
      toast.show({ message: errorText(e), kind: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={existing ? t('review.editRating') : t('deal.review.title')}
      footerLabel={t('review.submit')}
      footerDisabled={rating < 1 || busy}
      onFooter={() => void submit()}
    >
      {context ? (
        <View style={s.context}>
          <Text style={s.contextText}>{t('deal.review.finished', { listing: context.listing, dates: context.dates })}</Text>
        </View>
      ) : (
        <Text style={s.contextText}>{displayName(provider)}</Text>
      )}
      <StarPicker value={rating} onChange={setRating} />
      {rating > 0 ? <Text style={s.count}>{t('deal.review.outOf', { count: rating })}</Text> : null}
      <TextField label={t('deal.review.comment')} value={comment} onChangeText={setComment} placeholder={t('review.comment')} multiline maxLength={COMMENT_MAX} />
      <Text style={s.note}>{t('deal.review.note')}</Text>
    </BottomSheet>
  );
}

// ---- R9: the provider's one public reply ----

export function ReplySheet({ visible, onClose, review, providerName }: { visible: boolean; onClose: () => void; review: Review | null; providerName: string }) {
  const s = useStyles();
  const { t } = useTranslation();
  const toast = useToast();
  const refresh = useRefreshReviews();
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (visible) setReply(review?.reply ?? '');
  }, [visible, review]);

  const submit = async () => {
    if (!review) return;
    setBusy(true);
    try {
      await api(`/reviews/${review.id}/reply`, { method: 'PUT', body: { reply: reply.trim() } });
      toast.show({ message: t('deal.review.replied', { name: providerName }), kind: 'success' });
      refresh();
      onClose();
    } catch (e) {
      toast.show({ message: errorText(e), kind: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={t('deal.review.replyTitle')}
      footerLabel={review?.reply ? t('deal.review.replyEdit') : t('deal.review.replySubmit')}
      footerDisabled={!reply.trim() || busy}
      onFooter={() => void submit()}
    >
      {review ? (
        <View style={s.context}>
          <Text style={s.contextText}>{`${displayName(review.author)} · ${'★'.repeat(review.rating)}`}</Text>
          {review.comment ? <Text style={s.note}>{review.comment}</Text> : null}
        </View>
      ) : null}
      <TextField label={t('deal.review.replyLabel')} value={reply} onChangeText={setReply} multiline maxLength={COMMENT_MAX} />
      <Text style={s.note}>{t('deal.review.replyNote', { name: providerName })}</Text>
    </BottomSheet>
  );
}

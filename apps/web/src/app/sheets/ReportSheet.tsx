import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { reportReasonsFor, type ReportReason, type Review } from '@zuuchmap/core';
import { ApiError, errorKey } from '@/lib/api';
import { useReport } from '@/lib/billing';
import { useToast } from '@/lib/toast';
import { BottomSheet } from '@/ui/BottomSheet';
import { Radio } from '@/ui/Radio';
import { Rating } from '@/ui/Rating';
import { TextArea } from '@/ui/TextArea';

export type ReportTarget =
  | { kind: 'POST'; post_id: number; title: string | null }
  | { kind: 'REVIEW'; review: Review; providerName: string };

/** Figma R2 (a listing) and R6 (a review): a reason from that kind's list, an optional note. */
export function ReportSheet({ target, onClose }: { target: ReportTarget | null; onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const report = useReport();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [detail, setDetail] = useState('');
  useEffect(() => {
    setReason(null);
    setDetail('');
  }, [target]);

  const submit = () => {
    if (!target || !reason) return;
    const body = target.kind === 'POST'
      ? { kind: 'POST' as const, post_id: target.post_id, reason, detail: detail.trim() || undefined }
      : { kind: 'REVIEW' as const, review_id: target.review.id, reason, detail: detail.trim() || undefined };
    report.mutate(body, {
      onSuccess: () => {
        toast.success(t('report.submitted'));
        onClose();
      },
      onError: (e) => {
        if (e instanceof ApiError && e.code === 'REPORT_ALREADY_OPEN') {
          toast.info(t(target.kind === 'POST' ? 'report.duplicate' : 'report.duplicateReview'));
          onClose();
        } else toast.error(t(errorKey(e)));
      },
    });
  };

  return (
    <BottomSheet
      open={!!target}
      onClose={onClose}
      title={target?.kind === 'REVIEW' ? t('report.titleReview') : t('report.title')}
      primary={{ label: report.isPending ? t('report.submitting') : t('report.submit'), onClick: submit, disabled: !reason || report.isPending }}
    >
      {target?.kind === 'POST' && target.title && <p className="text-label-strong text-text-primary">{target.title}</p>}
      {target?.kind === 'REVIEW' && (
        <div className="flex flex-col gap-1 rounded-md bg-bg-surface-sunken p-3">
          <div className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-label-strong text-text-primary">{target.review.author.given_name ?? target.providerName}</span>
            <Rating value={target.review.rating} />
          </div>
          {target.review.comment && <p className="line-clamp-3 text-caption text-text-secondary">{target.review.comment}</p>}
        </div>
      )}
      <p className="text-body text-text-secondary">{t('report.lead')}</p>
      <div role="radiogroup" aria-label={t('report.title')} className="flex flex-col">
        {target && reportReasonsFor(target.kind).map((r) => (
          <Radio key={r} name="report-reason" value={r} label={t(`report.reasons.${r}`)} checked={reason === r} onChange={() => setReason(r)} className="min-h-12" />
        ))}
      </div>
      <TextArea label={t('report.detail')} placeholder={t('report.detailPlaceholder')} value={detail} maxLength={1000} onChange={(e) => setDetail(e.target.value)} />
    </BottomSheet>
  );
}

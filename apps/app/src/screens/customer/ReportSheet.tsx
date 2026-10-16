import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { reportReasonsFor, type ReportReason, type Review } from '@zuuchmap/core';
import { themedStyles } from '../../design/theme';
import { ApiError, errorText } from '../../lib/api';
import { useReport } from '../../lib/billing';
import { BottomSheet } from '../../ui/BottomSheet';
import { Radio } from '../../ui/Radio';
import { TextField } from '../../ui/TextField';
import { useToast } from '../../ui/Toast';

export type ReportTarget = { kind: 'POST'; post_id: number; title: string | null } | { kind: 'REVIEW'; review: Review };

const useStyles = themedStyles((t) => ({
  title: { ...t.type.labelStrong, color: t.colors.textPrimary },
  lead: { ...t.type.body, color: t.colors.textSecondary },
  quote: { gap: 4, padding: 12, borderRadius: t.radius.md, backgroundColor: t.colors.bgSurfaceSunken },
  quoteText: { ...t.type.caption, color: t.colors.textSecondary },
}));

/** Figma R2 (a listing) and R6 (a review): a reason from that kind's list, an optional note. */
export function ReportSheet({ target, onClose }: { target: ReportTarget | null; onClose: () => void }) {
  const s = useStyles();
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
        toast.show({ message: t('report.submitted'), kind: 'success' });
        onClose();
      },
      onError: (e) => {
        if (e instanceof ApiError && e.code === 'REPORT_ALREADY_OPEN') {
          toast.show({ message: t(target.kind === 'POST' ? 'report.duplicate' : 'report.duplicateReview'), kind: 'info' });
          onClose();
        } else toast.show({ message: errorText(e), kind: 'error' });
      },
    });
  };

  return (
    <BottomSheet
      visible={!!target}
      onClose={onClose}
      title={target?.kind === 'REVIEW' ? t('report.titleReview') : t('report.title')}
      footerLabel={report.isPending ? t('report.submitting') : t('report.submit')}
      onFooter={submit}
      footerDisabled={!reason || report.isPending}
    >
      {target ? (
        <View style={{ gap: 12 }}>
          {target.kind === 'POST' && target.title ? <Text style={s.title}>{target.title}</Text> : null}
          {target.kind === 'REVIEW' && target.review.comment ? (
            <View style={s.quote}><Text style={s.quoteText} numberOfLines={3}>{`★${String(target.review.rating)} · ${target.review.comment}`}</Text></View>
          ) : null}
          <Text style={s.lead}>{t('report.lead')}</Text>
          <View accessibilityRole="radiogroup">
            {reportReasonsFor(target.kind).map((r) => <Radio key={r} label={t(`report.reasons.${r}`)} selected={reason === r} onPress={() => setReason(r)} />)}
          </View>
          <TextField label={t('report.detail')} value={detail} onChangeText={setDetail} placeholder={t('report.detailPlaceholder')} multiline />
        </View>
      ) : null}
    </BottomSheet>
  );
}

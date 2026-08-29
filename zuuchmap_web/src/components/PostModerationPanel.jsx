import { useTranslation } from 'react-i18next'
import { CheckCircle, XCircle, Sparkles } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import Button from './Button'
import ConfirmModal from './ConfirmModal'
import RejectReasonModal from './RejectReasonModal'
import PostDiff from './PostDiff'
import KeyboardHints from './KeyboardHints'

/** Sidebar sections: paid placement, then the verdict buttons, plus their dialogs. */
export default function PostModerationPanel({ mod, post, schema }) {
  const { t } = useTranslation()
  const { approveMut, rejectMut, featureMut, busy, hasEdits, editMode, isPendingApproval, canModerate } = mod

  // Only a window still open counts as featured — a past date is not a badge.
  const featuredUntil = post.featured_until && new Date(post.featured_until) > new Date()
    ? post.featured_until
    : null

  return (
    <>
      {/* Paid placement — approved posts only: featuring something that is
          not published yet would rank it into a list it cannot appear in. */}
      {post.approval_status === 'APPROVED' && (
        <div className="pt-4 border-t border-border/50">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles size={14} className="text-primary-text" />
            <span className="text-sm font-medium text-text">{t('admin.featured')}</span>
          </div>
          <p className="text-xs text-muted mb-2">
            {featuredUntil
              ? t('admin.featuredUntil') + ': ' + formatDate(featuredUntil)
              : t('admin.featureNone')}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {[7, 30, 90].map((days) => (
              <Button
                key={days}
                variant="outline"
                size="sm"
                onClick={() => featureMut.mutate(days)}
                disabled={featureMut.isPending}
              >
                {t('admin.featureDays', { days })}
              </Button>
            ))}
            {featuredUntil && (
              <Button
                variant="danger-outline"
                size="sm"
                onClick={() => featureMut.mutate(0)}
                disabled={featureMut.isPending}
              >
                {t('admin.featureClear')}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Shown for any state, not just PENDING: these controls used to vanish
          the moment a post was approved, so a mis-click on the queue's one-click
          approve had no way back — even though the API allows it and the app
          offers it. Approving an approved post is meaningless, so each state
          offers only the move that changes something. */}
      <div className="pt-4 border-t border-border/50 space-y-2">
        {isPendingApproval && <PostDiff post={post} schema={schema} />}
        {hasEdits && editMode && (
          <p className="text-xs text-muted italic">{t('admin.editHint')}</p>
        )}
        {post.approval_status !== 'APPROVED' && (
          <Button className="w-full" onClick={() => mod.setApproveOpen(true)} disabled={busy}>
            <CheckCircle size={15} />
            {hasEdits ? t('admin.saveAndApprove')
              : isPendingApproval ? t('admin.approve')
                : t('admin.reinstate')}
          </Button>
        )}
        {post.approval_status !== 'REJECTED' && (
          <Button variant="danger" className="w-full" onClick={() => mod.setRejectOpen(true)} disabled={busy}>
            <XCircle size={15} />
            {isPendingApproval ? t('admin.reject') : t('admin.takeDown')}
          </Button>
        )}
        {!isPendingApproval && (
          <p className="text-xs text-muted">
            {post.approval_status === 'APPROVED' ? t('admin.takeDownHint') : t('admin.reinstateHint')}
          </p>
        )}
      </div>

      <RejectReasonModal
        key={mod.rejectOpen ? 'open' : 'closed'}
        open={mod.rejectOpen}
        onClose={() => mod.setRejectOpen(false)}
        isPending={rejectMut.isPending}
        schema={schema}
        onConfirm={(reason, fieldKey) => rejectMut.mutate({ reason, fieldKey })}
      />

      {canModerate && (
        <KeyboardHints hints={[
          { keys: ['A'], label: t('admin.hotkeyApprove') },
          { keys: ['R'], label: t('admin.hotkeyReject') },
          { keys: ['Esc'], label: t('admin.hotkeyClose') },
        ]} />
      )}

      {/* Approve confirm — symmetry with reject: no verdict on a single click */}
      <ConfirmModal
        open={mod.approveOpen}
        onClose={() => mod.setApproveOpen(false)}
        title={hasEdits ? t('admin.saveAndApprove') : t('admin.approve')}
        message={t('admin.confirmApprove')}
        confirmLabel={hasEdits ? t('admin.saveAndApprove') : t('admin.approve')}
        confirmVariant="primary"
        cancelLabel={t('common.cancel')}
        onConfirm={() => approveMut.mutate()}
        isPending={approveMut.isPending}
      />
    </>
  )
}

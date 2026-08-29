import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { adminApi } from '@/lib/api'
import { goBack } from '@/lib/utils'
import { invalidatePostQueries } from '@/lib/queryClient'
import { useApiMutation } from '@/hooks/useApiMutation'
import { useHotkeys } from '@/hooks/useHotkeys'

/**
 * Admin moderation state for one post: the inline title/details edit, the
 * approve/reject verdicts (edits ride along with the verdict — saved inside
 * the same mutation so a failed save surfaces as an error instead of silently
 * approving unedited), and the queue hotkeys. The page renders the edit
 * controls where the title and details live; the panel renders the rest.
 */
export function usePostModeration({ post, id, isAdmin, cameFromQueue }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [editMode, setEditMode] = useState(false)
  // The draft is keyed on the post id: a draft for another post is simply
  // ignored, so navigating between posts needs no reset effect, and an
  // untouched field (null) is the post's own value — there is no first frame
  // where '' !== originalTitle reads as an edit.
  const [draft, setDraft] = useState({ id: null, title: null, details: null })
  const [approveOpen, setApproveOpen] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)
  const live = draft.id === post?.id ? draft : { title: null, details: null }

  const originalTitle = post?.title || post?.name || ''
  const originalDetails = post?.details || post?.description || ''
  const editedTitle = live.title ?? originalTitle
  const editedDetails = live.details ?? originalDetails
  const setEditedTitle = (title) =>
    setDraft((d) => ({ id: post?.id, title, details: d.id === post?.id ? d.details : null }))
  const setEditedDetails = (details) =>
    setDraft((d) => ({ id: post?.id, details, title: d.id === post?.id ? d.title : null }))
  const hasEdits = editedTitle.trim() !== originalTitle || editedDetails.trim() !== originalDetails

  const saveEditsIfNeeded = async () => {
    if (hasEdits) {
      await adminApi.editPost(id, { title: editedTitle.trim() || undefined, details: editedDetails.trim() || undefined })
    }
  }

  const settle = () => invalidatePostQueries(qc, { postId: id })

  const approveMut = useMutation({
    mutationFn: async () => {
      await saveEditsIfNeeded()
      return adminApi.approve(id)
    },
    onSuccess: () => {
      settle()
      setApproveOpen(false)
      toast.success(t('admin.approveSuccess'))
      // Back to the queue. Parking on the post just decided meant the admin had
      // to navigate out and re-find their place for every single item.
      if (cameFromQueue) navigate('/admin/posts')
    },
    onError: () => toast.error(t('admin.approveError')),
  })

  const rejectMut = useMutation({
    // The reason arrives as the mutation argument, not from state: the dialog
    // owns it, and reading a just-set state value here would send the previous
    // rejection's text.
    mutationFn: async ({ reason, fieldKey }) => {
      await saveEditsIfNeeded()
      return adminApi.reject(id, reason, fieldKey)
    },
    onSuccess: () => {
      settle()
      setRejectOpen(false)
      toast.success(t('admin.rejectSuccess'))
      if (cameFromQueue) navigate('/admin/posts')
    },
    onError: () => toast.error(t('admin.rejectError')),
  })

  // Paid placement. Phase 1 fulfils it manually, so the control lives beside
  // approve/reject rather than behind a checkout — the admin opens the window
  // once payment has landed, and 0 days closes it again.
  const featureMut = useApiMutation({
    mutationFn: (days) => adminApi.feature(id, days),
    onSuccess: (_res, days) => {
      qc.invalidateQueries({ queryKey: ['post', id] })
      qc.invalidateQueries({ queryKey: ['posts'] })
      toast.success(days > 0 ? t('admin.featureApplied', { days }) : t('admin.featureCleared'))
    },
  })

  const busy = approveMut.isPending || rejectMut.isPending
  const isPendingApproval = post?.approval_status === 'PENDING'
  // Same keys as the queue, so an admin who opened a post with Enter can decide
  // it without reaching for the mouse. Esc returns to the queue.
  const canModerate = Boolean(isAdmin && isPendingApproval)
  useHotkeys({
    a: () => !busy && setApproveOpen(true),
    r: () => !busy && setRejectOpen(true),
    Escape: () => goBack(navigate, '/admin/posts'),
  }, { enabled: canModerate })

  return {
    editMode, toggleEditMode: () => setEditMode((p) => !p),
    editedTitle, setEditedTitle, editedDetails, setEditedDetails, hasEdits,
    approveOpen, setApproveOpen, rejectOpen, setRejectOpen,
    approveMut, rejectMut, featureMut, busy, canModerate, isPendingApproval,
  }
}

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import Modal from '@/components/Modal'
import Button from '@/components/Button'
import Input from '@/components/Input'
import { getFieldLabel } from '@/lib/utils'

const BASE_FIELDS = ['title', 'details', 'price', 'images', 'location']
const BASE_LABEL_KEYS = { title: 'posts.title', details: 'posts.details', price: 'posts.priceAmount', images: 'posts.images', location: 'posts.location' }

/**
 * Asks for a rejection reason. Shared by the moderation queue and the post
 * detail page so rejecting costs the same wherever the admin happens to be —
 * it used to live only on the detail page, which meant approving was one click
 * from the list while rejecting required opening the post first. The careful
 * decision should not be the expensive one.
 *
 * The reason is required (the server refuses a blank one) and the preset chips
 * fill the box rather than replacing it, so a common reason is one tap and an
 * unusual one is still typeable.
 *
 * Callers pass a `key` that changes per post, so React gives each rejection a
 * fresh instance. A reason belongs to the post it was written for — carrying it
 * into the next one is how the wrong explanation reaches a provider.
 *
 * `schema` (the post's category schema) enables an optional "which field?"
 * pick — base post fields plus the schema's own — sent as `field_key` so the
 * provider's edit form can point at the exact thing to fix.
 */
export default function RejectReasonModal({ open, onClose, onConfirm, isPending, title, schema }) {
  const { t } = useTranslation()
  const [reason, setReason] = useState('')
  const [fieldKey, setFieldKey] = useState('')
  const schemaFields = schema?.fields ?? []
  const presets = Object.values(t('admin.reasonTypes', { returnObjects: true }))

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title ?? t('admin.rejectReason')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isPending}>{t('common.cancel')}</Button>
          <Button variant="danger" onClick={() => onConfirm(reason, fieldKey || undefined)} disabled={!reason.trim() || isPending}>
            {isPending ? t('common.loading') : t('admin.reject')}
          </Button>
        </>
      }
    >
      <p className="text-xs text-muted mb-2">{t('admin.rejectNotice')}</p>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {presets.map((label) => (
          <button
            key={label}
            type="button"
            onClick={() => setReason(label)}
            className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
              reason === label
                ? 'border-danger/50 bg-danger/10 text-danger'
                : 'border-border/50 text-muted hover:text-text'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <Input
        as="textarea"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={3}
        aria-label={t('admin.rejectReason')}
        className="resize-none"
      />
      <div className="mt-3">
        <label htmlFor="reject-field" className="field-label">{t('admin.rejectFieldLabel')}</label>
        <Input as="select" id="reject-field" value={fieldKey} onChange={(e) => setFieldKey(e.target.value)}>
          <option value="">{t('admin.rejectFieldNone')}</option>
          <optgroup label={t('posts.basicInfo')}>
            {BASE_FIELDS.map((k) => <option key={k} value={k}>{t(BASE_LABEL_KEYS[k])}</option>)}
          </optgroup>
          {schemaFields.length > 0 && (
            <optgroup label={t('posts.categoryDetails')}>
              {schemaFields.map((f) => <option key={f.key} value={f.key}>{getFieldLabel(f, t)}</option>)}
            </optgroup>
          )}
        </Input>
        <p className="text-xs text-muted mt-1">{t('admin.rejectFieldHint')}</p>
      </div>
    </Modal>
  )
}

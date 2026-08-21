import { useTranslation } from 'react-i18next'
import Modal from './Modal'
import Button from './Button'

export default function ConfirmModal({
  open,
  onClose,
  title,
  message,
  confirmLabel,
  loadingLabel,
  onConfirm,
  isPending = false,
  confirmVariant = 'danger',
  cancelLabel,
  children,
}) {
  const { t } = useTranslation()
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isPending}>
            {cancelLabel ?? t('common.cancel')}
          </Button>
          <Button variant={confirmVariant} onClick={onConfirm} disabled={isPending}>
            {isPending ? (loadingLabel ?? t('common.loading')) : (confirmLabel ?? t('common.confirm'))}
          </Button>
        </>
      }
    >
      {children ?? (message && <p className="text-sm text-muted">{message}</p>)}
    </Modal>
  )
}

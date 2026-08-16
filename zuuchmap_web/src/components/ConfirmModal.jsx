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
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isPending}>
            {cancelLabel ?? 'Cancel'}
          </Button>
          <Button variant={confirmVariant} onClick={onConfirm} disabled={isPending}>
            {isPending && loadingLabel ? loadingLabel : (confirmLabel ?? 'Confirm')}
          </Button>
        </>
      }
    >
      {children ?? (message && <p className="text-sm text-muted">{message}</p>)}
    </Modal>
  )
}

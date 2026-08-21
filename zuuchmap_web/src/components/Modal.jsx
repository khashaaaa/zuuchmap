import { useEffect, useRef } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

const FOCUSABLE_SELECTOR = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

const SIZES = {
  md: 'max-w-md',
  lg: 'max-w-2xl',
}

export default function Modal({ open, onClose, title, children, footer, tabs, size = 'md' }) {
  const panelRef = useRef(null)
  const { t } = useTranslation()
  const shouldReduceMotion = useReducedMotion()

  useEffect(() => {
    if (!open) return
    const handler = (e) => {
      if (e.key === 'Escape') { onClose(); return }
      if (e.key === 'Tab') {
        const panel = panelRef.current
        if (!panel) return
        const focusable = Array.from(panel.querySelectorAll(FOCUSABLE_SELECTOR))
        if (focusable.length === 0) return
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    window.addEventListener('keydown', handler)
    panelRef.current?.focus()
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: shouldReduceMotion ? 0 : 0.15 }}
          className="fixed inset-0 z-[1200] flex items-center justify-center p-4 bg-scrim"
          onClick={(e) => e.target === e.currentTarget && onClose()}
        >
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
            tabIndex={-1}
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ duration: shouldReduceMotion ? 0 : 0.15 }}
            className={`bg-surface border border-border/50 rounded-modal w-full ${SIZES[size]} shadow-card flex flex-col max-h-[90vh]`}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-border/50 shrink-0">
              <h2 id="modal-title" className="text-base font-semibold text-text">{title}</h2>
              <button onClick={onClose} aria-label={t('common.close')} className="min-w-[44px] min-h-[44px] -mr-2 flex items-center justify-center rounded-btn text-muted hover:text-text hover:bg-surface2 transition-colors">
                <X size={18} />
              </button>
            </div>
            {tabs && <div className="px-5 pt-3 pb-3 border-b border-border/50 shrink-0">{tabs}</div>}
            <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
            {footer && <div className="px-5 pt-3 pb-5 flex justify-end gap-3 shrink-0">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

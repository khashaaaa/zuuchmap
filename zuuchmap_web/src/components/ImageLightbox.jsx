import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight, X as CloseIcon } from 'lucide-react'
import { getImageUrl, hideBrokenImage, lockScroll } from '@/lib/utils'
import { useFocusTrap } from '@/hooks/useFocusTrap'

/**
 * Full-bleed photo view. The detail card crops to 16:10, so a wide machine or
 * a tall crane was only ever shown in part; here the whole frame fits.
 * Portalled to <body> for the same reason Modal is. Carries role="dialog",
 * which useHotkeys treats as "the dialog owns the keyboard" — so it binds its
 * own arrow keys and locks the page behind it the way Modal does.
 */
export default function ImageLightbox({ images, index, title, onClose, onStep, onTouchStart, onTouchEnd }) {
  const { t } = useTranslation()
  const panelRef = useRef(null)
  const count = images.length

  useFocusTrap(panelRef, true, { onEscape: onClose, restoreFocus: true, autoFocus: false })

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowLeft') onStep(-1)
      else if (e.key === 'ArrowRight') onStep(1)
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    const unlock = lockScroll()
    return () => { window.removeEventListener('keydown', onKey); unlock() }
  }, [onStep])

  const arrowLabel = (delta) => t('posts.viewImage', { index: ((index + delta + count) % count) + 1 })

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-[1300] bg-black/95 flex items-center justify-center"
      onClick={onClose}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <img
        src={getImageUrl(images[index])}
        alt={title}
        className="max-w-full max-h-full object-contain"
        onClick={(e) => e.stopPropagation()}
        onError={hideBrokenImage}
      />
      <button
        type="button"
        onClick={onClose}
        aria-label={t('common.close')}
        autoFocus
        className="absolute top-3 right-3 min-w-touch min-h-touch flex items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25 transition-colors"
      >
        <CloseIcon size={20} />
      </button>
      {count > 1 && (
        <>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onStep(-1) }}
            aria-label={arrowLabel(-1)}
            className="absolute left-3 top-1/2 -translate-y-1/2 min-w-touch min-h-touch flex items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25 transition-colors"
          >
            <ChevronLeft size={22} />
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onStep(1) }}
            aria-label={arrowLabel(1)}
            className="absolute right-3 top-1/2 -translate-y-1/2 min-w-touch min-h-touch flex items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25 transition-colors"
          >
            <ChevronRight size={22} />
          </button>
          <span className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-btn bg-white/15 px-2.5 py-1 text-xs font-medium text-white tabular-nums">
            {index + 1} / {count}
          </span>
        </>
      )}
    </div>,
    document.body,
  )
}

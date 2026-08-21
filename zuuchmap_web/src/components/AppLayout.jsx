import { useEffect, useRef, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import AppSidebar from './AppSidebar'
import AppHeader from './AppHeader'
import { useRealtimeSync } from '@/hooks/useRealtimeSync'

const FOCUSABLE_SELECTOR = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

export default function AppLayout() {
  useRealtimeSync()
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()
  const shouldReduceMotion = useReducedMotion()
  const { t } = useTranslation()
  const drawerRef = useRef(null)
  const lastFocusedRef = useRef(null)

  // The mobile drawer is a modal surface — same Escape / focus-trap / focus-
  // return contract as Modal.jsx, otherwise keyboard users tab into the page
  // behind the scrim and can't dismiss it.
  useEffect(() => {
    if (!mobileOpen) return
    lastFocusedRef.current = document.activeElement
    const handler = (e) => {
      if (e.key === 'Escape') { setMobileOpen(false); return }
      if (e.key === 'Tab') {
        const panel = drawerRef.current
        if (!panel) return
        const focusable = Array.from(panel.querySelectorAll(FOCUSABLE_SELECTOR))
        if (focusable.length === 0) return
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    window.addEventListener('keydown', handler)
    drawerRef.current?.focus()
    return () => {
      window.removeEventListener('keydown', handler)
      lastFocusedRef.current?.focus?.()
    }
  }, [mobileOpen])

  return (
    <div className="flex h-full overflow-hidden bg-background">
      {/* Desktop sidebar */}
      <div className="hidden md:flex">
        <AppSidebar />
      </div>

      {/* Mobile sidebar overlay */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-scrim z-40 md:hidden"
              onClick={() => setMobileOpen(false)}
            />
            <motion.div
              ref={drawerRef}
              role="dialog"
              aria-modal="true"
              aria-label={t('nav.menu')}
              tabIndex={-1}
              initial={{ x: -240 }}
              animate={{ x: 0 }}
              exit={{ x: -240 }}
              transition={shouldReduceMotion ? { duration: 0 } : { type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed left-0 top-0 h-full z-50 md:hidden"
            >
              <AppSidebar onNavigate={() => setMobileOpen(false)} />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Main */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <AppHeader onMenuClick={() => setMobileOpen(true)} />
        <main className="flex-1 overflow-y-auto">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: shouldReduceMotion ? 0 : 0.14 }}
            className="p-3 md:p-6 min-h-full"
          >
            <Outlet />
          </motion.div>
        </main>
      </div>
    </div>
  )
}

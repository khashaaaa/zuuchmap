import { useEffect, useRef, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import AppSidebar from './AppSidebar'
import AppHeader from './AppHeader'
import useOnline from '@/hooks/useOnline'
import { APP_SCROLL_ID } from '@/lib/utils'
import { WifiOff } from 'lucide-react'
import ErrorBoundary from './ErrorBoundary'
import { useFocusTrap } from '@/hooks/useFocusTrap'
import { useQueryClient } from '@tanstack/react-query'

export default function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()
  const shouldReduceMotion = useReducedMotion()
  const { t } = useTranslation()
  const online = useOnline()
  const drawerRef = useRef(null)
  const mainRef = useRef(null)
  const qc = useQueryClient()

  // The document never scrolls in here (the shell is `h-full overflow-hidden`),
  // so the browser has no scroll position to restore and React Router's own
  // restoration never applies. Without this, walking the moderation queue into
  // a post detail opened it halfway down, at the offset the list was left at.
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0, behavior: 'auto' })
  }, [location.pathname])

  // The mobile drawer is a modal surface — same Escape / focus-trap / focus-
  // return contract as Modal.jsx.
  useFocusTrap(drawerRef, mobileOpen, { onEscape: () => setMobileOpen(false), restoreFocus: true })

  return (
    <div className="flex h-full overflow-hidden bg-background">
      {/* Desktop sidebar. `lg`, not `md`: at 768–1023 the 240px rail left 528px
          for content, and every page's own desktop layout (3-column grids,
          tables) also switches on `md`, so tablet portrait got desktop layouts
          in a phone's width. Below `lg` the drawer serves. */}
      <div className="hidden lg:flex">
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
              transition={{ duration: shouldReduceMotion ? 0 : 0.15 }}
              className="fixed inset-0 bg-scrim z-50 lg:hidden"
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
              className="fixed left-0 top-0 h-full z-[60] lg:hidden"

            >
              <AppSidebar onNavigate={() => setMobileOpen(false)} />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Main */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <AppHeader onMenuClick={() => setMobileOpen(true)} />
        {/* One banner for the whole app. Offline used to be visible on browse
            and nowhere else, so a booking or a post submitted on a dead
            connection came back as a generic server error. */}
        {!online && (
          <div
            role="status"
            className="flex items-center justify-center gap-2 px-3 py-1.5 bg-warning/15 text-warning text-xs font-medium border-b border-warning/20"
          >
            <WifiOff size={13} aria-hidden="true" />
            {t('offline.noConnection')}
          </div>
        )}
        <main id={APP_SCROLL_ID} ref={mainRef} className="flex-1 overflow-y-auto">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: shouldReduceMotion ? 0 : 0.14 }}
            className="p-3 md:p-6 min-h-full"
          >
            {/* Keyed on the path: a page that threw must not keep its error
                state once the user navigates somewhere else. */}
            <ErrorBoundary key={location.pathname} queryClient={qc}>
              <Outlet />
            </ErrorBoundary>
          </motion.div>
        </main>
      </div>
    </div>
  )
}

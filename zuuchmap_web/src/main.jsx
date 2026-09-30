import './i18n'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import './index.css'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import { queryClient } from './lib/queryClient'
import { useThemeStore } from './store'
import { initObservability } from './lib/observability'

// Before the tree renders, so a crash during the first paint is still reported.
// No-op without VITE_SENTRY_DSN.
initObservability()

// A deploy replaces the hashed chunks, so a tab opened before it asks for a
// lazy route's file that is no longer there. Reload once to pick up the new
// index; the timestamp stops a genuinely missing chunk from looping.
window.addEventListener('vite:preloadError', (event) => {
  const KEY = 'zm_chunk_reload'
  let last = 0
  try { last = Number(sessionStorage.getItem(KEY)) || 0 } catch { /* private mode */ }
  if (Date.now() - last < 30_000) return
  try { sessionStorage.setItem(KEY, String(Date.now())) } catch { /* private mode */ }
  event.preventDefault()
  window.location.reload()
})

// A data router (rather than <BrowserRouter>) so useBlocker can guard
// in-app navigation away from dirty forms. App keeps its own <Routes>.
const router = createBrowserRouter([{ path: '*', element: <App /> }])

// sonner defaults to its light theme regardless of the page theme — feed it
// the store's value so toasts match the UI.
function ThemedToaster() {
  const theme = useThemeStore((s) => s.theme)
  return <Toaster richColors theme={theme} position="top-right" />
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
        <ThemedToaster />
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>
)

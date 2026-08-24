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

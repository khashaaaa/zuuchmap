import { useEffect } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AnimatePresence, useReducedMotion } from 'framer-motion'
import { useQueryClient } from '@tanstack/react-query'
import { useAuthStore, useThemeStore } from './store'
import AppLayout from './components/AppLayout'
import { AdminRoute, ProviderRoute, CustomerRoute } from './components/ProtectedRoute'
import ErrorBoundary from './components/ErrorBoundary'
import { trackPageView } from './lib/analytics'

import LandingPage from './pages/LandingPage'
import PublicHeader from './components/PublicHeader'
import LoginPage from './pages/LoginPage'
import VerifyPage from './pages/VerifyPage'
import RoleSelectPage from './pages/RoleSelectPage'
import PostDetail from './pages/PostDetail'
import PolicyPage from './pages/PolicyPage'
import HelpPage from './pages/HelpPage'
import AccountDeletion from './pages/AccountDeletion'
import AdminDashboard from './pages/AdminDashboard'
import AdminPosts from './pages/AdminPosts'
import AdminUsers from './pages/AdminUsers'
import AdminUserDetail from './pages/AdminUserDetail'
import AdminCategories from './pages/AdminCategories'
import AdminAnalytics from './pages/AdminAnalytics'
import ProviderDashboard from './pages/ProviderDashboard'
import ProviderPosts from './pages/ProviderPosts'
import ProviderPostForm from './pages/ProviderPostForm'
import ProviderProfile from './pages/ProviderProfile'
import ProviderCompany from './pages/ProviderCompany'
import Bookings from './pages/Bookings'
import CustomerDashboard from './pages/CustomerDashboard'
import CustomerBrowse from './pages/CustomerBrowse'
import CustomerMap from './pages/CustomerMap'
import CustomerSaved from './pages/CustomerSaved'
import CustomerProfile from './pages/CustomerProfile'

function RootRedirect() {
  const { token, user, isAdmin, isLoading } = useAuthStore()
  if (isLoading) return null
  // Signed-out visitors get the marketplace, not a phone-number wall.
  if (!token) return <LandingPage />
  if (isAdmin) return <Navigate to="/admin" replace />
  if (user?.type === 'PROVIDER') return <Navigate to="/provider" replace />
  if (user?.type === 'CUSTOMER') return <Navigate to="/customer" replace />
  return <Navigate to="/onboarding" replace />
}

/** Signed-out browsing. Signed-in customers keep the full app shell instead. */
function PublicBrowse() {
  const { token, user, isAdmin, isLoading } = useAuthStore()
  if (isLoading) return null
  if (token && !isAdmin && user?.type === 'CUSTOMER') {
    return <Navigate to="/customer/browse" replace />
  }
  return (
    <div className="min-h-screen bg-background">
      <PublicHeader />
      <div className="max-w-6xl mx-auto px-4 py-6">
        <CustomerBrowse />
      </div>
    </div>
  )
}

export default function App() {
  const hydrate = useAuthStore((s) => s.hydrate)
  const theme = useThemeStore((s) => s.theme)
  const location = useLocation()
  const qc = useQueryClient()
  const shouldReduceMotion = useReducedMotion()

  useEffect(() => { hydrate() }, []) // eslint-disable-line

  // Store is the single source of truth for the theme — keep the DOM attribute
  // in lockstep so chrome (CSS vars) and JS consumers (map tiles) never diverge.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  // One page.view per navigation — the top of every funnel in the admin charts.
  useEffect(() => { trackPageView(location.pathname) }, [location.pathname])

  return (
    <AnimatePresence mode={shouldReduceMotion ? 'sync' : 'wait'}>
      <Routes location={location} key={location.pathname}>
        {/* Public */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/verify" element={<VerifyPage />} />
        <Route path="/onboarding" element={<RoleSelectPage />} />
        <Route path="/browse" element={<PublicBrowse />} />
        <Route path="/posts/:id" element={<div className="min-h-screen bg-background"><PublicHeader /><PostDetail /></div>} />
        <Route path="/privacy" element={<PolicyPage doc="privacy" />} />
        <Route path="/terms" element={<PolicyPage doc="terms" />} />
        <Route path="/help" element={<HelpPage />} />
        <Route path="/account-deletion" element={<AccountDeletion />} />

        {/* Admin only */}
        <Route element={<AdminRoute />}>
          <Route element={<AppLayout />}>
            <Route path="/admin" element={<ErrorBoundary queryClient={qc}><AdminDashboard /></ErrorBoundary>} />
            <Route path="/admin/posts" element={<ErrorBoundary queryClient={qc}><AdminPosts /></ErrorBoundary>} />
            <Route path="/admin/posts/:id" element={<ErrorBoundary queryClient={qc}><PostDetail /></ErrorBoundary>} />
            <Route path="/admin/users" element={<ErrorBoundary queryClient={qc}><AdminUsers /></ErrorBoundary>} />
            <Route path="/admin/users/:id" element={<ErrorBoundary queryClient={qc}><AdminUserDetail /></ErrorBoundary>} />
            <Route path="/admin/categories" element={<ErrorBoundary queryClient={qc}><AdminCategories /></ErrorBoundary>} />
            <Route path="/admin/analytics" element={<ErrorBoundary queryClient={qc}><AdminAnalytics /></ErrorBoundary>} />
            <Route path="/admin/profile" element={<ErrorBoundary queryClient={qc}><ProviderProfile /></ErrorBoundary>} />
          </Route>
        </Route>

        {/* Provider (and admin-providers) */}
        <Route element={<ProviderRoute />}>
          <Route element={<AppLayout />}>
            <Route path="/provider" element={<ErrorBoundary queryClient={qc}><ProviderDashboard /></ErrorBoundary>} />
            <Route path="/provider/posts" element={<ErrorBoundary queryClient={qc}><ProviderPosts /></ErrorBoundary>} />
            <Route path="/provider/posts/new" element={<ErrorBoundary queryClient={qc}><ProviderPostForm /></ErrorBoundary>} />
            <Route path="/provider/posts/:id" element={<ErrorBoundary queryClient={qc}><PostDetail /></ErrorBoundary>} />
            <Route path="/provider/posts/:id/edit" element={<ErrorBoundary queryClient={qc}><ProviderPostForm /></ErrorBoundary>} />
            <Route path="/provider/profile" element={<ErrorBoundary queryClient={qc}><ProviderProfile /></ErrorBoundary>} />
            <Route path="/provider/company" element={<ErrorBoundary queryClient={qc}><ProviderCompany /></ErrorBoundary>} />
            <Route path="/provider/bookings" element={<ErrorBoundary queryClient={qc}><Bookings mode="provider" /></ErrorBoundary>} />
          </Route>
        </Route>

        {/* Customer only */}
        <Route element={<CustomerRoute />}>
          <Route element={<AppLayout />}>
            <Route path="/customer" element={<ErrorBoundary queryClient={qc}><CustomerDashboard /></ErrorBoundary>} />
            <Route path="/customer/browse" element={<ErrorBoundary queryClient={qc}><CustomerBrowse /></ErrorBoundary>} />
            <Route path="/customer/map" element={<ErrorBoundary queryClient={qc}><CustomerMap /></ErrorBoundary>} />
            <Route path="/customer/saved" element={<ErrorBoundary queryClient={qc}><CustomerSaved /></ErrorBoundary>} />
            <Route path="/customer/profile" element={<ErrorBoundary queryClient={qc}><CustomerProfile /></ErrorBoundary>} />
            <Route path="/customer/bookings" element={<ErrorBoundary queryClient={qc}><Bookings mode="customer" /></ErrorBoundary>} />
          </Route>
        </Route>

        <Route path="/" element={<RootRedirect />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AnimatePresence>
  )
}

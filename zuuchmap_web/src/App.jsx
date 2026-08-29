import { useEffect, lazy, Suspense } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuthStore, useThemeStore } from './store'
import AppLayout from './components/AppLayout'
import { AdminRoute, ProviderRoute, CustomerRoute, AuthedRoute } from './components/ProtectedRoute'
import ErrorBoundary from './components/ErrorBoundary'
import { useRealtimeSync } from './hooks/useRealtimeSync'
import { useProfile } from './hooks/useProfile'
import { trackPageView } from './lib/analytics'
import { queryClient } from './lib/queryClient'

// The landing page and the public chrome stay in the entry chunk: `/` is the
// most common first paint, and making it wait on a second round trip is the
// one place code-splitting would cost more than it saves.
import LandingPage from './pages/LandingPage'
import PublicHeader from './components/PublicHeader'
import PublicFooter from './components/PublicFooter'

// Everything else is route-split. Before this, all 41 routes lived in one
// 1.07MB chunk — an anonymous visitor downloaded the whole admin console and
// Leaflet (used by 2 routes) to read a listing.
const LoginPage = lazy(() => import('./pages/LoginPage'))
const VerifyPage = lazy(() => import('./pages/VerifyPage'))
const RoleSelectPage = lazy(() => import('./pages/RoleSelectPage'))
const PostDetail = lazy(() => import('./pages/PostDetail'))
const PolicyPage = lazy(() => import('./pages/PolicyPage'))
const HelpPage = lazy(() => import('./pages/HelpPage'))
const AccountDeletion = lazy(() => import('./pages/AccountDeletion'))
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'))
const AdminPosts = lazy(() => import('./pages/AdminPosts'))
const AdminUsers = lazy(() => import('./pages/AdminUsers'))
const AdminUserDetail = lazy(() => import('./pages/AdminUserDetail'))
const AdminCategories = lazy(() => import('./pages/AdminCategories'))
const AdminAnalytics = lazy(() => import('./pages/AdminAnalytics'))
const ProviderDashboard = lazy(() => import('./pages/ProviderDashboard'))
const ProviderPosts = lazy(() => import('./pages/ProviderPosts'))
const ProviderPostForm = lazy(() => import('./pages/ProviderPostForm'))
const ProfilePage = lazy(() => import('./pages/ProfilePage'))
const ProviderCompany = lazy(() => import('./pages/ProviderCompany'))
const Bookings = lazy(() => import('./pages/Bookings'))
const CustomerDashboard = lazy(() => import('./pages/CustomerDashboard'))
const CustomerBrowse = lazy(() => import('./pages/CustomerBrowse'))
const CustomerMap = lazy(() => import('./pages/CustomerMap'))
const CustomerSaved = lazy(() => import('./pages/CustomerSaved'))
const NotificationsPage = lazy(() => import('./pages/NotificationsPage'))
const SavedSearchesPage = lazy(() => import('./pages/SavedSearchesPage'))
const MessagesPage = lazy(() => import('./pages/MessagesPage'))
const MessageThread = lazy(() => import('./pages/MessageThread'))
const ProviderBilling = lazy(() => import('./pages/ProviderBilling'))
const AdminReports = lazy(() => import('./pages/AdminReports'))

/**
 * Chunk-load placeholder. Deliberately the same `.skeleton` tile the data
 * loaders use, so a slow chunk and a slow query look like one wait rather than
 * two different kinds of loading.
 */
function RouteFallback() {
  return (
    <div className="max-w-6xl w-full mx-auto px-4 py-6">
      <div className="h-8 w-48 skeleton rounded-btn mb-4" />
      <div className="h-64 skeleton rounded-card" />
    </div>
  )
}

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
    <div className="min-h-screen bg-background flex flex-col" style={{ '--sticky-offset': '5rem' }}>
      <PublicHeader />
      <div className="max-w-6xl w-full mx-auto px-4 py-6 flex-1">
        <CustomerBrowse />
      </div>
      <PublicFooter />
    </div>
  )
}

export default function App() {
  const hydrate = useAuthStore((s) => s.hydrate)
  const theme = useThemeStore((s) => s.theme)
  const location = useLocation()

  // Lives here, above the pathname-keyed <Routes> — inside AppLayout it was
  // remounted on every navigation, tearing down and re-handshaking the
  // WebSocket each time (dropped events + a connect storm on the server).
  useRealtimeSync()
  // Mounted once for the whole app: fetches the profile as soon as a token is
  // known and keeps the store's identity (type / is_admin) in step with the server.
  useProfile()

  useEffect(() => { hydrate() }, []) // eslint-disable-line

  // Store is the single source of truth for the theme — keep the DOM attribute
  // in lockstep so chrome (CSS vars) and JS consumers (map tiles) never diverge.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  // One page.view per navigation — the top of every funnel in the admin charts.
  useEffect(() => { trackPageView(location.pathname) }, [location.pathname])

  return (
    /* <Routes> is deliberately NOT keyed on the pathname. Keying it remounted
       the whole tree on every navigation — sidebar and header included — so
       the entire screen blinked out and faded back. The page-only crossfade
       lives in AppLayout's pathname-keyed motion.div; the shell stays put. */
    /* Pages inside the app shell get a boundary in AppLayout; this one catches
       the public routes (login, verify, browse, listing, policy). */
    <ErrorBoundary queryClient={queryClient}>
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        {/* Public */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/verify" element={<VerifyPage />} />
        <Route path="/onboarding" element={<RoleSelectPage />} />
        <Route path="/browse" element={<PublicBrowse />} />
        <Route path="/posts/:id" element={<div className="min-h-screen bg-background" style={{ '--sticky-offset': '5rem' }}><PublicHeader /><PostDetail /></div>} />
        <Route path="/privacy" element={<PolicyPage doc="privacy" />} />
        <Route path="/terms" element={<PolicyPage doc="terms" />} />
        <Route path="/help" element={<HelpPage />} />
        <Route path="/account-deletion" element={<AccountDeletion />} />

        {/* Admin only */}
        {/* Shared by every signed-in role, like the app's Notifications screen. */}
        <Route element={<AuthedRoute />}>
          <Route element={<AppLayout />}>
            <Route path="/notifications" element={<NotificationsPage />} />
            {/* Both sides of a thread live here — a conversation has a customer
                and a provider, so it cannot sit under either role's routes. */}
            <Route path="/messages" element={<MessagesPage />} />
            <Route path="/messages/:id" element={<MessageThread />} />
          </Route>
        </Route>

        <Route element={<AdminRoute />}>
          <Route element={<AppLayout />}>
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/admin/posts" element={<AdminPosts />} />
            <Route path="/admin/posts/:id" element={<PostDetail />} />
            <Route path="/admin/users" element={<AdminUsers />} />
            <Route path="/admin/users/:id" element={<AdminUserDetail />} />
            <Route path="/admin/categories" element={<AdminCategories />} />
            <Route path="/admin/analytics" element={<AdminAnalytics />} />
            <Route path="/admin/reports" element={<AdminReports />} />
            <Route path="/admin/profile" element={<ProfilePage />} />
          </Route>
        </Route>

        {/* Provider (and admin-providers) */}
        <Route element={<ProviderRoute />}>
          <Route element={<AppLayout />}>
            <Route path="/provider" element={<ProviderDashboard />} />
            <Route path="/provider/posts" element={<ProviderPosts />} />
            <Route path="/provider/posts/new" element={<ProviderPostForm />} />
            <Route path="/provider/posts/:id" element={<PostDetail />} />
            <Route path="/provider/posts/:id/edit" element={<ProviderPostForm />} />
            <Route path="/provider/profile" element={<ProfilePage />} />
            <Route path="/provider/company" element={<ProviderCompany />} />
            <Route path="/provider/bookings" element={<Bookings mode="provider" />} />
            <Route path="/provider/billing" element={<ProviderBilling />} />
          </Route>
        </Route>

        {/* Customer only */}
        <Route element={<CustomerRoute />}>
          <Route element={<AppLayout />}>
            <Route path="/customer" element={<CustomerDashboard />} />
            <Route path="/customer/browse" element={<CustomerBrowse />} />
            <Route path="/customer/map" element={<CustomerMap />} />
            <Route path="/customer/saved" element={<CustomerSaved />} />
            <Route path="/customer/saved-searches" element={<SavedSearchesPage />} />
            <Route path="/customer/profile" element={<ProfilePage />} />
            <Route path="/customer/bookings" element={<Bookings mode="customer" />} />
          </Route>
        </Route>

        <Route path="/" element={<RootRedirect />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
    </ErrorBoundary>
  )
}

import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '../store'

function Spinner() {
  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

/**
 * Route guard. Signed-out visitors go to login; a signed-in user who fails
 * `allow({ user, isAdmin })` goes home, where RootRedirect sends them to the
 * app that is theirs. No predicate means "any signed-in role".
 */
export function RoleRoute({ allow }) {
  const { token, user, isAdmin, isLoading } = useAuthStore()
  if (isLoading) return <Spinner />
  if (!token) return <Navigate to="/login" replace />
  if (allow && !allow({ user, isAdmin })) return <Navigate to="/" replace />
  return <Outlet />
}

/** Signed in, any role — the app has one Notifications screen, not three. */
export const AuthedRoute = () => <RoleRoute />
export const AdminRoute = () => <RoleRoute allow={({ isAdmin }) => isAdmin} />
// Admins who are also providers can access provider routes.
export const ProviderRoute = () => <RoleRoute allow={({ user, isAdmin }) => isAdmin || user?.type === 'PROVIDER'} />
export const CustomerRoute = () => <RoleRoute allow={({ user }) => user?.type === 'CUSTOMER'} />

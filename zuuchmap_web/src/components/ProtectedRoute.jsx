import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '../store'

function Spinner() {
  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

export function AdminRoute() {
  const { token, isAdmin, isLoading } = useAuthStore()
  if (isLoading) return <Spinner />
  if (!token) return <Navigate to="/login" replace />
  if (!isAdmin) return <Navigate to="/" replace />
  return <Outlet />
}

export function ProviderRoute() {
  const { token, user, isAdmin, isLoading } = useAuthStore()
  if (isLoading) return <Spinner />
  if (!token) return <Navigate to="/login" replace />
  // Admins who are also providers can access provider routes
  if (user?.type !== 'PROVIDER' && !isAdmin) return <Navigate to="/" replace />
  return <Outlet />
}

export function CustomerRoute() {
  const { token, user, isLoading } = useAuthStore()
  if (isLoading) return <Spinner />
  if (!token) return <Navigate to="/login" replace />
  if (user?.type !== 'CUSTOMER') return <Navigate to="/" replace />
  return <Outlet />
}

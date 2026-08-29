import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { usersApi } from '@/lib/api'
import { useAuthStore } from '@/store'

export const PROFILE_KEY = ['profile']

/**
 * The signed-in user's full profile — React Query `['profile']` is the single
 * source. The auth store keeps only what the login response hands back
 * (id / phone / type / is_admin) so routing can decide before this loads.
 *
 * Whatever the server says about role and admin status wins: once the profile
 * arrives the identity in the store is corrected to match, which is how a
 * revoked admin or a changed type takes effect without a re-login.
 */
export function useProfile(options = {}) {
  const token = useAuthStore((s) => s.token)
  const query = useQuery({
    queryKey: PROFILE_KEY,
    queryFn: usersApi.getProfile,
    staleTime: 30_000,
    enabled: Boolean(token),
    ...options,
  })

  useEffect(() => {
    if (query.data) useAuthStore.getState().syncIdentity(query.data)
  }, [query.data])

  return query
}

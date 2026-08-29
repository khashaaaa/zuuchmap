import { useQuery } from '@tanstack/react-query'
import { categoryApi } from '@/lib/api'

const STALE_MS = 5 * 60_000

/**
 * Category schemas, shared by every consumer. One key and one staleTime, so a
 * card in a list reads the same cache the page already filled rather than
 * refetching per mount. `admin: true` returns the unfiltered list (inactive
 * categories included) under a sub-key that the same invalidation covers.
 */
export function useCategories({ admin = false } = {}) {
  return useQuery({
    queryKey: admin ? ['categories', 'admin'] : ['categories'],
    queryFn: admin ? categoryApi.getAllForAdmin : categoryApi.getAll,
    staleTime: STALE_MS,
  })
}

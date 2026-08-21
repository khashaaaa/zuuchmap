import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import i18n from '../i18n'

/**
 * Lazy so we don't close the loop store -> queryClient -> analytics -> api -> store.
 * Reporting is fire-and-forget anyway; nothing waits on it.
 */
const report = (error, context) => {
  import('./analytics')
    .then((m) => m.reportError(error, context))
    .catch(() => {})
}

/**
 * Every read failure passes through here — this is the safety net under the
 * per-page error states, so a page nobody remembered to wire up still tells
 * the user something went wrong instead of rendering an empty list.
 *
 * The toast only fires when the query has no cached data: if we can still show
 * the previous result, a background refetch failing is not the user's problem.
 */
const queryCache = new QueryCache({
  onError: (error, query) => {
    // 401 is already handled centrally by the axios interceptor (logout + toast).
    if (error?.response?.status === 401) return

    report(error, `query:${String(query.queryKey?.[0] ?? 'unknown')}`)

    if (query.state.data !== undefined) return
    toast.error(i18n.t('common.loadFailed'), { id: `query-error-${query.queryHash}` })
  },
})

/** Mutations toast their own messages; here we only make sure they get logged. */
const mutationCache = new MutationCache({
  onError: (error, _vars, _ctx, mutation) => {
    if (error?.response?.status === 401) return
    report(error, `mutation:${String(mutation.options.mutationKey?.[0] ?? 'unknown')}`)
  },
})

export const queryClient = new QueryClient({
  queryCache,
  mutationCache,
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Must exceed the longest staleTime (5 min) or unmounted queries are
      // GC'd before their freshness window ends and refetch on every mount.
      gcTime: 10 * 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
      throwOnError: false,
    },
    mutations: {
      throwOnError: false,
    },
  },
})

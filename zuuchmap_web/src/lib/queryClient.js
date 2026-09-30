import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import i18n from '../i18n'
import { captureError } from './observability'

const report = (error, context) => captureError(error, { context })

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

const POST_KEYS = ['admin-pending', 'admin-stats', 'my-posts', 'posts', 'posts-map', 'public-stats']

/**
 * Every list a post can appear in, after anything that changes one: create,
 * edit, delete, approve, reject, feature. Only mounted queries refetch, so the
 * over-approximation costs nothing on screens that do not show the key.
 */
export function invalidatePostQueries(qc, { postId } = {}) {
  POST_KEYS.forEach((k) => qc.invalidateQueries({ queryKey: [k] }))
  if (postId != null) qc.invalidateQueries({ queryKey: ['post', String(postId)] })
}

/**
 * A listing the visitor has already been sent, found in whichever list it was
 * on: a browse page, the similar strip, the saved shelf.
 *
 * The detail page fetched the post and rendered a skeleton until it answered,
 * then started the five requests that hang off it — for a row the card they
 * had just clicked was built from. Handed to `placeholderData`, the page paints
 * at once and those requests leave together with the post's own. List rows
 * carry no `details`; that one block fills in when the real row lands.
 */
export function findListedPost(qc, id) {
  const want = String(id)
  for (const key of [['posts'], ['liked-posts']]) {
    for (const [, data] of qc.getQueriesData({ queryKey: key })) {
      const rows = Array.isArray(data) ? data : (data?.items ?? data?.posts)
      const hit = Array.isArray(rows) ? rows.find((p) => String(p?.id) === want) : undefined
      if (hit) return hit
    }
  }
  return undefined
}

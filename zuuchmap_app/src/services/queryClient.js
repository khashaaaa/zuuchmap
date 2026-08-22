import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { invalidatePostCaches } from '../utils/cacheManager';

/**
 * Safety net under the per-screen error states: every read/write failure is
 * reported, so a bug that only reproduces on a user's phone still reaches us.
 * No UI here — screens own how a failure looks.
 *
 * The import is lazy because analytics -> authHelpers -> queryClient is a cycle.
 */
const report = (error, context) => {
  if (error?.response?.status === 401) return; // handled by the axios interceptor
  import('./analytics')
    .then((m) => m.reportError(error, context))
    .catch(() => {});
};

const queryCache = new QueryCache({
  onError: (error, query) => report(error, `query:${String(query.queryKey?.[0] ?? 'unknown')}`),
});

const mutationCache = new MutationCache({
  onError: (error, _vars, _ctx, mutation) =>
    report(error, `mutation:${String(mutation.options.mutationKey?.[0] ?? 'unknown')}`),
});

// Single app-wide client. Screens read server state exclusively through React Query;
// AsyncStorage-backed service caches (map, categories) exist only as offline fallbacks
// inside queryFns.
export const queryClient = new QueryClient({
  queryCache,
  mutationCache,
  defaultOptions: {
    queries: {
      // Auth failures are terminal, not transient: the interceptor has already
      // cleared the session on 401, so retrying just spams the engine (and the
      // logs) with more guaranteed-401s. 403 is a permission answer, same deal.
      retry: (failureCount, error) => {
        const status = error?.response?.status;
        if (status === 401 || status === 403) return false;
        return failureCount < 2;
      },
      staleTime: 5 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
      refetchOnReconnect: true,
    },
    mutations: {
      retry: (failureCount, error) => {
        const status = error?.response?.status;
        if (status === 401 || status === 403) return false;
        return failureCount < 1;
      },
    },
  },
});

// One entry point for "post data changed" — clears both React Query caches and the
// AsyncStorage fallbacks so no layer serves stale posts after a mutation/socket event.
export const invalidatePostData = () => {
  invalidatePostCaches().catch(() => {});
  queryClient.invalidateQueries({ queryKey: ['posts'] });
  queryClient.invalidateQueries({ queryKey: ['post'] });
  queryClient.invalidateQueries({ queryKey: ['provider', 'mine'] });
  queryClient.invalidateQueries({ queryKey: ['map', 'posts'] });
  queryClient.invalidateQueries({ queryKey: ['admin'] });
  queryClient.invalidateQueries({ queryKey: ['liked'] });
};

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

// One entry point for "post data changed" — refreshes every query that renders
// post content plus the AsyncStorage map fallback, so no layer serves stale posts
// after a mutation/socket event.
//
// Keys under `['posts']`: browse pages, similar posts, the provider's own list
// (`['posts','mine']`) and its stats/summary. `['post']` is the detail screen.
// The admin queue (`['admin']`) is invalidated where it changes instead —
// usePostModeration and the admin socket events. `['liked']` stays here: a
// deleted or rejected post must also leave the saved list.
export const invalidatePostData = () => {
  invalidatePostCaches().catch(() => {});
  queryClient.invalidateQueries({ queryKey: ['posts'] });
  queryClient.invalidateQueries({ queryKey: ['post'] });
  queryClient.invalidateQueries({ queryKey: ['map', 'posts'] });
  queryClient.invalidateQueries({ queryKey: ['liked'] });
};

/**
 * `invalidatePostData`, a beat later and once.
 *
 * For socket events, which arrive in runs: a bulk approve is one POST_APPROVED
 * and one STATS_UPDATED per post, and each used to restart every mounted post
 * query — browse (every page scrolled so far), the map's whole pin set, the
 * saved list. Twenty approvals were forty refetches of the same data. A user's
 * own mutation still calls `invalidatePostData` directly: that is one event,
 * and they are waiting on it.
 */
let postRefreshTimer = null;
export const invalidatePostDataSoon = () => {
  clearTimeout(postRefreshTimer);
  postRefreshTimer = setTimeout(invalidatePostData, 400);
};

const rowsOf = (data) => {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.pages)) return data.pages.flatMap(rowsOf);
  return data?.items ?? data?.posts ?? [];
};

/**
 * A listing this device has already been sent, from whichever list it was on:
 * a browse page, the similar drawer, the saved list, the provider's own posts.
 *
 * The detail screen fetched the post and sat on a skeleton until it answered,
 * then started the requests that hang off it — for a row the card just tapped
 * was drawn from. Handed to `placeholderData`, the screen opens with the card's
 * content and those requests leave together with the post's own. Browse rows
 * carry no `details`; that section fills in when the full row lands. The
 * `images` test keeps out the stats rows that share the `['posts']` prefix.
 */
export const findListedPost = (postId) => {
  const want = String(postId);
  for (const prefix of [['posts'], ['liked']]) {
    for (const [, data] of queryClient.getQueriesData({ queryKey: prefix })) {
      const rows = rowsOf(data);
      const hit = Array.isArray(rows)
        ? rows.find((row) => row && typeof row === 'object' && String(row.id) === want && 'images' in row)
        : undefined;
      if (hit) return hit;
    }
  }
  return undefined;
};

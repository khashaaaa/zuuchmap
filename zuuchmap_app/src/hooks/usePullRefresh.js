import { useCallback, useState } from 'react';

/**
 * Pull-to-refresh state that spins only for a pull.
 *
 * Lists used to bind RefreshControl to React Query's `isRefetching`, which is
 * also true for every background refetch — a focus refetch, an interval, a
 * socket invalidation — so the spinner dropped over a list nobody had pulled.
 * `refresh` may return a promise; the spinner holds until it settles.
 */
export function usePullRefresh(refresh) {
    const [pulling, setPulling] = useState(false);
    const onRefresh = useCallback(async () => {
        setPulling(true);
        try { await refresh(); } catch { /* the query's own error state reports it */ } finally { setPulling(false); }
    }, [refresh]);
    return [pulling, onRefresh];
}

export default usePullRefresh;
